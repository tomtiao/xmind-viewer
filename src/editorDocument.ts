import JSZip from 'jszip'
import type { SheetData } from './model/sheet'
import type { TopicData } from './model/topic'

interface Entry { topic: TopicData; parent?: TopicData; type?: string; sheet: SheetData }

/** Raw JSON and the original archive remain authoritative; renderers receive clones. */
export class EditorDocument {
  sheets: SheetData[]
  private undoStack: string[] = []
  private redoStack: string[] = []
  private savedSnapshot: string
  index = new Map<string, Entry>()
  constructor(sheets: SheetData[], readonly zip: JSZip) {
    this.sheets = sheets
    this.savedSnapshot = JSON.stringify(sheets)
    this.reindex()
  }
  private reindex() {
    this.index.clear()
    const visit = (topic: TopicData, sheet: SheetData, parent?: TopicData, type?: string) => {
      if (this.index.has(topic.id)) throw new Error('文件含重复主题 ID，无法安全编辑。')
      this.index.set(topic.id, { topic, sheet, parent, type })
      for (const [kind, children] of Object.entries(topic.children || {})) children.forEach(child => visit(child, sheet, topic, kind))
    }
    this.sheets.forEach(sheet => visit(sheet.rootTopic, sheet))
  }
  private change(fn: () => void) {
    const before = JSON.stringify(this.sheets)
    try { fn(); this.reindex() } catch (error) { this.sheets = JSON.parse(before); this.reindex(); throw error }
    if (JSON.stringify(this.sheets) !== before) { this.undoStack.push(before); this.redoStack = [] }
  }
  private entry(id: string): Entry {
    const entry = this.index.get(id)
    if (!entry) throw new Error('主题不存在。')
    return entry
  }
  rename(id: string, title: string) { this.change(() => { const topic = this.entry(id).topic; topic.title = title; delete (topic as TopicData & { titleUnedited?: boolean }).titleUnedited }) }
  add(parentId: string, type = 'attached', index?: number): string {
    let id = ''
    this.change(() => {
      const parent = this.entry(parentId).topic
      id = crypto.randomUUID()
      parent.children ||= {}
      const children = parent.children[type] ||= []
      children.splice(index === undefined ? children.length : Math.min(Math.max(index, 0), children.length), 0, { id, title: type === 'detached' ? '自由主题' : '新主题', ...(type === 'detached' ? { position: { x: 0, y: -150 } } : {}) })
      if (type === 'detached') {
        const sheet = this.entry(parentId).sheet as SheetData & { arrangeableLayerOrder?: string[] }
        sheet.arrangeableLayerOrder?.push(id)
      }
    })
    return id
  }
  remove(id: string) {
    this.change(() => {
      const entry = this.entry(id)
      if (!entry.parent) throw new Error('不能删除中心主题。')
      // Unsupported relationships, boundaries and summaries can refer to any descendant.
      const serialized = JSON.stringify(entry.sheet)
      if (/"(?:relationships|boundaries|summaries)"\s*:\s*\[\s*\{/.test(serialized)) throw new Error('此工作表含关系线、边界或概要，暂不支持删除主题。')
      const ids: string[] = []
      const collect = (topic: TopicData) => { ids.push(topic.id); Object.values(topic.children || {}).flat().forEach(collect) }
      collect(entry.topic)
      const siblings = entry.parent.children![entry.type!]
      siblings.splice(siblings.indexOf(entry.topic), 1)
      const sheet = entry.sheet as SheetData & { arrangeableLayerOrder?: string[] }
      if (sheet.arrangeableLayerOrder) sheet.arrangeableLayerOrder = sheet.arrangeableLayerOrder.filter(item => !ids.includes(item))
    })
  }
  move(id: string, parentId: string, index?: number) {
    this.change(() => {
      const source = this.entry(id), destination = this.entry(parentId)
      if (!source.parent || source.type !== 'attached') throw new Error('只能移动普通子主题。')
      if (source.sheet !== destination.sheet) throw new Error('不能跨工作表移动主题。')
      for (let current: TopicData | undefined = destination.topic; current; current = this.index.get(current.id)?.parent) {
        if (current.id === id) throw new Error('不能将主题移入自身或后代。')
      }
      if (/"(?:relationships|boundaries|summaries)"\s*:\s*\[\s*\{/.test(JSON.stringify(source.sheet))) throw new Error('此工作表含关系线、边界或概要，暂不支持移动主题。')
      const from = source.parent.children![source.type]
      const oldIndex = from.indexOf(source.topic)
      if (source.parent === destination.topic && index !== undefined && oldIndex < index) index--
      from.splice(oldIndex, 1)
      destination.topic.children ||= {}
      const to = destination.topic.children.attached ||= []
      to.splice(index === undefined ? to.length : Math.max(0, Math.min(index, to.length)), 0, source.topic)
    })
  }
  position(id: string, x: number, y: number) { this.change(() => { const entry = this.entry(id); if (entry.type !== 'detached') throw new Error('只有自由主题可以直接定位。'); entry.topic.position = { x, y } }) }
  toggleMarker(id: string, markerId: string) { this.change(() => { const topic = this.entry(id).topic; topic.markers ||= []; const at = topic.markers.findIndex(marker => marker.markerId === markerId); if (at < 0) topic.markers.push({ markerId }); else topic.markers.splice(at, 1) }) }
  setImage(id: string, path: string, width: number, height: number) { this.change(() => { const topic = this.entry(id).topic; topic.image = { ...topic.image, src: `xap:${path}`, width, height } }) }
  resizeImage(id: string, width: number, ratio?: number) { this.change(() => { const image = this.entry(id).topic.image; if (!image || width <= 0) throw new Error('主题没有可缩放的图片。'); const aspect = image.width && image.height ? image.height / image.width : ratio; if (!aspect) throw new Error('图片尺寸不可用。'); image.height = Math.round(aspect * width); image.width = width }) }
  toggleFold(id: string) { this.change(() => { const entry = this.entry(id), t = entry.topic; if (!entry.parent) throw new Error('不能折叠中心主题。'); if (t.branch === 'folded') delete t.branch; else if (t.children?.attached?.length) t.branch = 'folded'; else throw new Error('此主题没有可折叠的子主题。') }) }
  undo() { const previous = this.undoStack.pop(); if (previous) { this.redoStack.push(JSON.stringify(this.sheets)); this.sheets = JSON.parse(previous); this.reindex() } }
  redo() { const next = this.redoStack.pop(); if (next) { this.undoStack.push(JSON.stringify(this.sheets)); this.sheets = JSON.parse(next); this.reindex() } }
  get dirty() { return JSON.stringify(this.sheets) !== this.savedSnapshot }
  async save() {
    const snapshot = JSON.stringify(this.sheets)
    this.zip.file('content.json', snapshot)
    const manifestFile = this.zip.file('manifest.json')
    const manifest = manifestFile ? JSON.parse(await manifestFile.async('string')) : { 'file-entries': {} }
    manifest['file-entries'] ||= {}
    this.zip.forEach((path, file) => { if (!file.dir && path.startsWith('resources/')) manifest['file-entries'][path] ||= {} })
    this.zip.file('manifest.json', JSON.stringify(manifest))
    const blob = await this.zip.generateAsync({ type: 'blob' })
    this.savedSnapshot = snapshot
    return blob
  }
}
