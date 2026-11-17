import { Buffer } from 'node:buffer'
import JSZip from 'jszip'
import { expect, test } from '@playwright/test'

test('renders the bundled example with real browser SVG and Canvas', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')

  const svg = page.locator('#page-content svg')
  await expect(svg).toHaveCount(1)
  await expect(svg.locator('text')).toHaveCount(4)
  await expect(svg).toContainText('Central Topic')
  await expect(svg).toContainText('Main Topic 3')
  await expect(svg.locator('text').filter({ hasText: 'Central Topic' })).toBeInViewport()
  expect(await svg.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return bounds.width > 0 && bounds.height > 0 && !/NaN|Infinity/.test(element.outerHTML)
  })).toBe(true)
  expect(errors).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('viewer.png') })
})

test('opens a local XMind ZIP and replaces the previous rendering', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#page-content svg')).toHaveCount(1)

  const zip = new JSZip().file('content.json', JSON.stringify([{
    id: 'sheet',
    title: '测试导图',
    rootTopic: {
      id: 'root',
      title: '浏览器导入',
      structureClass: 'org.xmind.ui.map.clockwise',
      children: { attached: [{ id: 'child', title: '子主题' }] }
    }
  }]))

  const file = {
    name: 'test.xmind',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
  }
  // Selecting the same file again must still trigger a new load.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('#input-dialog').setInputFiles(file)
    await expect(page.getByRole('status')).toHaveText('test.xmind')
    await expect(page.locator('#page-content svg')).toHaveCount(1)
    await expect(page.locator('#page-content svg text')).toHaveCount(2)
    await expect(page.locator('#page-content')).toContainText('浏览器导入')
    await expect(page.locator('#input-dialog')).toHaveValue('')
  }
})

test('keeps the current map and recovers the controls after a failed import', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page.locator('#page-content svg')).toHaveCount(1)

  const zip = new JSZip().file('content.xml', '<xmap-content />')
  await page.locator('#input-dialog').setInputFiles({
    name: 'legacy.xmind',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' }))
  })

  await expect(page.getByRole('status')).toContainText('暂不支持旧版 XML')
  await expect(page.getByRole('button', { name: '打开 XMind 文件' })).toBeEnabled()
  await expect(page.locator('#page-content svg')).toContainText('Central Topic')
  expect(errors).toEqual([])
})
