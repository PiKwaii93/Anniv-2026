import assert from 'node:assert/strict'
import test, { beforeEach, afterEach, after } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'
const boot = new JSDOM('<div/>')
globalThis.window=boot.window; globalThis.document=boot.window.document
const {createRoot}=await import('react-dom/client')
boot.window.close(); delete globalThis.window; delete globalThis.document
const bundle=await build({configFile:false,logLevel:'error',plugins:[{
  name:'mission-check-test',enforce:'pre',
  resolveId(id){
    if(id.endsWith('virtual:mission-check'))return '\0entry'
    if(id.endsWith('/lib/supabase'))return '\0db'
    if(id.endsWith('/auth/AuthContext'))return '\0auth'
    if(id.endsWith('/guests/GuestsContext'))return '\0guests'
  },
  load(id){
    if(id==='\0auth')return 'export const useAuth=()=>({isAdmin:false})'
    if(id==='\0guests')return 'export const useGuests=()=>({loading:false,guests:globalThis.__mission.guests})'
    if(id==='\0db')return `export const supabase={rpc:(...args)=>{const p=globalThis.__mission.rpc(...args);p.abortSignal=()=>p;return p},from:()=>{const q={select:()=>q,order:()=>q,then:fn=>Promise.resolve({data:[],error:null}).then(fn)};return q},channel:()=>{const c={on:()=>c,subscribe:()=>c};return c},removeChannel:async()=>{}}`
    if(id==='\0entry')return `export {default as Validation} from ${JSON.stringify(resolve('src/features/missions/MissionValidation.tsx'))};export {default as Missions} from ${JSON.stringify(resolve('src/pages/SecretMissions.tsx'))};`
  },
}],build:{ssr:'virtual:mission-check',write:false,minify:false}})
await mkdir(resolve('node_modules/.cache'),{recursive:true})
const cache=await mkdtemp(resolve('node_modules/.cache/mission-check-'))
for(const out of bundle.output)if(out.type==='chunk')await writeFile(join(cache,out.fileName),out.code)
const ui=await import(pathToFileURL(join(cache,bundle.output.find(o=>o.isEntry).fileName)).href)
after(()=>rm(cache,{recursive:true}))
let dom,root,f,calls,timers,changes
const identity={playerKey:'guest:a',sessionToken:'token-a'}
const mission={id:'m1',assignedAt:'2026-09-04T10:00:00+00:00',text:'Fais applaudir la salle.',difficulty:'easy'}
const players=[{key:'guest:a',name:'Adam',detail:'Invité'},{key:'guest:b',name:'Léa',detail:'Invitée'}]
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text))
const click=async el=>{assert.ok(el);await act(async()=>el.click())}
const writes=()=>calls.filter(c=>c.name!=='get_secret_mission_checks'&&c.name!=='get_secret_mission_state')
const text=()=>document.body.textContent
async function render(parent=false,props={}){
  await act(async()=>root.render(React.createElement(MemoryRouter,null,parent?React.createElement(ui.Missions):React.createElement(ui.Validation,{key:identity.playerKey,identity,mission,revealed:true,players,onChange:()=>changes++,...props}))))
}
async function choose(){
  await click(button('Faire valider'))
  await act(async()=>{const el=document.querySelector('select');el.value='guest:b';el.dispatchEvent(new window.Event('change',{bubbles:true}))})
}
beforeEach(()=>{
  dom=new JSDOM('<div id="root"/>',{url:'https://mission.test/missions',pretendToBeVisual:true})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true})
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  timers=[];window.setInterval=(fn,ms)=>{timers.push({fn,ms});return timers.length};window.clearInterval=()=>{}
  window.confirm=()=>true
  root=createRoot(document.querySelector('#root'));calls=[];changes=0
  f=globalThis.__mission={checks:{ok:true,open:true,own:null,incoming:[]},state:{ok:true,playerName:'Adam',completedCount:0,skipsRemaining:1,mission:{...mission}},
    guests:[{id:'a',name:'Adam',status:'confirmed',plusOnes:[]},{id:'b',name:'Léa',status:'confirmed',plusOnes:[]}],
    rpc:async(name,args)=>{
      calls.push({name,args})
      if(name==='get_secret_mission_checks')return {data:structuredClone(f.checks),error:f.readError}
      if(name==='get_secret_mission_state')return {data:structuredClone(f.state),error:null}
      if(f.failure)return {data:{ok:false,code:f.failure},error:null}
      if(name==='request_secret_mission_check')f.checks.own={id:args.p_request_id,status:'pending',reviewerName:'Léa',missionId:mission.id,assignedAt:mission.assignedAt}
      if(name==='cancel_secret_mission_check')f.checks.own=null
      if(name==='decide_secret_mission_check')f.checks.incoming=[]
      if(name==='skip_secret_mission')return {data:{...f.state,skipsRemaining:0,mission:{...mission,id:'m2'}},error:null}
      return {data:{ok:true},error:null}
    },
  }
})
afterEach(async()=>{await act(async()=>root.unmount());dom.window.close();delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.__mission})
test('witness selection is explicit and excludes the author',async()=>{
  await render();assert.equal(writes().length,0);await click(button('Faire valider'))
  assert.equal(document.querySelector('option[value="guest:a"]'),null)
  assert.equal(document.querySelector('label[for="mission-witness"]').textContent,'Qui a vu ta mission accomplie ?')
  assert.equal(button('Demander la validation').disabled,true)
})
test('request waits for witness instead of self-awarding',async()=>{
  await render();await choose();await click(button('Demander la validation'))
  assert.equal(writes().length,1);assert.equal(writes()[0].name,'request_secret_mission_check')
  assert.equal(writes()[0].args.p_reviewer_key,'guest:b');assert.equal(writes()[0].args.p_assigned_at,mission.assignedAt)
  assert.match(text(),/En attente de Léa/);assert.equal(f.state.completedCount,0)
})
test('double submission only sends one request',async()=>{
  const original=f.rpc;let finish
  f.rpc=(name,args)=>name==='request_secret_mission_check'?(calls.push({name,args}),new Promise(resolve=>finish=()=>resolve({data:{ok:true}}))):original(name,args)
  await render();await choose()
  await act(async()=>{const form=document.querySelector('form');form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))})
  assert.equal(writes().length,1);await act(async()=>finish())
})
test('unknown network result retries the same request UUID',async()=>{
  f.failure='NETWORK';await render();await choose();await click(button('Demander la validation'))
  const id=writes()[0].args.p_request_id;assert.match(text(),/Action non confirmée/)
  f.failure=null;await click(button('Demander la validation'));assert.equal(writes()[1].args.p_request_id,id)
})
test('pending request can be cancelled without consuming a joker',async()=>{
  f.checks.own={id:'r1',status:'pending',reviewerName:'Léa',missionId:mission.id,assignedAt:mission.assignedAt}
  await render();assert.equal(button('Faire valider'),undefined);await click(button('Annuler la demande'))
  assert.equal(writes()[0].name,'cancel_secret_mission_check');assert.equal(f.state.skipsRemaining,1)
  assert.ok(button('Faire valider'))
})
test('witness must attest before approving',async()=>{
  f.checks.incoming=[{id:'r2',playerName:'Sarah',text:'Obtenir une ovation.'}]
  await render();assert.equal(button('Confirmer la réussite').disabled,true)
  await click(document.querySelector('input[type="checkbox"]'));await click(button('Confirmer la réussite'))
  assert.deepEqual(writes()[0],{name:'decide_secret_mission_check',args:{p_player_key:'guest:a',p_session_token:'token-a',p_request_id:'r2',p_approve:true}})
  assert.match(text(),/Le joueur a reçu son point/)
})
test('witness may refuse without attesting or awarding a point',async()=>{
  f.checks.incoming=[{id:'r2',playerName:'Sarah',text:'Obtenir une ovation.'}]
  await render();await click(button('Je ne peux pas confirmer'))
  assert.equal(writes()[0].args.p_approve,false);assert.match(text(),/Aucun point attribué/)
})
test('stale or unauthorized decisions never display success',async()=>{
  f.failure='NOT_REVIEWER';f.checks.incoming=[{id:'r2',playerName:'Sarah',text:'Obtenir une ovation.'}]
  await render();await click(document.querySelector('input'));await click(button('Confirmer la réussite'))
  assert.match(document.querySelector('[role="alert"]').textContent,/Seul le témoin/)
  assert.equal(document.querySelector('[role="status"]'),null)
})
test('refusal is explained and allows a new request for the same mission',async()=>{
  f.checks.own={id:'r1',status:'rejected',reviewerName:'Léa',missionId:mission.id,assignedAt:mission.assignedAt}
  await render();assert.match(text(),/n’a pas confirmé/);assert.ok(button('Faire valider'))
})
test('hidden mission does not expose witness selection, closed games cannot award',async()=>{
  await render(false,{revealed:false});assert.equal(button('Faire valider'),undefined)
  f.checks.open=false;f.checks.incoming=[{id:'r2',playerName:'Sarah',text:'Secret'}]
  await act(async()=>{for(const timer of timers)await timer.fn()})
  assert.equal(button('Confirmer la réussite').disabled,true);assert.equal(button('Je ne peux pas confirmer').disabled,true)
})
test('background tab does not poll witness requests',async()=>{
  await render();calls.length=0
  Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true})
  await act(async()=>{for(const timer of timers)await timer.fn()})
  assert.equal(calls.length,0)
})
test('mission restore succeeds, witness approval updates score and hides next mission without reload',async()=>{
  localStorage.setItem('anniv-2026-secret-mission-identity-v1',JSON.stringify(identity))
  await render(true);assert.ok(button('Révéler ma mission'));await click(button('Révéler ma mission'))
  assert.ok(document.querySelector('.mission-card--revealed'))
  f.state={...f.state,completedCount:1,mission:{...mission,id:'m2',text:'Nouvelle mission'}}
  await act(async()=>{for(const timer of timers.filter(t=>t.ms===8000))await timer.fn()})
  assert.match(text(),/Mission confirmée par ton témoin/)
  assert.ok(document.querySelector('.mission-card--hidden'))
  assert.equal(document.querySelector('.missions-agent-bar__score strong').textContent,'1')
  assert.ok(!calls.some(c=>c.name==='complete_secret_mission'))
})
test('migration keeps validation private and disables the old self-award endpoint',async()=>{
  const sql=await readFile('supabase/migrations/20260904102534_mission_peer_validation.sql','utf8')
  assert.match(sql,/enable row level security/);assert.match(sql,/on delete cascade/)
  assert.match(sql,/VALIDATION_REQUIRED/);assert.match(sql,/pg_advisory_xact_lock_shared/)
  assert.match(sql,/p\.assigned_at is distinct from v\.assigned_at/)
  assert.match(sql,/create unique index mission_validation_one_pending/)
})
