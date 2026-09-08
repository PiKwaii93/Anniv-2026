import assert from 'node:assert/strict'
import test, { after, afterEach, beforeEach } from 'node:test'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { build } from 'vite'

const cache = resolve('node_modules/.cache/react-timing-test.mjs')
const bundle = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [{
    name: 'react-timing-fixtures',
    enforce: 'pre',
    resolveId(id) {
      if (id.endsWith('virtual:react-timing')) return '\0react-timing'
      if (id.endsWith('/lib/supabase')) return '\0supabase'
    },
    load(id) {
      if (id === '\0supabase') return `
        export const supabase = {
          from() { return { select() { return this }, eq() { return this }, maybeSingle() { return Promise.resolve(globalThis.__timing.row) } } },
          channel() { return { on() { return this }, subscribe() { return this } } },
          removeChannel() { return Promise.resolve() },
        }
      `
      if (id === '\0react-timing') return `
        import React from 'react'
        import { AnnouncementProvider, useAnnouncement } from ${JSON.stringify(resolve('src/features/announcements/AnnouncementContext.tsx'))}
        import { useNow } from ${JSON.stringify(resolve('src/hooks/useNow.ts'))}
        export function AnnouncementProbe() {
          const value = useAnnouncement()
          globalThis.__timing.context = value
          return React.createElement('span', null, value.visible ? 'visible' : 'hidden')
        }
        export function AnnouncementFixture() {
          return React.createElement(AnnouncementProvider, null, React.createElement(AnnouncementProbe))
        }
        export function ClockProbe({ enabled }) {
          globalThis.__timing.clock = useNow(enabled)
          return null
        }
      `
    },
  }],
  build: { ssr: 'virtual:react-timing', write: false, minify: false },
})

await mkdir(resolve('node_modules/.cache'), { recursive: true })
await writeFile(cache, bundle.output.find(item => item.type === 'chunk').code)
const { AnnouncementFixture, ClockProbe } = await import(pathToFileURL(cache).href)
after(() => rm(cache))

let dom
let root
let now
let nextTimer
let timers
let originalDateNow

function schedule(kind, callback, delay = 0) {
  const id = ++nextTimer
  timers.set(id, { kind, callback, at: now + delay, delay })
  return id
}

async function advance(ms) {
  const end = now + ms
  for (;;) {
    const next = [...timers.entries()]
      .filter(([, timer]) => timer.at <= end)
      .sort((left, right) => left[1].at - right[1].at)[0]
    if (!next) break
    const [id, timer] = next
    now = timer.at
    if (timer.kind === 'interval') timer.at += timer.delay
    else timers.delete(id)
    await act(async () => timer.callback())
  }
  now = end
}

beforeEach(() => {
  dom = new JSDOM('<div id="root"></div>', { url: 'https://party.test/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  now = 1_000
  nextTimer = 0
  timers = new Map()
  originalDateNow = Date.now
  Date.now = () => now
  window.setTimeout = (callback, delay) => schedule('timeout', callback, delay)
  window.clearTimeout = id => timers.delete(id)
  window.setInterval = (callback, delay) => schedule('interval', callback, delay)
  window.clearInterval = id => timers.delete(id)
  root = createRoot(document.getElementById('root'))
  globalThis.__timing = {
    row: {
      data: {
        id: 'main',
        message: 'Les pizzas arrivent',
        kind: 'food',
        is_active: true,
        expires_at: new Date(3_500).toISOString(),
        event_id: 'pizza',
        updated_at: new Date(1_000).toISOString(),
      },
      error: null,
    },
  }
})

afterEach(async () => {
  await act(async () => root.unmount())
  assert.equal(timers.size, 0)
  Date.now = originalDateNow
  dom.window.close()
  delete globalThis.window
  delete globalThis.document
  delete globalThis.IS_REACT_ACT_ENVIRONMENT
  delete globalThis.__timing
})

test('announcement stays visible until its deadline, then expires once', async () => {
  await act(async () => root.render(React.createElement(AnnouncementFixture)))
  assert.equal(document.body.textContent, 'visible')
  await advance(2_539)
  assert.equal(document.body.textContent, 'visible')
  await advance(1)
  assert.equal(document.body.textContent, 'hidden')
})

test('already expired announcement is hidden on its first loaded render', async () => {
  globalThis.__timing.row.data.expires_at = new Date(999).toISOString()
  await act(async () => root.render(React.createElement(AnnouncementFixture)))
  assert.equal(document.body.textContent, 'hidden')
})

test('countdown clock starts asynchronously and stops when disabled', async () => {
  await act(async () => root.render(React.createElement(ClockProbe, { enabled: true })))
  assert.equal(globalThis.__timing.clock, null)
  await advance(0)
  assert.equal(globalThis.__timing.clock, 1_000)
  await advance(1_000)
  assert.equal(globalThis.__timing.clock, 2_000)
  await act(async () => root.render(React.createElement(ClockProbe, { enabled: false })))
  assert.equal(timers.size, 0)
})
