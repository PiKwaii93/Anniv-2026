import assert from 'node:assert/strict'
import test, {beforeEach,afterEach,after} from 'node:test'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import React,{act} from 'react'
import {MemoryRouter} from 'react-router-dom'
import {JSDOM} from 'jsdom'
import {build} from 'vite'
const bootstrap=new JSDOM('<div/>')
globalThis.window=bootstrap.window;globalThis.document=bootstrap.window.document
const {createRoot}=await import('react-dom/client')
bootstrap.window.close();delete globalThis.window;delete globalThis.document
const bundle=await build({configFile:false,logLevel:'error',plugins:[{
  name:'identity-test',enforce:'pre',
  resolveId(id){
    if(id.endsWith('virtual:identity'))return '\0identity'
    if(id.endsWith('/lib/supabase'))return '\0db'
    if(id.endsWith('/guests/GuestsContext'))return '\0guests'
    if(id.endsWith('/auth/AuthContext'))return '\0auth'
  },
  load(id){
    if(id==='\0db')return 'export const supabase={rpc:(...args)=>globalThis.__sessions.rpc(...args)}'
    if(id==='\0guests')return 'export const useGuests=()=>globalThis.__sessions.guests'
    if(id==='\0auth')return 'export const useAuth=()=>globalThis.__sessions.auth'
    if(id==='\0identity')return `export {default as Provider,usePartyIdentity,PARTY_IDENTITY_STORAGE_KEY,MISSION_IDENTITY_STORAGE_KEY,ROOM_IDENTITY_STORAGE_KEY} from ${JSON.stringify(resolve('src/features/identity/PartyIdentityContext.tsx'))}; export {default as Admin} from ${JSON.stringify(resolve('src/features/identity/AdminGuestSessions.tsx'))};`
  },
}],build:{ssr:'virtual:identity',write:false,minify:false}})
await mkdir(resolve('node_modules/.cache'),{recursive:true})
const cache=await mkdtemp(resolve('node_modules/.cache/identity-'))
for(const out of bundle.output)if(out.type==='chunk')await writeFile(join(cache,out.fileName),out.code)
const ui=await import(pathToFileURL(join(cache,bundle.output.find(o=>o.isEntry).fileName)).href)
after(()=>rm(cache,{recursive:true}))
let dom,root,fixture,calls,context,timers
const stored={playerKey:'guest:qa',sessionToken:'token-qa'}
const keys=[ui.PARTY_IDENTITY_STORAGE_KEY,ui.MISSION_IDENTITY_STORAGE_KEY,ui.ROOM_IDENTITY_STORAGE_KEY]
const button=s=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(s))
const click=async b=>{assert.ok(b);await act(async()=>b.click())}
const emit=async type=>act(async()=>window.dispatchEvent(new window.Event(type)))
function Consumer(){context=ui.usePartyIdentity();return React.createElement('div',null,context.loading?'loading':context.identity?.playerName??'disconnected',context.error)}
async function render(admin=false,path='/chat'){
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},admin?React.createElement(ui.Admin):React.createElement(ui.Provider,null,React.createElement(Consumer)))))
}
beforeEach(()=>{
  dom=new JSDOM('<div id="root"></div>',{url:'https://identity.test/',pretendToBeVisual:true})
  globalThis.window=dom.window;globalThis.document=dom.window.document
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  timers=[];window.setInterval=(f,ms)=>{timers.push({f,ms});return timers.length};window.clearInterval=()=>{}
  root=createRoot(document.querySelector('#root'));calls=[]
  fixture=globalThis.__sessions={auth:{isAdmin:true},guests:{guests:[{id:'qa',name:'Camille',status:'confirmed',plusOnes:[]}],loading:false},valid:true,claimError:null,claimCode:null,
    rpc:async(name,args)=>{calls.push({name,args});if(name==='party_identity_is_valid')return {data:fixture.valid,error:fixture.checkError};if(name==='claim_party_identity')return {data:fixture.claimCode?{ok:false,code:fixture.claimCode}:{ok:true,playerName:'Camille'},error:fixture.claimError};return {data:{ok:true,disconnected:9},error:fixture.adminError}}
  }
})
afterEach(async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.__sessions})
test('button invisible to non-admin and sends nothing',async()=>{fixture.auth.isAdmin=false;await render(true);assert.equal(document.querySelector('button'),null);assert.equal(calls.length,0)})
test('reset requires explicit confirmation; cancel has no side effect',async()=>{await render(true);await click(button('Déconnecter'));assert.equal(calls.length,0);await click(button('Annuler'));assert.equal(calls.length,0);assert.equal(button('Confirmer'),undefined)})
test('admin confirmation sends one reset and shows result',async()=>{await render(true);await click(button('Déconnecter'));await click(button('Confirmer'));assert.deepEqual(calls,[{name:'admin_disconnect_party_guests',args:{p_confirm:true}}]);assert.match(document.body.textContent,/9 identités libérées/);assert.equal(button('Confirmer'),undefined)})
test('network failure is not reported as successful reset',async()=>{fixture.adminError={message:'Offline'};await render(true);await click(button('Déconnecter'));await click(button('Confirmer'));assert.match(document.querySelector('[role=alert]').textContent,/Impossible/);assert.equal(document.querySelector('[role=status]'),null)})
test('duplicate click while reset pending is ignored',async()=>{let finish;fixture.rpc=async(...args)=>{calls.push(args);return new Promise(r=>finish=r)};await render(true);await click(button('Déconnecter'));await act(async()=>{button('Confirmer').click();button('Confirmer').click()});assert.equal(calls.length,1);await act(async()=>finish({data:{ok:true,disconnected:1},error:null}));assert.match(document.body.textContent,/1 identité libérée\./)})
test('revoked saved identity is cleared, including legacy storage',async()=>{keys.forEach(k=>window.localStorage.setItem(k,JSON.stringify(stored)));fixture.claimCode='INVALID_SESSION';await render();assert.equal(context.identity,null);keys.forEach(k=>assert.equal(window.localStorage.getItem(k),null))})
test('visible page detects revocation without reload and does not reclaim',async()=>{keys.forEach(k=>window.localStorage.setItem(k,JSON.stringify(stored)));await render();assert.equal(context.identity.playerName,'Camille');const claims=calls.filter(c=>c.name==='claim_party_identity').length;fixture.valid=false;await act(async()=>timers.find(t=>t.ms===10000).f());assert.equal(context.identity,null);assert.match(context.error,/déconnectée/);keys.forEach(k=>assert.equal(window.localStorage.getItem(k),null));assert.equal(calls.filter(c=>c.name==='claim_party_identity').length,claims)})
test('connection errors retain identity and credentials',async()=>{window.localStorage.setItem(keys[0],JSON.stringify(stored));await render();fixture.checkError={message:'Offline'};fixture.valid=false;await emit('focus');assert.equal(context.identity.playerName,'Camille');assert.notEqual(window.localStorage.getItem(keys[0]),null)})
test('online event validates revoked sessions',async()=>{window.localStorage.setItem(keys[0],JSON.stringify(stored));await render();fixture.valid=false;await emit('online');assert.equal(context.identity,null)})
test('startup network failure preserves credentials and online retry restores session',async()=>{window.localStorage.setItem(keys[0],JSON.stringify(stored));fixture.claimError={message:'Offline'};fixture.checkError={message:'Offline'};const old=console.error;console.error=()=>{};try{await render()}finally{console.error=old}assert.notEqual(window.localStorage.getItem(keys[0]),null);fixture.checkError=null;await emit('online');assert.equal(context.identity.playerName,'Camille')})
test('admin and TV pages do not perform guest identity requests',async()=>{window.localStorage.setItem(keys[0],JSON.stringify(stored));await render(false,'/admin/guests');assert.equal(calls.length,0)})
test('late invalidation response cannot erase a replacement identity',async()=>{window.localStorage.setItem(keys[0],JSON.stringify(stored));await render();let finish;fixture.rpc=async()=>new Promise(r=>finish=r);await emit('focus');const next={...stored,sessionToken:'replacement'};window.localStorage.setItem(keys[0],JSON.stringify(next));await act(async()=>finish({data:false,error:null}));assert.equal(JSON.parse(window.localStorage.getItem(keys[0])).sessionToken,'replacement')})
