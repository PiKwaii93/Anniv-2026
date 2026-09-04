// Real mobile components; all services are in-memory. No production writes.
import assert from 'node:assert/strict'
import test, { beforeEach, afterEach, after } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

// Initialize React's browser event support before Vite changes NODE_ENV.
const bootstrapDOM=new JSDOM('<div></div>')
globalThis.window=bootstrapDOM.window;globalThis.document=bootstrapDOM.window.document
const { createRoot }=await import('react-dom/client')
bootstrapDOM.window.close();delete globalThis.window;delete globalThis.document

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
  Chat: 'src/pages/PartyChat.tsx',
  Onboarding: 'src/features/identity/HomeIdentityOnboarding.tsx',
  AdminLogin: 'src/pages/AdminLogin.tsx',
}
const bundle = await build({configFile:false,logLevel:'error',plugins:[{
  name:'mobile-fixtures',enforce:'pre',
  resolveId(id) {
    if(id.endsWith('virtual:mobile'))return '\0mobile'
    if(id==='./PartyIdentityContext')return '\0fixture:/identity/PartyIdentityContext'
    const key=Object.keys(mocks).find(key=>id.endsWith(key))
    if(key)return '\0fixture:'+key
  },
  load(id) {
    if(id==='\0mobile')return Object.entries(entries).map(([name,path])=>'export {default as '+name+'} from '+JSON.stringify(resolve(path))+';').join('\n')+
      'export * from '+JSON.stringify(resolve('src/features/guest/navigation.ts'))+';'+
      'export * from '+JSON.stringify(resolve('src/features/guest/capsuleDraft.ts'))+';'+
      'export * from '+JSON.stringify(resolve('src/features/identity/PartyIdentityUI.tsx'))+';'+
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
function AdminAccessProbe({Component}) {
  const location=useLocation()
  return React.createElement(React.Fragment,null,React.createElement(Component),React.createElement('output',{'data-testid':'admin-location'},JSON.stringify({path:location.pathname,from:location.state?.from})))
}
async function render(Component,path='/') {
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Component))))
  assert.ok(q('#root').innerHTML, `Empty component: ${Component.name}; ${errors.map(e=>e.stack).join('\n')}`)
}
beforeEach(async()=>{
  dom=new JSDOM('<div id="root"></div>',{url:'https://party.test/',pretendToBeVisual:true})
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
    identity:{identity:{playerKey:'guest:fixture',playerName:'Camille',sessionToken:'fixture-token'},loading:false,availablePlayers:[],claimIdentity:async()=>{actions.push('claimIdentity');return true}},
    party:{settings,loading:false},
    overview:{room:{phase:'open',prompt:'Qui veut jouer ?'},extras:data},
    extras:{data,error:'',busy:false,act:async(action,payload)=>{actions.push({action,payload});return true},refresh:async()=>true},
    ownPhotos:[{challengeId:'c1',status:'pending'}],
    challenges:[{id:'c1',prompt:'Photo ensemble',hint:'',sort_order:0},{id:'c2',prompt:'Photo du gâteau',hint:'',sort_order:1}],
    chat:{messages:[],unread:0,latest:'0',open:true,more:false,oldest:null},
    chatFailure:null,sendFailure:null,chatReads:[],
    db:{
      from(table){
        reads.push(table)
        const rows={live_vote_public_state:{state:fixture.overview.room},bingo_prompts:Array.from({length:16},(_,i)=>({id:'b'+i,text:'Situation numéro '+i})),photo_hunt_challenges:fixture.challenges,photo_hunt_submissions:[]}
        assert.ok(Object.hasOwn(rows,table),'Unexpected read '+table)
        const value={data:rows[table],error:null}
        const query={select(){return query},eq(){return query},order(){return query},limit(){return query},maybeSingle:async()=>value,then(a,b){return Promise.resolve(value).then(a,b)}}
        return query
      },
      rpc(name,args){
        reads.push(name)
        let value
        if(name==='get_party_chat') {
          fixture.chatReads.push(args)
          value={data:{...fixture.chat,messages:args.p_summary?[]:fixture.chat.messages},error:fixture.chatFailure}
        } else if(name==='party_chat_action') {
          actions.push({name,args})
          value={data:{ok:true},error:args.p_action==='send'?fixture.sendFailure:null}
        } else {
          assert.equal(name,'get_photo_hunt_player_state','Home must not claim or assign missions')
          assert.equal(args.p_player_key,fixture.identity.identity.playerKey)
          value={data:{ok:true,submissions:fixture.ownPhotos},error:null}
        }
        const request=Promise.resolve(value)
        request.abortSignal=()=>request
        return request
      },
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

test('Home offers admin sign-in to an identified guest without changing their identity',async()=>{
  await render(()=>React.createElement(AdminAccessProbe,{Component:ui.Home}))
  const link=q('.guest-home-footer a')
  assert.equal(link.getAttribute('href'),'/admin/login')
  assert.match(link.textContent,/Administration/)
  await click(link)
  assert.deepEqual(JSON.parse(q('[data-testid=admin-location]').textContent),{path:'/admin/login',from:'/admin'})
  assert.deepEqual(actions,[])
  assert.equal(fixture.identity.identity.playerName,'Camille')
})
test('Home takes an authenticated admin directly to the full administration dashboard',async()=>{
  fixture.auth.isAdmin=true
  await render(()=>React.createElement(AdminAccessProbe,{Component:ui.Home}))
  const link=q('.guest-home-footer a')
  assert.equal(link.getAttribute('href'),'/admin')
  assert.equal(link.textContent,'Administration →')
  await click(link)
  assert.deepEqual(JSON.parse(q('[data-testid=admin-location]').textContent),{path:'/admin',from:'/admin'})
  assert.deepEqual(actions,[])
})
test('sign-in from Home returns to the full admin dashboard instead of Director mode',async()=>{
  function AdminAccessFlow() {
    return React.createElement(Routes,null,
      React.createElement(Route,{path:'/',element:React.createElement(ui.Home)}),
      React.createElement(Route,{path:'/admin/login',element:React.createElement(ui.AdminLogin)}),
      React.createElement(Route,{path:'/admin',element:React.createElement('h1',null,'Administration complète')}))
  }
  await render(AdminAccessFlow)
  await click(q('.guest-home-footer a'))
  assert.equal(q('h1').textContent,'Administration')
  assert.ok(q('input[type=password]'))
  // Model successful authentication in memory; never sign into production.
  fixture.auth.isAdmin=true
  await render(AdminAccessFlow)
  assert.equal(q('h1').textContent,'Administration complète')
  assert.deepEqual(actions,[])
})
test('admin sign-in is reachable inside onboarding without claiming a guest',async()=>{
  fixture.identity.identity=null
  await render(()=>React.createElement(AdminAccessProbe,{Component:ui.Onboarding}))
  const link=q('[role=dialog] a.home-onboarding__admin')
  assert.ok(link)
  assert.equal(link.closest('[inert]'),null)
  await click(link)
  assert.deepEqual(JSON.parse(q('[data-testid=admin-location]').textContent),{path:'/admin/login',from:'/admin'})
  assert.deepEqual(actions,[])
})
test('admin access is available even while the guest profile is loading',async()=>{
  fixture.identity.identity=null;fixture.identity.loading=true
  await render(()=>React.createElement(AdminAccessProbe,{Component:ui.Onboarding}))
  assert.equal(q('.home-onboarding--loading a').getAttribute('href'),'/admin/login')
  await click(q('.home-onboarding--loading a'))
  assert.deepEqual(JSON.parse(q('[data-testid=admin-location]').textContent),{path:'/admin/login',from:'/admin'})
  assert.deepEqual(actions,[])
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
test('Director TV status shares the centered panel width without changing mobile wrapping',async()=>{
  const directorCss=await readFile('src/pages/DirectorMode.css','utf8')
  const regieCss=await readFile('src/features/party/MobileRegie.css','utf8')
  const style=document.createElement('style')
  style.textContent=directorCss
  document.head.append(style)
  const sharedRule=[...style.sheet.cssRules].find(rule=>rule.selectorText?.split(',').map(s=>s.trim()).includes('.director-mode > .regie-tv'))
  assert.ok(sharedRule,'TV status must join the Director content container')
  assert.ok(sharedRule.selectorText.includes('.director-command-bar'))
  assert.equal(sharedRule.style.getPropertyValue('width'),'min(100%, 1180px)')
  assert.equal(sharedRule.style.getPropertyValue('margin-inline'),'auto')
  // The scoped selector wins over the later .regie-tv margin shorthand.
  assert.match(regieCss,/\.regie-tv \{[^}]*margin: 16px 0;/)
  assert.match(regieCss,/@media[^}]*[\s\S]*\.regie-tv \{ align-items: flex-start; flex-wrap: wrap;/)
})
test('mobile CSS reserves safe areas, readable Bingo and input sizes without affecting TV',async()=>{
  const css=await readFile('src/features/guest/guest.css','utf8')
  assert.match(css,/safe-area-inset-bottom/)
  assert.match(css,/\.guest-app \.bingo-cell \.bingo-cell__text \{ font-size: 14px/)
  assert.match(css,/\.guest-app textarea, \.guest-app select \{ font-size: 16px/)
  assert.ok(!css.includes('.party-screen '))
})

// CSSOM assertions cover the conflicting selectors, not just the presence of a media query.
async function cssRules(path) {
  const style=document.createElement('style')
  style.textContent=await readFile(path,'utf8')
  document.head.append(style)
  return [...style.sheet.cssRules]
}
const ruleFor=(rules,selector)=>rules.find(rule=>rule.selectorText===selector)?.style
test('guest profile overrides every desktop offset at the identity mobile breakpoint',async()=>{
  const rules=await cssRules('src/features/guest/guest.css')
  const desktop=ruleFor(rules,'.guest-app .party-identity-popover')
  assert.equal(desktop.getPropertyValue('left'),'auto')
  const mobile=rules.find(rule=>rule.conditionText==='(max-width: 640px)')
  assert.ok(mobile,'600px misses the 601–640px identity breakpoint')
  const panel=ruleFor([...mobile.cssRules],'.guest-app .party-identity-popover')
  assert.equal(panel.getPropertyValue('position'),'fixed')
  assert.equal(panel.getPropertyValue('width'),'auto')
  assert.equal(panel.getPropertyValue('bottom'),'auto')
  for(const side of ['left','right','top']) assert.match(panel.getPropertyValue(side),/env\(safe-area-inset-/)
  assert.match(panel.getPropertyValue('max-height'),/100dvh/)
  const header=ruleFor(rules,'.guest-topbar:has(.party-identity-popover)')
  const nav=ruleFor(rules,'.guest-nav')
  assert.ok(Number(header.getPropertyValue('z-index'))>Number(nav.getPropertyValue('z-index')),'Navigation must not cover the profile actions')
})
test('onboarding grid and inputs can shrink and the whole card stays scrollable',async()=>{
  const rules=await cssRules('src/features/identity/HomeIdentityOnboarding.css')
  const overlay=ruleFor(rules,'.home-onboarding')
  assert.equal(overlay.getPropertyValue('grid-template-columns'),'minmax(0, 1fr)')
  assert.equal(overlay.getPropertyValue('grid-template-rows'),'minmax(0, 1fr)')
  const card=ruleFor(rules,'.home-onboarding__card')
  assert.equal(parseFloat(card.getPropertyValue('min-width')),0)
  assert.equal(parseFloat(card.getPropertyValue('min-height')),0)
  assert.equal(card.getPropertyValue('max-height'),'min(880px, 100%)')
  assert.equal(card.getPropertyValue('overflow-y'),'auto')
  assert.equal(card.getPropertyValue('overflow-wrap'),'anywhere')
  assert.equal(parseFloat(ruleFor(rules,'.home-onboarding__search input').getPropertyValue('min-width')),0)
  const guestRules=await cssRules('src/features/guest/guest.css')
  assert.equal(ruleFor(guestRules,'.guest-app .home-onboarding__card').getPropertyValue('max-height'),'','Guest scope must not replace the available height with a viewport height')
})
test('profile can open and close without releasing an identity',async()=>{
  fixture.identity.releaseIdentity=async()=>{actions.push('releaseIdentity');return true}
  await render(()=>React.createElement(ui.PartyIdentityBadge,{inline:true}))
  await click(button('Salut Camille'))
  assert.ok(q('.party-identity-popover'))
  assert.equal(q('.party-identity-badge').getAttribute('aria-expanded'),'true')
  await click(q('button[aria-label="Fermer"]'))
  assert.equal(q('.party-identity-popover'),null)
  assert.deepEqual(actions,[])
})
test('profile release still requires confirmation and a successful response',async()=>{
  let confirm=false,success=false
  window.confirm=()=>confirm
  fixture.identity.releaseIdentity=async()=>{actions.push('releaseIdentity');return success}
  await render(()=>React.createElement(ui.PartyIdentityBadge,{inline:true}))
  await click(button('Salut Camille'))
  await click(button('Ce n’est pas moi'))
  assert.deepEqual(actions,[])
  confirm=true
  await click(button('Ce n’est pas moi'))
  assert.ok(button('Ce n’est pas moi'),'A failed release must retain the current profile')
  success=true
  await click(button('Ce n’est pas moi'))
  assert.ok(q('.party-identity-picker'))
  assert.deepEqual(actions,['releaseIdentity','releaseIdentity'])
})

const chatMessage=(id,mine=false,body='On se retrouve près du gâteau !')=>({id,name:mine?'Camille':'Léa',body,created_at:'2026-09-03T20:00:00Z',mine})
const chatWrites=()=>actions.filter(a=>a.name==='party_chat_action')
async function editChat(value) {
  const input=q('#chat-message')
  await act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,value)
    input.dispatchEvent(new window.Event('input',{bubbles:true}))
    input.dispatchEvent(new window.Event('change',{bubbles:true}))
  })
}
const submitChat=()=>act(async()=>q('.chat-composer').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})))

test('Home chat shortcut shows actual unread count without reading messages or marking them read',async()=>{
  fixture.chat.unread=7;fixture.chat.latest='7'
  await render(ui.Home)
  assert.equal(q('.chat-home-link').getAttribute('href'),'/chat')
  assert.equal(q('.chat-unread').textContent,'7')
  assert.equal(fixture.chatReads[0].p_summary,true)
  assert.deepEqual(chatWrites(),[])
})
test('chat never queries messages without a guest identity',async()=>{
  fixture.identity.identity=null
  await render(ui.Chat,'/chat')
  assert.deepEqual(fixture.chatReads,[])
  assert.deepEqual(chatWrites(),[])
  assert.ok(button('Envoyer').disabled)
})
test('chat renders messages as plain text, timestamps and own-message delete only',async()=>{
  fixture.chat.messages=[chatMessage('1',false,'<script>alert(1)</script>'),chatMessage('2',true)]
  fixture.chat.latest='2'
  await render(ui.Chat,'/chat')
  assert.equal(document.querySelectorAll('.chat-message').length,2)
  assert.match(text(),/<script>alert\(1\)<\/script>/)
  assert.equal(q('.chat-message script'),null)
  assert.equal(document.querySelectorAll('.chat-message-actions button').length,1)
  assert.equal(q('time').getAttribute('datetime'),'2026-09-03T20:00:00Z')
  assert.equal(chatWrites()[0].args.p_action,'read')
  assert.equal(chatWrites()[0].args.p_payload.id,'2')
})
test('empty room is explicit and typing whitespace cannot send',async()=>{
  await render(ui.Chat,'/chat')
  assert.match(text(),/Tout commence par un petit mot/)
  assert.ok(button('Envoyer').disabled)
  await editChat('   ')
  await submitChat()
  assert.deepEqual(chatWrites(),[])
})
test('failed send keeps text and retry reuses request ID before clearing on success',async()=>{
  await render(ui.Chat,'/chat')
  await editChat('Salut la soirée !')
  assert.ok(!button('Envoyer').disabled)
  fixture.sendFailure={message:'network failure'}
  await submitChat()
  assert.equal(q('#chat-message').value,'Salut la soirée !')
  assert.match(q('[role="alert"]').textContent,/Connexion interrompue/)
  const first=chatWrites().find(a=>a.args.p_action==='send').args
  assert.equal(first.p_player_key,'guest:fixture')
  assert.equal(first.p_session_token,'fixture-token')
  fixture.sendFailure=null
  await submitChat()
  const sends=chatWrites().filter(a=>a.args.p_action==='send')
  assert.equal(sends.length,2)
  assert.equal(sends[0].args.p_payload.request_id,sends[1].args.p_payload.request_id)
  assert.equal(q('#chat-message').value,'')
  assert.match(text(),/Message envoyé/)
})
test('length check counts Unicode characters and rejects more than 300',async()=>{
  await render(ui.Chat,'/chat')
  await editChat('🙂'.repeat(300))
  assert.match(text(),/300\/300/)
  assert.ok(!button('Envoyer').disabled)
  await editChat('a'.repeat(301))
  assert.ok(button('Envoyer').disabled)
  await submitChat()
  assert.deepEqual(chatWrites(),[])
})
test('deletion is explicit and cancels without a mutation',async()=>{
  fixture.chat.messages=[chatMessage('1',true)]
  await render(ui.Chat,'/chat')
  await click(button('Supprimer'))
  assert.deepEqual(chatWrites(),[])
  await click(button('Annuler'))
  assert.deepEqual(chatWrites(),[])
  await click(button('Supprimer'));await click(button('Confirmer'))
  assert.equal(chatWrites()[0].args.p_action,'delete')
  assert.equal(chatWrites()[0].args.p_payload.id,'1')
})
test('moderation uses admin reads and offers pause and deletion but no guest composer',async()=>{
  fixture.auth={isAdmin:true,user:{id:'admin'}}
  fixture.chat.messages=[chatMessage('1')]
  const AdminChat=()=>React.createElement(ui.Chat,{admin:true})
  await render(AdminChat,'/admin/chat')
  assert.equal(fixture.chatReads[0].p_admin,true)
  assert.equal(fixture.chatReads[0].p_player_key,null)
  assert.equal(q('.chat-composer'),null)
  await click(button('Mettre les envois en pause'))
  assert.equal(chatWrites()[0].args.p_action,'admin_pause')
  assert.equal(chatWrites()[0].args.p_payload.paused,true)
  await click(button('Supprimer'));await click(button('Confirmer'))
  assert.equal(chatWrites()[1].args.p_action,'admin_delete')
})
test('paused discussion keeps history readable and preserves unsent text',async()=>{
  fixture.chat.messages=[chatMessage('1')]
  await render(ui.Chat,'/chat')
  await editChat('À garder')
  fixture.chat.open=false
  await act(async()=>window.dispatchEvent(new window.Event('online')))
  assert.ok(button('Envoyer').disabled)
  assert.equal(q('#chat-message').value,'À garder')
  assert.equal(document.querySelectorAll('.chat-message').length,1)
  assert.match(text(),/Les envois sont en pause/)
})
test('identity change clears previous messages and draft',async()=>{
  fixture.chat.messages=[chatMessage('1',true,'Ancien message')]
  await render(ui.Chat,'/chat');await editChat('Ancien brouillon')
  fixture.identity.identity={playerKey:'guest:new',playerName:'Sam',sessionToken:'new-token'}
  fixture.chat.messages=[]
  await act(async()=>root.render(React.createElement(MemoryRouter,null,React.createElement(ui.Chat))))
  assert.equal(q('#chat-message').value,'')
  assert.ok(!text().includes('Ancien message'))
  assert.equal(fixture.chatReads.at(-1).p_player_key,'guest:new')
})
test('cursor history does not mark new live messages read; return restores latest page',async()=>{
  fixture.chat={...fixture.chat,messages:[chatMessage('51')],latest:'100',oldest:'51',more:true}
  await render(ui.Chat,'/chat')
  actions.length=0
  fixture.chat.latest='101'
  await click(button('Messages précédents'))
  assert.equal(fixture.chatReads.at(-1).p_before,'51')
  assert.deepEqual(chatWrites(),[])
  await click(button('Revenir aux derniers messages'))
  assert.equal(fixture.chatReads.at(-1).p_before,null)
  assert.equal(chatWrites()[0].args.p_payload.id,'101')
})
test('background tabs pause reads; reconnect refreshes but never replays a send',async()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'})
  await render(ui.Chat,'/chat')
  assert.equal(fixture.chatReads.length,0)
  Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})
  await act(async()=>document.dispatchEvent(new window.Event('visibilitychange')))
  assert.equal(fixture.chatReads.length,1)
  await act(async()=>window.dispatchEvent(new window.Event('online')))
  assert.equal(fixture.chatReads.length,2)
  assert.deepEqual(chatWrites(),[])
})
test('chat failure is not reported as an empty room and retry restores the view',async()=>{
  fixture.chatFailure={message:'connection failed'}
  await render(ui.Chat,'/chat')
  assert.ok(q('[role="alert"]'))
  assert.ok(!text().includes('Tout commence par un petit mot'))
  fixture.chatFailure=null
  await click(button('Réessayer'))
  assert.equal(q('[role="alert"]'),null)
  assert.match(text(),/Tout commence par un petit mot/)
})
test('chat remains outside TV routing and the four bottom tabs',async()=>{
  assert.equal(ui.activeGuestTab('/chat'),'/')
  assert.equal(ui.guestTabs(fixture.party.settings,fixture.extras.data.settings).length,4)
  const app=await readFile('src/App.tsx','utf8')
  assert.match(app,/path="\/chat" element=\{<PartyIdentityGate><PartyChat/)
  assert.match(app,/path="\/admin\/chat" element=\{<AdminRoute><PartyChat admin/)
  for(const path of ['src/pages/PartyScreen.tsx','src/pages/PartyScreenWithHall.tsx']) {
    const screen=await readFile(path,'utf8')
    assert.ok(!screen.includes('PartyChat'))
  }
})
