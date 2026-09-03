// Isolated visual fixture: real chat components, synthetic identities/messages,
// no Supabase connection, no production data. Run: node tests/chat-preview.mjs
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

const mocks = {
  '/identity/PartyIdentityContext': 'export const usePartyIdentity=()=>({identity:{playerKey:"qa:demo",playerName:"Camille",sessionToken:"qa-token"}})',
  '/auth/AuthContext': 'export const useAuth=()=>({isAdmin:false,user:null})',
  '/lib/supabase': `
    let messages=[{id:'1',name:'Léa',body:'Qui est partant pour une photo de groupe ? 📸',created_at:'2026-10-24T20:00:00Z',mine:false},{id:'2',name:'Camille',body:'Moi ! On se retrouve près du gâteau dans cinq minutes 🙂',created_at:'2026-10-24T20:01:00Z',mine:true}];
    const requests=new Map();
    export const supabase={rpc(name,args){
      let data={ok:true};
      if(name==='get_party_chat') data={messages,latest:messages.at(-1)?.id??'0',unread:0,more:false,oldest:messages[0]?.id??null,open:true};
      else if(args.p_action==='send'&&!requests.has(args.p_payload.request_id)) {
        const id=String(messages.length+1); requests.set(args.p_payload.request_id,id);
        messages=[...messages,{id,name:'Camille',body:args.p_payload.body,created_at:new Date().toISOString(),mine:true}];
      } else if(args.p_action==='delete') messages=messages.filter(m=>m.id!==args.p_payload.id);
      const result=Promise.resolve({data,error:null});result.abortSignal=()=>result;return result;
    }};
  `,
}
const server=await createServer({configFile:false,publicDir:false,plugins:[react(),{
  name:'isolated-chat-preview',enforce:'pre',
  resolveId(id){if(id==='/qa-entry.js')return '\0qa-entry';const key=Object.keys(mocks).find(key=>id.endsWith(key));if(key)return '\0qa:'+key},
  load(id){
    if(id.startsWith('\0qa:'))return mocks[id.slice(4)]
    if(id==='\0qa-entry')return `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Chat from ${JSON.stringify(resolve('src/pages/PartyChat.tsx'))};import ${JSON.stringify(resolve('src/features/guest/guest.css'))};
      createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,null,React.createElement('div',{className:'guest-app'},React.createElement('header',{className:'guest-topbar'},'ANNIV 2026 · APERÇU FICTIF'),React.createElement(Chat),React.createElement('nav',{className:'guest-nav'},...['Accueil','Jouer','Photos','Musique'].map(label=>React.createElement('a',{key:label,href:'#'},label))))));`
  },
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url?.startsWith('/demo')) {
      const html=await server.transformIndexHtml('/demo','<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#080a0b;color:#fff;font-family:Arial,sans-serif}</style><div id="root"></div><script type="module" src="/qa-entry.js"></script></html>');res.setHeader('Content-Type','text/html');res.end(html)
    } else if(req.url==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="fr"><title>Chat · aperçu mobile isolé</title><body style="margin:0;background:#20232a;display:flex;justify-content:center"><iframe title="Aperçu mobile du salon" src="/demo" width="390" height="844" style="border:0"></iframe></body></html>')}
    else next()
  })},
}],server:{host:'127.0.0.1',port:5173,strictPort:true}})
await server.listen();server.printUrls()
