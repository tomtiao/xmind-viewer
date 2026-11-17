import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
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

test('renders the rich MAP sample with its image, markers and floating topic', async ({ page }) => {
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles('tests/fixtures/map-with-content.xmind')
  await expect(page.getByRole('status')).toHaveText('map-with-content.xmind')
  const svg = page.locator('#page-content svg')
  await expect(svg.locator('text')).toHaveCount(8)
  await expect(svg).toContainText('Floating Topic')
  await expect(svg.locator('image')).toHaveCount(1)
  const image = svg.locator('image')
  await expect(image).toHaveAttribute('width', '200')
  const imageBox = await image.boundingBox()
  const titleBox = await svg.locator('text').filter({ hasText: 'Subtopic 1' }).last().boundingBox()
  expect(imageBox && titleBox && titleBox.y >= imageBox.y + imageBox.height).toBeTruthy()
  await expect(svg.locator('[data-topic-id="b05f2811-380c-417b-8266-b23b2d0ee8d9"] circle')).toHaveCount(2)
  // Reference JPEG coordinates after aligning its central topic: main 1 (+248,-65), image left (-551,-17), floating (-67,-193).
  const root = (await svg.locator('[data-topic-id="a81aaf27-912e-45dd-ae58-e1afe91a4a62"]').boundingBox())!
  const main = (await svg.locator('[data-topic-id="4b645861-be64-472d-8731-0f16695ed994"]').boundingBox())!
  const floating = (await svg.locator('[data-topic-id="e50dffd4-dc4d-4e42-a779-b8bd1fc19666"]').boundingBox())!
  const center = (box: { x: number, y: number, width: number, height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  const rootCenter = center(root), mainCenter = center(main), floatingCenter = center(floating)
  expect(Math.abs(mainCenter.x - rootCenter.x - 248)).toBeLessThan(20)
  expect(Math.abs(mainCenter.y - rootCenter.y + 65)).toBeLessThan(20)
  expect(Math.abs(imageBox!.x - rootCenter.x + 551)).toBeLessThan(20)
  expect(Math.abs(floatingCenter.x - rootCenter.x + 67)).toBeLessThan(2)
  expect(Math.abs(floatingCenter.y - rootCenter.y + 193)).toBeLessThan(2)
})

test('applies level 3 fill to a plain subtopic', async ({ page }) => {
  const zip = await JSZip.loadAsync(readFileSync('tests/fixtures/map-with-content.xmind'))
  const sheets = JSON.parse(await zip.file('content.json')!.async('string'))
  delete sheets[0].rootTopic.children.attached[0].children.attached[0].markers
  zip.file('content.json', JSON.stringify(sheets))
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles({ name: 'plain.xmind', mimeType: 'application/octet-stream', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) })
  const shape = page.locator('[data-topic-id="b05f2811-380c-417b-8266-b23b2d0ee8d9"] [data-name="topic-shape"]')
  await expect(shape).toHaveAttribute('fill', '#ffe1e1')
})

test('shows unknown markers and allows their removal without losing other markers', async ({ page }) => {
  const zip = await JSZip.loadAsync(readFileSync('tests/fixtures/map-with-content.xmind'))
  const sheets = JSON.parse(await zip.file('content.json')!.async('string'))
  sheets[0].rootTopic.children.attached[0].markers = [{ markerId: 'vendor-special' }, { markerId: 'priority-2' }]
  zip.file('content.json', JSON.stringify(sheets))
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles({ name: 'markers.xmind', mimeType: 'application/octet-stream', buffer: Buffer.from(await zip.generateAsync({ type: 'uint8array' })) })
  const topic = page.locator('[data-topic-id="4b645861-be64-472d-8731-0f16695ed994"]')
  await expect(topic.locator('[data-marker-id="vendor-special"]')).toBeVisible()
  await topic.click()
  await page.locator('#marker-select').selectOption('vendor-special')
  await page.getByRole('button', { name: '添加 / 移除标记' }).click()
  await expect(topic.locator('[data-marker-id="vendor-special"]')).toHaveCount(0)
  await expect(topic.locator('[data-marker-id="priority-2"]')).toHaveCount(1)
})

test('edits, folds, undoes and saves the original archive', async ({ page }) => {
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles('tests/fixtures/map-with-content.xmind')
  await expect(page.getByRole('status')).toHaveText('map-with-content.xmind')
  const topic = page.locator('[data-topic-id="4b645861-be64-472d-8731-0f16695ed994"]')
  const root = page.locator('[data-topic-id="a81aaf27-912e-45dd-ae58-e1afe91a4a62"]')
  const before = await root.boundingBox()
  await topic.dblclick()
  await page.locator('.topic-editor').fill('中文编辑')
  await page.locator('.topic-editor').press('Enter')
  await expect(page.locator('#page-content')).toContainText('中文编辑')
  const after = await root.boundingBox()
  expect(Math.abs(before!.x - after!.x)).toBeLessThan(2)
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(2)
  await page.getByRole('button', { name: '折叠 / 展开' }).click()
  await expect(page.locator('[data-topic-id="b05f2811-380c-417b-8266-b23b2d0ee8d9"]')).toHaveCount(0)
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.locator('[data-topic-id="b05f2811-380c-417b-8266-b23b2d0ee8d9"]')).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const saved = await download
  const stream = await saved.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const sheets = JSON.parse(await zip.file('content.json')!.async('string'))
  expect(sheets[0].rootTopic.children.attached[0].title).toBe('中文编辑')
  expect(zip.file(/^resources\//).length).toBeGreaterThan(0)
})

test('dragging a floating topic after zoom preserves its grab offset', async ({ page }) => {
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles('tests/fixtures/map-with-content.xmind')
  await expect(page.getByRole('status')).toHaveText('map-with-content.xmind')
  await page.getByRole('button', { name: '放大' }).click()
  const topic = page.locator('[data-topic-id="e50dffd4-dc4d-4e42-a779-b8bd1fc19666"]')
  const box = (await topic.boundingBox())!
  await page.mouse.move(box.x + 8, box.y + 8)
  await page.mouse.down()
  await page.mouse.move(box.x + 68, box.y + 44, { steps: 5 })
  await page.mouse.up()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const sheets = JSON.parse(await zip.file('content.json')!.async('string'))
  expect(sheets[0].rootTopic.children.detached[0].position).toEqual({ x: -17, y: -163 })
})

test('edits a marker and replaces and resizes an image with resource manifest', async ({ page }) => {
  await page.goto('/')
  await page.locator('#input-dialog').setInputFiles('tests/fixtures/map-with-content.xmind')
  await expect(page.getByRole('status')).toHaveText('map-with-content.xmind')
  await page.locator('[data-topic-id="59aba10d-0b18-4f00-a99a-b7d65ebe838a"]').click()
  await page.getByRole('button', { name: '红旗' }).click()
  await expect(page.locator('[data-topic-id="59aba10d-0b18-4f00-a99a-b7d65ebe838a"] circle')).toHaveCount(1)
  // A tiny PNG exercises resource creation independently of the fixture image.
  await page.locator('#image-dialog').setInputFiles({ name: 'new.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aQAAAABJRU5ErkJggg==', 'base64') })
  await expect(page.locator('[data-topic-id="59aba10d-0b18-4f00-a99a-b7d65ebe838a"] image')).toHaveCount(1)
  await page.locator('#image-width').fill('50')
  await page.getByRole('button', { name: '调整图片' }).click()
  await expect(page.locator('[data-topic-id="59aba10d-0b18-4f00-a99a-b7d65ebe838a"] image')).toHaveAttribute('width', '50')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const stream = await (await download).createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const zip = await JSZip.loadAsync(Buffer.concat(chunks))
  const sheets = JSON.parse(await zip.file('content.json')!.async('string'))
  const image = sheets[0].rootTopic.children.attached[1].image
  expect(image.width).toBe(50)
  const path = image.src.replace('xap:', '')
  expect(zip.file(path)).toBeTruthy()
  expect(JSON.parse(await zip.file('manifest.json')!.async('string'))['file-entries'][path]).toBeTruthy()
})
