import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('public and admin module lists share one icon vocabulary', async () => {
  const visuals = await readFile('src/features/party/moduleVisuals.ts', 'utf8')
  const consumers = await Promise.all([
    readFile('src/features/guest/navigation.ts', 'utf8'),
    readFile('src/features/party/AdminPartyDock.tsx', 'utf8'),
    readFile('src/pages/AdminDashboard.tsx', 'utf8'),
    readFile('src/pages/ContentManager.tsx', 'utf8'),
    readFile('src/pages/DirectorMode.tsx', 'utf8'),
    readFile('src/pages/Home.tsx', 'utf8'),
  ])

  assert.match(visuals, /room: '◉'/)
  assert.match(visuals, /missions: '◇'/)
  assert.match(visuals, /bingo: '▦'/)
  assert.match(visuals, /'beer-pong': '◌'/)
  assert.match(visuals, /photos: '▧'/)
  assert.match(visuals, /iceberg: '△'/)
  assert.match(visuals, /guests: '○'/)

  for (const source of consumers) {
    assert.match(source, /partyModuleIcons/)
  }
})
