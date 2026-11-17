import JSZip from 'jszip'
import contentData from '../example/content.json'
import { loadFromXMind, SnowbrushRenderer } from './index'
import type { SheetData } from './model/sheet'
import type { TopicData } from './model/topic'
import { EditorDocument } from './editorDocument'
import { markerOptions } from './markers'
import './styles.css'

const container = document.querySelector<HTMLElement>('#page-content')!
const input = document.querySelector<HTMLInputElement>('#input-dialog')!
const openButton = document.querySelector<HTMLButtonElement>('#open-file')!
const status = document.querySelector<HTMLElement>('#status')!
let editor: EditorDocument | undefined
let selectedId: string | undefined
let filename = 'mind-map.xmind'
let zoom = 1
let renderVersion = 0
const editingButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('header button')).filter(element => element !== openButton)
const markerSelect = document.querySelector<HTMLSelectElement>('#marker-select')!
function updateMarkerOptions(id?: string) {
  const current = markerSelect.value
  const present = id && editor?.index.get(id)?.topic.markers || []
  const options = [...markerOptions, ...present.filter(marker => !markerOptions.some(option => option.id === marker.markerId)).map(marker => ({ id: marker.markerId, label: `未知：${marker.markerId}` }))]
  markerSelect.replaceChildren(...options.map(option => { const element = document.createElement('option'); element.value = option.id; element.textContent = `${option.label}${present.some(marker => marker.markerId === option.id) ? ' ✓' : ''}`; return element }))
  if (options.some(option => option.id === current)) markerSelect.value = current
}
updateMarkerOptions()
editingButtons.forEach(element => { element.disabled = true })
status.textContent = '打开文件后开始编辑'

openButton.addEventListener('click', () => { if (!editor?.dirty || window.confirm('当前文件有未保存的修改，确定打开其他文件吗？')) input.click() })
window.addEventListener('beforeunload', event => { if (editor?.dirty) event.preventDefault() })
window.addEventListener('keydown', event => {
  if (!editor || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.isComposing) return
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase()
    if (key === 's' || key === 'z' || key === 'y') {
      event.preventDefault()
      document.querySelector<HTMLButtonElement>(key === 's' ? '#save-file' : key === 'y' || event.shiftKey ? '#redo' : '#undo')?.click()
    }
  }
})

input.addEventListener('change', async () => {
  const file = input.files?.[0]
  if (!file) return

  openButton.disabled = true
  editingButtons.forEach(element => { element.disabled = true })
  ++renderVersion
  status.textContent = '正在打开…'

  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer())
    const data = await loadFromXMind(zip)
    const next = new EditorDocument(data.sheets, zip)
    await renderDocument(next)
    editor = next
    editingButtons.forEach(element => { element.disabled = false })
    selectedId = data.sheets[0].rootTopic.id
    filename = file.name
    status.textContent = file.name
  } catch (error) {
    const message = error instanceof Error ? error.message : '打开文件失败。'
    if (editor) await renderDocument(editor)
    status.textContent = message
  } finally {
    input.value = ''
    openButton.disabled = false
    editingButtons.forEach(element => { element.disabled = !editor })
  }
})

async function renderDocument(doc: EditorDocument) {
  const version = ++renderVersion
  const projection = structuredClone(doc.sheets)
  await Promise.all(projection.map(sheet => prepareImages(sheet.rootTopic, doc.zip)))
  if (version !== renderVersion) return false
  return render(projection, doc === editor, version)
}

async function runEdit(action: () => void) {
  if (!editor) return
  if (editor.sheets[0].rootTopic.structureClass !== 'org.xmind.ui.map.clockwise') { status.textContent = '此结构尚未验证，暂不支持编辑。'; return }
  try {
    action()
    if (selectedId && !editor.index.has(selectedId)) selectedId = editor.sheets[0].rootTopic.id
    if (await renderDocument(editor)) select(selectedId)
  } catch (error) { status.textContent = error instanceof Error ? error.message : '操作失败。' }
}
function select(id?: string) {
  selectedId = id
  updateMarkerOptions(id)
  container.querySelectorAll('[data-topic-id]').forEach(element => element.classList.toggle('selected', element.getAttribute('data-topic-id') === id))
}
container.addEventListener('click', event => {
  const target = (event.target as Element).closest('[data-topic-id]')
  if (target) select(target.getAttribute('data-topic-id') || undefined)
})
let drag: { id: string, x: number, y: number } | undefined
let pan: { x: number, y: number, left: number, top: number } | undefined
container.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !editor) return
  const target = (event.target as Element).closest('[data-topic-id]')
  const id = target?.getAttribute('data-topic-id')
  if (id) drag = { id, x: event.clientX, y: event.clientY }
  else pan = { x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop }
})
window.addEventListener('pointermove', event => { if (pan) container.scrollTo(pan.left - event.clientX + pan.x, pan.top - event.clientY + pan.y) })
window.addEventListener('pointerup', event => {
  pan = undefined
  const start = drag
  drag = undefined
  if (!start || !editor || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) return
  const entry = editor.index.get(start.id)
  if (!entry) return
  if (entry.type === 'detached') {
    const sheet = container.querySelector<SVGGraphicsElement>('[data-name="sheet"]')
    const matrix = sheet?.getScreenCTM()
    if (!matrix) return
    const inverse = matrix.inverse()
    const from = new DOMPoint(start.x, start.y).matrixTransform(inverse)
    const to = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
    const position = entry.topic.position || { x: 0, y: 0 }
    void runEdit(() => editor!.position(start.id, Math.round(position.x + to.x - from.x), Math.round(position.y + to.y - from.y)))
  } else {
    const target = document.elementsFromPoint(event.clientX, event.clientY).map(element => element.closest('[data-topic-id]')).find(Boolean)
    const id = target?.getAttribute('data-topic-id')
    if (id && id !== start.id) {
      const dest = editor.index.get(id)
      const rect = target?.getBoundingClientRect()
      const edge = rect && (event.clientY < rect.top + rect.height * 0.3 || event.clientY > rect.bottom - rect.height * 0.3)
      if (edge && dest?.parent && dest.type === 'attached') {
        const index = dest.parent.children!.attached.indexOf(dest.topic) + (event.clientY > rect!.top + rect!.height / 2 ? 1 : 0)
        void runEdit(() => editor!.move(start.id, dest.parent!.id, index))
      } else void runEdit(() => editor!.move(start.id, id))
    }
  }
})
container.addEventListener('dblclick', event => {
  if (!editor) return
  const target = (event.target as Element).closest('[data-topic-id]') as SVGGraphicsElement | null
  const id = target?.getAttribute('data-topic-id')
  const topic = id && editor.index.get(id)?.topic
  if (!target || !id || !topic) return
  select(id)
  const box = target.getBoundingClientRect()
  const input = document.createElement('textarea')
  input.className = 'topic-editor'
  input.value = topic.title
  Object.assign(input.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${Math.max(box.width, 120)}px`, height: `${Math.max(box.height, 35)}px` })
  document.body.append(input)
  input.focus(); input.select()
  let composing = false
  let done = false
  const finish = (commit: boolean) => { if (done) return; done = true; const title = input.value; input.remove(); if (commit) void runEdit(() => editor!.rename(id, title)) }
  input.addEventListener('compositionstart', () => { composing = true })
  input.addEventListener('compositionend', () => { composing = false })
  input.addEventListener('keydown', e => { if (e.key === 'Escape') finish(false); if (e.key === 'Enter' && !e.shiftKey && !composing && !e.isComposing) { e.preventDefault(); finish(true) } })
  input.addEventListener('blur', () => finish(true))
})
const button = (id: string, fn: () => void) => document.querySelector<HTMLButtonElement>(`#${id}`)!.addEventListener('click', fn)
button('add-child', () => { if (selectedId) void runEdit(() => { selectedId = editor!.add(selectedId!) }) })
button('add-sibling', () => { if (selectedId && editor) { const entry = editor.index.get(selectedId); const parent = entry?.parent; if (parent && entry?.type === 'attached') { const index = parent.children!.attached.indexOf(entry.topic) + 1; void runEdit(() => { selectedId = editor!.add(parent.id, 'attached', index) }) } } })
button('add-floating', () => { if (editor) void runEdit(() => { selectedId = editor!.add(editor!.sheets[0].rootTopic.id, 'detached') }) })
button('delete-topic', () => { if (selectedId && editor) void runEdit(() => { const parent = editor!.index.get(selectedId!)?.parent?.id; editor!.remove(selectedId!); selectedId = parent }) })
button('fold-topic', () => { if (selectedId) void runEdit(() => editor!.toggleFold(selectedId!)) })
button('tag-red', () => { if (selectedId) void runEdit(() => editor!.toggleMarker(selectedId!, 'tag-red')) })
button('flag-red', () => { if (selectedId) void runEdit(() => editor!.toggleMarker(selectedId!, 'flag-red')) })
button('toggle-marker', () => { if (selectedId) void runEdit(() => editor!.toggleMarker(selectedId!, markerSelect.value)) })
button('resize-image', () => { if (selectedId) { const image = container.querySelector<SVGImageElement>(`[data-topic-id="${CSS.escape(selectedId)}"] image`); const ratio = image ? Number(image.getAttribute('height')) / Number(image.getAttribute('width')) : undefined; void runEdit(() => editor!.resizeImage(selectedId!, Number(document.querySelector<HTMLInputElement>('#image-width')!.value), ratio)) } })
const imageInput = document.querySelector<HTMLInputElement>('#image-dialog')!
button('insert-image', () => { if (editor && selectedId) imageInput.click() })
imageInput.addEventListener('change', async () => {
  const file = imageInput.files?.[0], id = selectedId, doc = editor
  imageInput.value = ''
  if (!file || !id || !doc) return
  try {
    const bytes = await file.arrayBuffer()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('')
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>)[file.type]
    if (!ext) throw new Error('不支持此图片格式。')
    const url = URL.createObjectURL(file)
    const image = new Image()
    try { image.src = url; await image.decode() } finally { URL.revokeObjectURL(url) }
    const width = Math.min(200, image.naturalWidth), height = Math.round(width * image.naturalHeight / image.naturalWidth)
    const path = `resources/${hash}.${ext}`
    if (doc !== editor) return
    doc.zip.file(path, bytes)
    await runEdit(() => doc.setImage(id, path, width, height))
  } catch (error) { status.textContent = error instanceof Error ? error.message : '图片读取失败。' }
})
button('undo', () => { void runEdit(() => editor!.undo()) })
button('redo', () => { void runEdit(() => editor!.redo()) })
function setZoom(value: number) { zoom = Math.max(0.25, Math.min(3, value)); const surface = container.querySelector<HTMLElement>('.sheet-container'); if (surface) surface.style.zoom = String(zoom) }
button('zoom-in', () => setZoom(zoom * 1.2))
button('zoom-out', () => setZoom(zoom / 1.2))
container.addEventListener('wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)) } }, { passive: false })
button('save-file', () => { if (editor) void editor.save().then(blob => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }).catch(error => { status.textContent = error instanceof Error ? error.message : '保存失败。' }) })

async function prepareImages(topic: TopicData, zip: JSZip): Promise<void> {
  const path = topic.image?.src?.replace(/^xap:/, '')
  const resource = path && zip.file(path)
  if (resource) {
    const blob = await resource.async('blob')
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    const image = new Image()
    image.src = src
    await image.decode()
    const width = topic.image.width || Math.min(200, image.naturalWidth)
    const height = topic.image.height || width * image.naturalHeight / image.naturalWidth
    topic.renderImage = { src, width, height }
  }
  await Promise.all(Object.values(topic.children || {}).flat().map(child => prepareImages(child, zip)))
}

async function render(sheets: SheetData[], preserveViewport = false, version = ++renderVersion) {
  const oldLeft = container.scrollLeft, oldTop = container.scrollTop
  const rootSelector = `[data-topic-id="${CSS.escape(sheets[0].rootTopic.id)}"]`
  const previousRoot = container.querySelector<SVGGraphicsElement>(rootSelector)?.getBoundingClientRect()
  await Promise.all([400, 500, 600, 700, 800].map(weight => document.fonts.load(`${weight} 14px NeverMind`)))
  await document.fonts.ready
  if (version !== renderVersion) return false

  const renderer = new SnowbrushRenderer(sheets)
  const svg = renderer.render()
  const bounds = renderer.bounds
  const width = Math.max(container.clientWidth, bounds.width)
  const height = Math.max(container.clientHeight, bounds.height)
  const surface = document.createElement('div')

  surface.className = 'sheet-container'
  surface.style.zoom = String(zoom)
  surface.style.width = `${width * 2}px`
  surface.style.height = `${height * 2}px`
  surface.style.backgroundColor = svg.node.style.backgroundColor
  svg.addTo(surface)
  renderer.transform(width + bounds.x, height + bounds.y)
  container.replaceChildren(surface)
  if (preserveViewport && previousRoot) {
    container.scrollTo(oldLeft, oldTop)
    const nextRoot = container.querySelector<SVGGraphicsElement>(rootSelector)?.getBoundingClientRect()
    if (nextRoot) container.scrollBy(nextRoot.left - previousRoot.left, nextRoot.top - previousRoot.top)
  }
  else container.scrollTo(width - container.clientWidth / 2, height - container.clientHeight / 2)
  return true
}

render(contentData as unknown as SheetData[]).catch(error => {
  status.textContent = error instanceof Error ? error.message : '示例加载失败。'
})
