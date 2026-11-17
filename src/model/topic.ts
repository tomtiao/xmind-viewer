import Model, { ModelData }  from './model'
import { TopicType } from '../common/constants/models'
import { ExtensionProvider, ExtensionContentName } from '../common/constants/extensions'
import { StyleData } from './style'
import { StyleKey } from '../common/constants/styles'
import Sheet from './sheet'

export interface TopicData extends ModelData {
  title: string,
  structureClass?: string,
  children?: {
    [type: string]: Array<TopicData>
  },
  customWidth?: string,
  style?: StyleData,
  extensions?: Array<ExtensionData>,
  markers?: Array<{ markerId: string }>,
  image?: { src: string, width?: number, height?: number },
  renderImage?: { src: string, width: number, height: number },
  position?: { x: number, y: number },
  branch?: string,
}

export interface ExtensionData {
  provider: string,
  content: string | [object],
}

export function parseTopic(data: TopicData, sheet: Sheet): Topic {
  const topic = new Topic(data)
  topic.ownerSheet = sheet

  if (data.children) {
    for (const type of [TopicType.ATTACHED, TopicType.DETACHED]) {
      if (type === TopicType.ATTACHED && data.branch === 'folded') continue
      data.children[type]?.forEach(d => topic.addSubtopic(parseTopic(d, sheet), { type }))
    }
  }

  return topic
}

export default class Topic extends Model {

  type: TopicType

  private readonly _data: TopicData

  private _children: {
    [type: string]: Array<Topic>
  }

  private _extensionMap: {
    [provider: string]: ExtensionData
  }

  constructor(data: TopicData) {
    super()

    this._data = data
    this._children = {}
    this._extensionMap = {}

    if (data.extensions) {
      data.extensions.forEach(ext => {
        if (ext.provider) {
          this._extensionMap[ext.provider] = ext
        }
      })
    }
  }

  get title(): string {
    return this._data.title
  }

  get markers() { return this._data.markers || [] }
  get renderImage() { return this._data.renderImage }
  get position() { return this._data.position }
  get id() { return this._data.id }

  get customWidth(): number {
    return parseInt(this._data.customWidth) || 0
  }

  get structureClass(): string {
    return this._data.structureClass
  }

  addSubtopic(subtopic: Topic, options: { type?: TopicType } = {}) {
    if (!subtopic) return

    const type = options.type || TopicType.ATTACHED
    this._addSubtopic(subtopic, { type })
  }

  private _addSubtopic(subtopic: Topic, options: { type: TopicType }) {
    const type = options.type
    if (!this._children[type]) {
      this._children[type] = []
    }
    this._children[type].push(subtopic)

    subtopic.parent = this
    subtopic.type = type
  }

  getChildrenByType(type: TopicType): Array<Topic> {
    if (this._children[type]) {
      return Object.assign([], this._children[type])
    }
    return []
  }

  getStyleValue(key: StyleKey) {
    const style = this._data.style
    return style && style.properties[key]
  }

  getUnbalancedInfo(): { rightSideCount: number } {
    const extension = this._extensionMap[ExtensionProvider.UNBALANCED_MAP]
    const content = extension && extension.content
    if (content && content.length > 0) {
      const info = content[0] as any
      if (info.name === ExtensionContentName.RIGHT_NUMBER) {
        const rightSideCount = parseInt(info.content || -1)
        return rightSideCount >= 0 ? { rightSideCount } : null
      }
    }
  }

}
