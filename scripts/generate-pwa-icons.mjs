import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright'

const outputDirectory = resolve('public/pwa')
await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const favicon = await readFile(resolve('public/favicon.svg'))
const faviconUrl = `data:image/svg+xml;base64,${favicon.toString('base64')}`

async function render(fileName, size, logoScale) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`
    <style>
      * { box-sizing: border-box }
      html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #03070c }
      body { display: grid; place-items: center }
      img { width: ${logoScale}%; height: ${logoScale}%; object-fit: contain }
    </style>
    <img src="${faviconUrl}" alt="">
  `)
  await page.locator('img').waitFor({ state: 'visible' })
  await page.screenshot({ path: resolve(outputDirectory, fileName) })
}

await render('icon-192.png', 192, 72)
await render('icon-512.png', 512, 72)
await render('icon-maskable-512.png', 512, 58)
await render('apple-touch-icon.png', 180, 68)
await browser.close()
