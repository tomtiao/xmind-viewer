import JSZip from 'jszip'
import contentData from '../example/content.json'
import { loadFromXMind, SnowbrushRenderer } from './index'
import type { SheetData } from './model/sheet'
import './styles.css'

const container = document.querySelector<HTMLElement>('#page-content')!
const input = document.querySelector<HTMLInputElement>('#input-dialog')!
const openButton = document.querySelector<HTMLButtonElement>('#open-file')!
const status = document.querySelector<HTMLElement>('#status')!

openButton.addEventListener('click', () => input.click())

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return

  openButton.disabled = true
  status.textContent = '正在打开…'

  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const data = await loadFromXMind(zip)
    await render(data.sheets)
    status.textContent = file.name
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '打开文件失败。'
  } finally {
    input.value = ''
    openButton.disabled = false
  }
})

async function render(sheets: SheetData[]) {
  await document.fonts.ready

  const renderer = new SnowbrushRenderer(sheets)
  const svg = renderer.render()
  const bounds = renderer.bounds
  const width = Math.max(container.clientWidth, bounds.width)
  const height = Math.max(container.clientHeight, bounds.height)
  const surface = document.createElement('div')

  surface.className = 'sheet-container'
  surface.style.width = `${width * 2}px`
  surface.style.height = `${height * 2}px`
  surface.style.backgroundColor = svg.node.style.backgroundColor
  svg.addTo(surface)
  renderer.transform(width + bounds.x, height + bounds.y)
  container.replaceChildren(surface)
  container.scrollTo(width - container.clientWidth / 2, height - container.clientHeight / 2)
}

render(contentData as unknown as SheetData[]).catch(error => {
  status.textContent = error instanceof Error ? error.message : '示例加载失败。'
})
