import View from './view'
import ViewType from '../common/constants/views'
import Position, { isSamePosition } from '../utils/position'
import { getTopicShape } from './renderEngine/topicShape'
import { G, Path } from '@svgdotjs/svg.js'
import { markerColors } from '../markers'

export default class TopicView extends View {

  type = ViewType.TOPIC

  topicShapeClass: string = 'org.xmind.topicShape.roundedRect'

  lineWidth: number
  lineCorner: number
  borderColor: string
  borderWidth: number

  marginTop: number
  marginLeft: number
  marginRight: number
  marginBottom: number

  minimumWidth: number
  image?: { src: string, width: number, height: number }
  imagePosition?: Position
  markers: string[] = []
  markerPosition?: Position

  private _lineColor: string
  lineColorDirty = false

  private _fillColor: string
  fillColorDirty = false

  private _topicShapePath: string
  topicShapePathDirty = false

  private _topicShapeGroupPosition: Position
  topicShapeGroupPositionDirty = false

  private _topicContentPosition: Position
  topicContentPositionDirty = false

  private _topicInnerElementPosition: Position
  topicInnerElementPositionDirty = false

  private readonly _svg: G
  private _topicShape: Path
  private _topicShapeFill: Path
  private _topicContent: G
  private _topicInnerElementGroup: G

  constructor() {
    super()
    this._svg = new G().data('name', 'topic')
    this._initSVGStructure()
  }

  private _initSVGStructure() {
    const topicShapeGroup = this._svg.group().data('name', 'topic-shape-group')
    this._topicShape = topicShapeGroup.path().data('name', 'topic-shape')
    this._topicShapeFill = topicShapeGroup.path().data('name', 'topic-shape-fill')

    this._topicContent = topicShapeGroup.group().data('name', 'topic-content')
    this._topicInnerElementGroup = this._topicContent.group().data('name', 'inner-element-group')
  }

  set lineColor(lineColor: string) {
    if (this._lineColor !== lineColor) {
      this._lineColor = lineColor
      this.lineColorDirty = true
    }
  }

  get lineColor() {
    return this._lineColor
  }

  set fillColor(fillColor: string) {
    if (this._fillColor !== fillColor) {
      this._fillColor = fillColor
      this.fillColorDirty = true
    }
  }

  get fillColor() {
    return this._fillColor
  }

  set topicShapeGroupPosition(topicShapeGroupPosition: Position) {
    const newPositionDirty = !this._topicShapeGroupPosition || !isSamePosition(this._topicShapeGroupPosition, topicShapeGroupPosition)
    if (newPositionDirty) {
      this.topicShapeGroupPositionDirty = newPositionDirty
    }
    this._topicShapeGroupPosition = { ...topicShapeGroupPosition }
  }

  set topicContentPosition(topicContentPosition: Position) {
    const newPositionDirty = !this._topicContentPosition || !isSamePosition(this._topicContentPosition, topicContentPosition)
    if (newPositionDirty) {
      this.topicContentPositionDirty = newPositionDirty
    }
    this._topicContentPosition = { ...topicContentPosition }
  }

  get topicContentPosition(): Position {
    return this._topicContentPosition
  }

  set topicInnerElementPosition(topicInnerElementPosition: Position) {
    const newPositionDirty = !this._topicInnerElementPosition || !isSamePosition(this._topicInnerElementPosition, topicInnerElementPosition)
    if (newPositionDirty) {
      this.topicInnerElementPositionDirty = newPositionDirty
    }
    this._topicInnerElementPosition = { ...topicInnerElementPosition }
  }

  set topicShapePath(path: string) {
    if (this._topicShapePath !== path) {
      this._topicShapePath = path
      this.topicShapePathDirty = true
    }
  }

  get topicShapePath(): string {
    return this._topicShapePath
  }

  get topicShape() {
    return getTopicShape(this.topicShapeClass)
  }

  render(parentView: View) {
    if (!parentView) return

    if (this.image && this.imagePosition) {
      this._topicContent.image(this.image.src).size(this.image.width, this.image.height)
        .move(this.imagePosition.x, this.imagePosition.y)
    }
    if (this.markerPosition) this.markers.forEach((marker, index) => {
      const x = this.markerPosition.x + index * 16
      const y = this.markerPosition.y
      const icon = this._topicContent.group().attr({ 'data-marker-id': marker, 'aria-label': marker })
      const separator = marker.indexOf('-')
      const kind = marker.slice(0, separator), suffix = marker.slice(separator + 1)
      const color = markerColors[suffix]
      if ((kind === 'tag' || kind === 'flag') && color) {
        icon.circle(13).fill(color).move(x, y + 1)
        if (kind === 'flag') icon.path(`M ${x + 4} ${y + 3} v 9 M ${x + 5} ${y + 3} l 6 2 -6 2 z`).fill('#fff').stroke({ color: '#fff', width: 0.6 })
      } else if (kind === 'priority' && /^[1-9]$/.test(suffix)) {
        icon.circle(13).fill('#ef665f').move(x, y + 1)
        icon.text(suffix).font({ family: 'sans-serif', size: 10, weight: 700, anchor: 'middle' }).fill('#fff').move(x + 3.5, y + 0.5)
      } else if (kind === 'task' && ['start', 'oct', 'quarter', '3oct', 'half', '5oct', '3quar', '7oct', 'done', 'pause'].includes(suffix)) {
        icon.circle(13).fill('#fff').stroke({ color: '#5fa4d8', width: 1.5 }).move(x, y + 1)
        const fractions: Record<string, number> = { oct: 1/8, quarter: 2/8, '3oct': 3/8, half: 4/8, '5oct': 5/8, '3quar': 6/8, '7oct': 7/8 }
        const fraction = fractions[suffix]
        if (fraction) { const angle = 2 * Math.PI * fraction - Math.PI / 2; const endX = x + 6.5 + 6.5 * Math.cos(angle), endY = y + 7.5 + 6.5 * Math.sin(angle); icon.path(`M ${x+6.5} ${y+7.5} V ${y+1} A 6.5 6.5 0 ${fraction > .5 ? 1 : 0} 1 ${endX} ${endY} Z`).fill('#5fa4d8') }
        if (suffix === 'done') icon.path(`M ${x+3} ${y+7} l 2.5 3 5 -6`).fill('none').stroke({ color: '#5fa4d8', width: 1.5 })
        if (suffix === 'pause') icon.path(`M ${x+5} ${y+4} v 7 M ${x+8} ${y+4} v 7`).fill('none').stroke({ color: '#5fa4d8', width: 1.5 })
      } else if (kind === 'smiley') {
        icon.circle(13).fill('#f8ce50').move(x, y + 1)
        icon.text(suffix === 'smile' || suffix === 'laugh' ? '☺' : '☹').font({ size: 11 }).fill('#674f22').move(x + 1, y)
      } else {
        icon.rect(13, 13).radius(2).fill('#777').move(x, y + 1)
        icon.text('?').font({ size: 10, weight: 700 }).fill('#fff').move(x + 3, y)
      }
    })

    // Topic Shape
    if (this.topicShapePathDirty) {
      this._topicShape.attr({ d: this.topicShapePath })
    }

    if (this.fillColorDirty) {
      this._topicShape.attr({ fill: this.fillColor, stroke: this.borderColor })
    }
    this._topicShape.attr({ 'stroke-width': this.borderWidth })

    // Topic Shape Fill 
    // this._topicShapeFill.attr({ d: topicShapePath })
    this._topicShapeFill.attr({ fill: this.fillColor, stroke: '#ffffff' })

    if (this.topicContentPositionDirty) {
      //this.topicContentPosition
      this._topicContent.translate(this.topicContentPosition.x, this.topicContentPosition.y)
      this.topicContentPositionDirty = false
    }

    if (this.topicInnerElementPositionDirty) {
      this._topicInnerElementGroup.translate(this._topicInnerElementPosition.x, this._topicInnerElementPosition.y)
      this.topicInnerElementPositionDirty = false
    }

    parentView.appendChild(this)
  }

  appendChild(view: View) {
    const { type, content } = view
    switch (type) {
      case ViewType.TOPIC_TITLE: {
        this._topicInnerElementGroup.add(content)
      }
    }
  }

  get content() {
    return this._svg
  }

}
