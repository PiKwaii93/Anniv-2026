// Real mobile components; all services are in-memory. No production writes.
import assert from 'node:assert/strict'
import test, { beforeEach, afterEach, after } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const mocks = {
  '/lib/supabase': 'export const supabase = new Proxy({}, {get(_, key) {return globalThis.__mobile.db[key]}})',
  '/auth/AuthContext': 'export const useAuth = () => globalThis.__mobile.auth',
  '/identity/PartyIdentityContext': 'export const usePartyIdentity = () => globalThis.__mobile.identity',
  '/identity/HomeIdentityOnboarding': 'export default function Onboarding(){return null}',
  '/party/PartyContext': 'export const useParty=()=>globalThis.__mobile.party; export const isPartyModuleVisible=(s,k)=>!!s[({room:"roomVisible",photos:"photosVisible",bingo:"bingoVisible",missions:"missionsVisible","beer-pong":"beerPongVisible",guests:"guestsVisible",iceberg:"icebergVisible"})[k]]',
  '/party-extras/usePartyExtras': 'export const usePartyExtras=()=>globalThis.__mobile.extras',
  '/guest/GuestContext': 'import {createContext} from "react"; export const GuestContext=createContext(null); export const useGuestOverview=()=>globalThis.__mobile.overview',
  '/identity/PartyIdentityUI': 'export const PartyIdentityBadge=()=>null; export const PartyIdentityGate=({children})=>children',
  '/photo-hunt/PhotoHuntImage': 'import React from "react"; export default function Image({alt,className}) {return React.createElement("img",{alt,className})}',
}
const entries = {
  Home: 'src/pages/Home.tsx', Play: 'src/pages/Play.tsx', Bingo: 'src/pages/Bingo.tsx',
  Capsule: 'src/pages/Capsule.tsx', Photos: 'src/pages/PhotoHunt.tsx', Shell: 'src/features/guest/GuestShell.tsx',
  Connection: 'src/features/guest/ConnectionNotice.tsx',
}
const bundle = await build({configFile:false,logLevel:'error',plugins:[{
  name:'mobile-fixtures',enforce:'pre',
  resolveId(id) {
    if(id.endsWith('virtual:mobile'))return '\0mobile'
    const key=Object.keys(mocks).find(key=>id.endsWith(key))
    if(key)return '\0fixture:'+key
  },
  load(id) {
    if(id==='\0mobile')return Object.entries(entries).map(([name,path])=>'export {default as '+name+'} from '+JSON.stringify(resolve(path))+';').join('\n')+
      'export * from '+JSON.stringify(resolve('src/features/guest/navigation.ts'))+';'+
      'export * from '+JSON.stringify(resolve('src/features/guest/capsuleDraft.ts'))+';'+
      'export * from '+JSON.stringify(resolve('src/features/party/tvStatus.ts'))+';'
    if(id.startsWith('\0fixture:'))return mocks[id.slice(9)]
  },
}],build:{ssr:'virtual:mobile',write:false,minify:false}})
await mkdir(resolve('node_modules/.cache'),{recursive:true})
const cache=await mkdtemp(resolve('node_modules/.cache/mobile-'))
for(const output of bundle.output) if(output.type==='chunk') {
  await mkdir(resolve(join(cache,output.fileName),'..'),{recursive:true})
  await writeFile(join(cache,output.fileName),output.code)
}
const ui=await import(pathToFileURL(join(cache,bundle.output.find(item=>item.isEntry).fileName)).href)
after(()=>rm(cache,{recursive:true}))

let dom,root,fixture,errors,reads,actions
const q=s=>document.querySelector(s)
const text=()=>q('#root').textContent
const button=name=>[...document.querySelectorAll('button')].find(el=>el.textContent.includes(name))
const click=async el=>{assert.ok(el);await act(async()=>el.click())}
async function render(Component,path='/') {
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Component))))
  assert.ok(q('#root').innerHTML, `Empty component: ${Component.name}; ${errors.map(e=>e.stack).join('\n')}`)
}
beforeEach(async()=>{
  dom=new JSDOM('<div id="root"></div>',{url:'https://party.test/'})
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  window.scrollTo=()=>{}
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true}
  window.HTMLDialogElement.prototype.close=function(){this.open=false}
  errors=[];reads=[];actions=[]
  root=createRoot(q('#root'),{onUncaughtError:e=>errors.push(e)})
  const settings={phase:'live',featuredModule:'photos',roomVisible:true,photosVisible:true,bingoVisible:true,missionsVisible:true,beerPongVisible:true,guestsVisible:true,icebergVisible:true}
  const extrasSettings={capsule_visible:true,capsule_open:true,capsule_reveal_at:'2026-10-25T11:00:00Z',jukebox_visible:true,jukebox_open:true,duos_visible:true,duos_open:true}
  const data={settings:extrasSettings,phase:'live',capsule:{own:null,revealed:false},duo:null,waiting:false,duo_attempts:0,duo_stats:{completed:0},songs:[],song_count:0}
  fixture=globalThis.__mobile={
    auth:{isAdmin:false},
    identity:{identity:{playerKey:'guest:fixture',playerName:'Camille',sessionToken:'fixture-token'},loading:false},
    party:{settings,loading:false},
    overview:{room:{phase:'open',prompt:'Qui veut jouer ?'},extras:data},
    extras:{data,error:'',busy:false,act:async(action,payload)=>{actions.push({action,payload});return true},refresh:async()=>true},
    ownPhotos:[{challengeId:'c1',status:'pending'}],
    challenges:[{id:'c1',prompt:'Photo ensemble',hint:'',sort_order:0},{id:'c2',prompt:'Photo du gâteau',hint:'',sort_order:1}],
    db:{
      from(table){
        reads.push(table)
        const rows={live_vote_public_state:{state:fixture.overview.room},bingo_prompts:Array.from({length:16},(_,i)=>({id:'b'+i,text:'Situation numéro '+i})),photo_hunt_challenges:fixture.challenges,photo_hunt_submissions:[]}
        assert.ok(Object.hasOwn(rows,table),'Unexpected read '+table)
        const value={data:rows[table],error:null}
        const query={select(){return query},eq(){return query},order(){return query},limit(){return query},maybeSingle:async()=>value,then(a,b){return Promise.resolve(value).then(a,b)}}
        return query
      },
      rpc:async(name,args)=>{reads.push(name);assert.equal(name,'get_photo_hunt_player_state','Home must not claim or assign missions');assert.equal(args.p_player_key,fixture.identity.identity.playerKey);return {data:{ok:true,submissions:fixture.ownPhotos},error:null}},
      channel:()=>{const c={on(){return c},subscribe(){return c}};return c},
      removeChannel:async()=>{},
    }
  }
})
afterEach(async()=>{
  await act(async()=>root.unmount())
  assert.deepEqual(errors,[])
  dom.window.close()
  delete globalThis.window;delete globalThis.document;delete globalThis.HTMLElement;delete globalThis.__mobile
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
})

test('four navigation entries honor visibility and secondary routes',()=>{
  assert.deepEqual(ui.guestTabs(fixture.party.settings,fixture.extras.data.settings).map(t=>t.label),['Accueil','Jouer','Photos','Musique'])
  fixture.party.settings.photosVisible=false
  fixture.extras.data.settings.jukebox_visible=false
  assert.deepEqual(ui.guestTabs(fixture.party.settings,fixture.extras.data.settings).map(t=>t.label),['Accueil','Jouer'])
  for(const path of ['/bingo','/missions','/duos','/room','/beer-pong'])assert.equal(ui.activeGuestTab(path),'/play')
  for(const path of ['/screen','/qr','/admin','/admin/photos','/admin/login'])assert.equal(ui.isGuestPath(path),false)
})
test('all closed modules leave only Home; ended duos do not create a Games tab',()=>{
  for(const key of Object.keys(fixture.party.settings))if(key.endsWith('Visible'))fixture.party.settings[key]=false
  fixture.party.settings.phase='ended'
  assert.deepEqual(ui.guestTabs(fixture.party.settings,{...fixture.extras.data.settings,jukebox_visible:false}).map(t=>t.path),['/'])
})
test('guest shell keeps four reachable tabs and reports the active game',async()=>{
  await render(ui.Shell,'/bingo')
  assert.equal(document.querySelectorAll('.guest-nav a').length,4)
  assert.equal(q('.guest-nav [aria-current]').getAttribute('href'),'/play')
  assert.ok(q('.guest-live-link'))
  assert.deepEqual(actions,[])
})
test('onboarding prevents navigation behind its identity dialog',async()=>{
  fixture.identity.identity=null
  await render(ui.Shell,'/')
  assert.ok(q('.guest-nav').hasAttribute('inert'))
  assert.ok(q('.guest-topbar').hasAttribute('inert'))
})
test('Home prioritizes the live question over featured Photos without assigning a mission',async()=>{
  await render(ui.Home)
  assert.match(q('.guest-now').textContent,/À toi de voter/)
  assert.equal(q('.guest-now a').getAttribute('href'),'/room')
  assert.match(text(),/1 photo en validation/)
  assert.equal(document.querySelectorAll('.module-card').length,0)
  assert.equal(q('a[href="/admin"]'),null)
  assert.ok(!reads.includes('get_secret_mission_state'))
  assert.deepEqual(actions,[])
})
test('Home does not invent personal shortcuts without actual activity',async()=>{
  fixture.ownPhotos=[]
  await render(ui.Home)
  assert.ok(!text().includes('Pour toi'))
})
test('Home shows a ready duo without revealing the secret challenge',async()=>{
  fixture.extras.data.duo={status:'active',partner:'Léa',prompt:'SECRET CHALLENGE'}
  await render(ui.Home)
  assert.match(text(),/Ton duo avec Léa/)
  assert.ok(!text().includes('SECRET CHALLENGE'))
})
test('ended party prioritizes memories, not an obsolete active question',async()=>{
  fixture.party.settings.phase='ended'
  await render(ui.Home)
  assert.equal(q('.guest-now a').getAttribute('href'),'/hall-of-fame')
})
test('Games respects disabled modules and keeps duos discoverable',async()=>{
  fixture.party.settings.bingoVisible=false
  await render(ui.Play,'/play')
  assert.equal(q('a[href="/bingo"]'),null)
  assert.ok(q('a[href="/duos"]'))
})
test('Bingo grid opens a readable dialog, confirms the same cell and preserves it in list view',async()=>{
  await render(ui.Bingo,'/bingo')
  const cell=q('.bingo-cell')
  const fullText=cell.querySelector('.bingo-cell__text').textContent
  await click(cell)
  assert.equal(q('dialog h2').textContent,fullText)
  await click(button('Ça s’est passé'))
  assert.equal(q('dialog'),null)
  assert.equal(q('.bingo-cell').getAttribute('aria-pressed'),'true')
  await click(button('Liste lisible'))
  assert.equal(document.querySelectorAll('.bingo-readable-list .bingo-cell').length,16)
  assert.equal(q('.bingo-cell').getAttribute('aria-pressed'),'true')
  const saved=JSON.parse(window.localStorage.getItem('anniv-2026-bingo-v1'))
  assert.equal(saved.cells[0].text,fullText);assert.equal(saved.cells[0].checked,true)
})
test('four original Bingo positions still constitute a winning line',async()=>{
  await render(ui.Bingo,'/bingo')
  await click(button('Liste lisible'))
  for(let i=0;i<4;i++)await click(document.querySelectorAll('.bingo-cell')[i])
  assert.match(text(),/BINGO !/)
  assert.equal(document.querySelectorAll('.bingo-cell--winning').length,4)
})
test('Photos renders one view and one suggested challenge, then own submissions via URL',async()=>{
  await render(ui.Photos,'/photos')
  assert.equal(document.querySelectorAll('.photo-hunt__spotlight-card').length,1)
  assert.equal(q('.photo-hunt__gallery-section'),null)
  await click(button('Mes photos'))
  assert.match(text(),/Photo ensemble/)
  assert.equal(q('.photo-hunt__spotlight-card'),null)
  assert.equal(q('.photo-hunt__challenge-list'),null)
  await click(button('Galerie'))
  assert.ok(q('.photo-hunt__gallery-section'));assert.equal(q('.photo-hunt__status-panel'),null)
})
test('direct link to own photos does not bury them under challenges',async()=>{
  await render(ui.Photos,'/photos?view=mine')
  assert.ok(q('.photo-hunt__status-panel'))
  assert.equal(q('.photo-hunt__spotlight'),null)
})
test('suggested photo challenge occurs only once and the full progress total is retained',async()=>{
  await render(ui.Photos,'/photos')
  const suggestion=q('.photo-hunt__spotlight-card strong').textContent
  const others=[...document.querySelectorAll('.photo-hunt__challenge strong')].map(el=>el.textContent)
  assert.ok(!others.includes(suggestion))
  assert.equal(others.length,1)
  assert.match(text(),/Autres défis/)
  assert.match(text(),/1 \/ 2 tentés/)
  assert.ok(!text().includes('Choisis-en un'))
})
test('when every challenge is submitted the complete read-only list remains',async()=>{
  fixture.ownPhotos=[{challengeId:'c1',status:'pending'},{challengeId:'c2',status:'approved'}]
  await render(ui.Photos,'/photos')
  assert.equal(q('.photo-hunt__spotlight'),null)
  assert.match(text(),/Tous les défis/)
  assert.equal(document.querySelectorAll('.photo-hunt__challenge:disabled').length,2)
})
test('a sole suggested challenge does not create an empty secondary section',async()=>{
  fixture.ownPhotos=[];fixture.challenges=fixture.challenges.slice(0,1)
  await render(ui.Photos,'/photos')
  assert.ok(q('.photo-hunt__spotlight-card'))
  assert.equal(q('.photo-hunt__challenge-list'),null)
  assert.ok(!text().includes('Autres défis'))
})
test('empty photo catalogue displays an explicit waiting state',async()=>{
  fixture.ownPhotos=[];fixture.challenges=[]
  await render(ui.Photos,'/photos')
  assert.match(text(),/Les défis arrivent bientôt/)
})
test('offline notice responds to device events without replaying any action or remounting the page',async()=>{
  let online=true
  Object.defineProperty(window.navigator,'onLine',{configurable:true,get:()=>online})
  const Page=()=>React.createElement(React.Fragment,null,React.createElement(ui.Connection),React.createElement('textarea',{defaultValue:'Texte non envoyé'}))
  await render(Page)
  const input=q('textarea'),status=q('[role="status"]')
  assert.equal(status.textContent,'')
  input.value='Mon brouillon en cours'
  online=false
  await act(async()=>window.dispatchEvent(new window.Event('offline')))
  assert.match(status.textContent,/Connexion perdue/)
  assert.equal(status.getAttribute('aria-live'),'polite')
  online=true
  await act(async()=>window.dispatchEvent(new window.Event('online')))
  assert.equal(status.textContent,'')
  assert.equal(q('textarea'),input)
  assert.equal(input.value,'Mon brouillon en cours')
  assert.deepEqual(actions,[]);assert.deepEqual(reads,[])
})
test('offline first render works and network subscriptions are cleaned up',async()=>{
  Object.defineProperty(window.navigator,'onLine',{configurable:true,value:false})
  const added=[],removed=[],add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window)
  window.addEventListener=(type,fn,...args)=>{if(['online','offline'].includes(type))added.push([type,fn]);add(type,fn,...args)}
  window.removeEventListener=(type,fn,...args)=>{if(['online','offline'].includes(type))removed.push([type,fn]);remove(type,fn,...args)}
  await render(ui.Connection)
  assert.match(text(),/Connexion perdue/)
  await act(async()=>root.render(null))
  assert.equal(added.length,2);assert.deepEqual(removed,added)
})
test('Photos tabs share the content width and desktop columns do not override the mobile breakpoint',async()=>{
  const guestCss=await readFile('src/features/guest/guest.css','utf8')
  const photoCss=await readFile('src/pages/PhotoHunt.css','utf8')
  assert.match(guestCss,/\.guest-app \.photo-hunt > \.guest-tabs \{ width: min\(1160px, 100%\); margin-inline: auto;/)
  assert.ok(!guestCss.includes('.guest-app .photo-hunt__challenge-list'))
  assert.match(photoCss,/\.photo-hunt__challenge-list \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
  assert.match(photoCss,/@media \(max-width: 760px\)[\s\S]*\.photo-hunt__challenge-list \{\s*grid-template-columns: 1fr;/)
})
test('photo composer is a native modal and restores page scrolling on close',async()=>{
  await render(ui.Photos,'/photos')
  await click(q('.photo-hunt__spotlight-card'))
  assert.equal(q('dialog').open,true)
  assert.equal(document.body.style.overflow,'hidden')
  await click(q('.photo-hunt-composer__close'))
  assert.equal(q('dialog'),null);assert.equal(document.body.style.overflow,'')
})
test('capsule draft is restored only for its owner and cleared after successful seal',async()=>{
  const draft={message:'Brouillon privé',memory:'',prediction:''}
  ui.writeCapsuleDraft(window.localStorage,'guest:fixture',null,draft)
  assert.equal(ui.readCapsuleDraft(window.localStorage,'guest:other',null),null)
  await render(ui.Capsule,'/capsule')
  assert.equal(q('textarea').value,'Brouillon privé')
  assert.equal(q('details').open,false)
  await act(async()=>q('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(actions[0].action,'capsule_save')
  assert.equal(actions[0].payload.message,'Brouillon privé')
  assert.equal(window.localStorage.getItem(ui.capsuleDraftKey('guest:fixture')),null)
})
test('failed capsule save preserves local draft and form',async()=>{
  const draft={message:'À garder',memory:'Souvenir',prediction:''}
  ui.writeCapsuleDraft(window.localStorage,'guest:fixture',null,draft)
  fixture.extras.act=async()=>false
  await render(ui.Capsule,'/capsule')
  await act(async()=>q('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))
  assert.equal(q('textarea').value,'À garder')
  assert.ok(window.localStorage.getItem(ui.capsuleDraftKey('guest:fixture')))
})
test('draft expiration, newer sealed letter and malformed storage never replace saved content',()=>{
  const storage=window.localStorage,key='guest:fixture',draft={message:'Old',memory:'',prediction:''}
  ui.writeCapsuleDraft(storage,key,null,draft)
  assert.equal(ui.readCapsuleDraft(storage,key,'new-server-version'),null)
  ui.writeCapsuleDraft(storage,key,null,draft)
  assert.equal(ui.readCapsuleDraft(storage,key,null,Date.now()+8*86400000),null)
  storage.setItem(ui.capsuleDraftKey(key),'broken JSON')
  assert.equal(ui.readCapsuleDraft(storage,key,null),null)
  const broken={getItem(){throw Error('disabled')},setItem(){throw Error('quota')}}
  assert.equal(ui.readCapsuleDraft(broken,key,null),null)
  assert.equal(ui.writeCapsuleDraft(broken,key,null,draft),false)
})
test('TV status explains room priority, announcements and ending without changing routing',()=>{
  assert.deepEqual(ui.tvStatus('live','photos','open',false),{current:'La Salle',next:'Photos'})
  assert.deepEqual(ui.tvStatus('live','photos','idle',false),{current:'Photos',next:null})
  assert.deepEqual(ui.tvStatus('live','photos','idle',true),{current:'Annonce en cours',next:'Photos'})
  assert.deepEqual(ui.tvStatus('ended','photos','open',false),{current:'Générique / palmarès',next:null})
})
test('mobile CSS reserves safe areas, readable Bingo and input sizes without affecting TV',async()=>{
  const css=await readFile('src/features/guest/guest.css','utf8')
  assert.match(css,/safe-area-inset-bottom/)
  assert.match(css,/\.guest-app \.bingo-cell \.bingo-cell__text \{ font-size: 14px/)
  assert.match(css,/\.guest-app textarea, \.guest-app select \{ font-size: 16px/)
  assert.ok(!css.includes('.party-screen '))
})
