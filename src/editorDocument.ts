import JSZip from 'jszip'
import type { SheetData } from './model/sheet'
import type { TopicData } from './model/topic'

interface Entry {
  topic: TopicData
  parent?: TopicData
  type?: string
  sheet: SheetData
}

function hasUnsupportedReferences(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) => {
    if (['relationships', 'boundaries', 'summaries'].includes(key) && child && typeof child === 'object' && Object.keys(child).length > 0) return true
    return hasUnsupportedReferences(child)
  })
}

function requireSafeStructure(sheet: SheetData) {
  if (hasUnsupportedReferences(sheet)) throw new Error('此工作表含关系线、边界或概要，暂不支持结构修改。')
}

const UNBALANCED = 'org.xmind.ui.map.unbalanced'
export function rightSideCount(topic: TopicData): number | undefined {
  if (topic.structureClass !== UNBALANCED) return undefined
  const extension = topic.extensions?.find(item => item.provider === UNBALANCED)
  const content = Array.isArray(extension?.content) ? extension.content as Array<{ name?: string, content?: string }> : []
  const raw = content.find(item => item.name === 'right-number')?.content
  if (raw === undefined || !/^\d+$/.test(raw)) return undefined
  const count = Number(raw)
  return Number.isSafeInteger(count) && count <= (topic.children?.attached?.length || 0) ? count : undefined
}
function writeRightSideCount(topic: TopicData, count: number) {
  topic.structureClass = UNBALANCED
  topic.extensions ||= []
  let extension = topic.extensions.find(item => item.provider === UNBALANCED)
  if (!extension) {
    extension = { provider: UNBALANCED, content: [] as unknown as [object] }
    topic.extensions.push(extension)
  }
  if (!Array.isArray(extension.content)) throw new Error('无法安全修改此导图的左右侧配置。')
  const content = extension.content as Array<{ name?: string, content?: string }>
  const item = content.find(value => value.name === 'right-number')
  if (item) item.content = String(count)
  else content.push({ name: 'right-number', content: String(count) })
}

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
    try {
      fn()
      this.reindex()
    } catch (error) {
      this.sheets = JSON.parse(before)
      this.reindex()
      throw error
    }
    if (JSON.stringify(this.sheets) !== before) {
      this.undoStack.push(before)
      this.redoStack = []
    }
  }
  private entry(id: string): Entry {
    const entry = this.index.get(id)
    if (!entry) throw new Error('主题不存在。')
    return entry
  }
  rename(id: string, title: string) {
    this.change(() => {
      const topic = this.entry(id).topic
      topic.title = title
      delete (topic as TopicData & { titleUnedited?: boolean }).titleUnedited
    })
  }
  add(parentId: string, type = 'attached', index?: number, position?: { x: number, y: number }, insertOnRight = false): string {
    let id = ''
    this.change(() => {
      const parent = this.entry(parentId).topic
      requireSafeStructure(this.entry(parentId).sheet)
      const count = type === 'attached' ? rightSideCount(parent) : undefined
      id = crypto.randomUUID()
      parent.children ||= {}
      const children = parent.children[type] ||= []
      const at = index === undefined ? children.length : Math.min(Math.max(index, 0), children.length)
      children.splice(at, 0, {
        id,
        title: type === 'detached' ? '自由主题' : '新主题',
        ...(type === 'detached' ? { position: position || { x: 0, y: -150 } } : {})
      })
      if (count !== undefined && (at < count || (at === count && insertOnRight))) writeRightSideCount(parent, count + 1)
      if (type === 'attached' && parent.branch === 'folded') delete parent.branch
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
      requireSafeStructure(entry.sheet)
      const ids: string[] = []
      const collect = (topic: TopicData) => {
        ids.push(topic.id)
        Object.values(topic.children || {}).flat().forEach(collect)
      }
      collect(entry.topic)
      const siblings = entry.parent.children![entry.type!]
      const count = entry.type === 'attached' ? rightSideCount(entry.parent) : undefined
      const removedIndex = siblings.indexOf(entry.topic)
      siblings.splice(siblings.indexOf(entry.topic), 1)
      if (count !== undefined && removedIndex < count) writeRightSideCount(entry.parent, count - 1)
      const sheet = entry.sheet as SheetData & { arrangeableLayerOrder?: string[] }
      if (sheet.arrangeableLayerOrder) sheet.arrangeableLayerOrder = sheet.arrangeableLayerOrder.filter(item => !ids.includes(item))
    })
  }
  move(id: string, parentId: string, index?: number, targetRight?: boolean) {
    this.change(() => {
      const source = this.entry(id), destination = this.entry(parentId)
      if (!source.parent || source.type !== 'attached') throw new Error('只能移动普通子主题。')
      if (source.sheet !== destination.sheet) throw new Error('不能跨工作表移动主题。')
      for (let current: TopicData | undefined = destination.topic; current; current = this.index.get(current.id)?.parent) {
        if (current.id === id) throw new Error('不能将主题移入自身或后代。')
      }
      requireSafeStructure(source.sheet)
      const from = source.parent.children![source.type]
      const oldIndex = from.indexOf(source.topic)
      const sourceCount = rightSideCount(source.parent)
      const destinationCount = rightSideCount(destination.topic)
      const sourceWasRight = sourceCount !== undefined && oldIndex < sourceCount
      const targetOnRight = destinationCount !== undefined && index !== undefined && (
        targetRight ?? (index < destinationCount || (index === destinationCount && source.parent === destination.topic && sourceWasRight))
      )
      if (source.parent === destination.topic && index !== undefined && oldIndex < index) index--
      from.splice(oldIndex, 1)
      if (sourceCount !== undefined && oldIndex < sourceCount) writeRightSideCount(source.parent, sourceCount - 1)
      destination.topic.children ||= {}
      const to = destination.topic.children.attached ||= []
      to.splice(index === undefined ? to.length : Math.max(0, Math.min(index, to.length)), 0, source.topic)
      if (targetOnRight) {
        const remaining = source.parent === destination.topic && sourceWasRight ? sourceCount! - 1 : destinationCount!
        writeRightSideCount(destination.topic, remaining + 1)
      }
      if (destination.topic.branch === 'folded') delete destination.topic.branch
    })
  }
  setSide(id: string, side: 'left' | 'right', displayedRightCount: number) {
    this.change(() => {
      const entry = this.entry(id), root = entry.sheet.rootTopic
      if (entry.parent !== root || entry.type !== 'attached') throw new Error('只有主主题可以换侧。')
      requireSafeStructure(entry.sheet)
      const siblings = root.children!.attached
      const count = rightSideCount(root) ?? displayedRightCount
      if (!Number.isInteger(count) || count < 0 || count > siblings.length) throw new Error('无法确定当前左右侧。')
      const index = siblings.indexOf(entry.topic), wasRight = index < count
      if (wasRight === (side === 'right')) return
      siblings.splice(index, 1)
      const remainingRight = count - (wasRight ? 1 : 0)
      siblings.splice(side === 'right' ? remainingRight : siblings.length, 0, entry.topic)
      writeRightSideCount(root, remainingRight + (side === 'right' ? 1 : 0))
    })
  }
  position(id: string, x: number, y: number) {
    this.change(() => {
      const entry = this.entry(id)
      if (entry.type !== 'detached') throw new Error('只有自由主题可以直接定位。')
      entry.topic.position = { x, y }
    })
  }
  toggleMarker(id: string, markerId: string) {
    this.change(() => {
      const topic = this.entry(id).topic
      topic.markers ||= []
      const at = topic.markers.findIndex(marker => marker.markerId === markerId)
      if (at < 0) topic.markers.push({ markerId })
      else topic.markers.splice(at, 1)
    })
  }
  setImage(id: string, path: string, width: number, height: number) {
    this.change(() => {
      const topic = this.entry(id).topic
      topic.image = { ...topic.image, src: `xap:${path}`, width, height }
    })
  }
  resizeImage(id: string, width: number, ratio?: number) {
    this.change(() => {
      const image = this.entry(id).topic.image
      if (!image || !Number.isFinite(width) || width <= 0) throw new Error('请输入有效的图片宽度。')
      const aspect = image.width && image.height ? image.height / image.width : ratio
      if (!aspect || !Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(aspect * width)) throw new Error('图片尺寸不可用。')
      image.height = Math.max(1, Math.round(aspect * width))
      image.width = width
    })
  }
  toggleFold(id: string) {
    this.change(() => {
      const entry = this.entry(id), topic = entry.topic
      if (!entry.parent) throw new Error('不能折叠中心主题。')
      if (topic.branch === 'folded') delete topic.branch
      else if (topic.children?.attached?.length) topic.branch = 'folded'
      else throw new Error('此主题没有可折叠的子主题。')
    })
  }
  undo() {
    const previous = this.undoStack.pop()
    if (previous) {
      this.redoStack.push(JSON.stringify(this.sheets))
      this.sheets = JSON.parse(previous)
      this.reindex()
    }
  }
  redo() {
    const next = this.redoStack.pop()
    if (next) {
      this.undoStack.push(JSON.stringify(this.sheets))
      this.sheets = JSON.parse(next)
      this.reindex()
    }
  }
  get dirty() { return JSON.stringify(this.sheets) !== this.savedSnapshot }
  async save() {
    const snapshot = JSON.stringify(this.sheets)
    this.zip.file('content.json', snapshot)
    const manifestFile = this.zip.file('manifest.json')
    const manifest = manifestFile ? JSON.parse(await manifestFile.async('string')) : { 'file-entries': {} }
    let manifestChanged = !manifestFile
    if (!manifest['file-entries']) {
      manifest['file-entries'] = {}
      manifestChanged = true
    }
    this.zip.forEach((path, file) => {
      if (!file.dir && path.startsWith('resources/') && !(path in manifest['file-entries'])) {
        manifest['file-entries'][path] = {}
        manifestChanged = true
      }
    })
    if (manifestChanged) this.zip.file('manifest.json', JSON.stringify(manifest))
    const blob = await this.zip.generateAsync({ type: 'blob' })
    this.savedSnapshot = snapshot
    return blob
  }
}
