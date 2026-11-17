import type FontInfo from './fontInfo'

interface FontNode {
  content: string,
  style: FontInfo
}

const FONT_WEIGHT_STRING_TO_NUMBER: Record<string, number> = {
  'normal': 400,
  'regular': 400,
  'bold': 700
}

let measurementContext: CanvasRenderingContext2D | undefined

function getMeasurementContext(): CanvasRenderingContext2D {
  if (!measurementContext) {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('当前浏览器不支持 Canvas 文字测量。')
    measurementContext = context
  }
  return measurementContext
}

function str2NodesArr(s: string, fontInfo: FontInfo): FontNode[][] {
  const arr = s.split('\n')
  return arr.map((s) => (s === '') ? [] : [{ content: s, style: fontInfo }])
}

function getNodesSize(nodes: FontNode[]) {
  let width = 0
  let height = 0

  nodes.forEach((node) => {
    const { width: w, height: h } = getTextSize(node)
    width += w
    height = Math.max(height, h)
  })

  return { width, height }
}

function getTextSize(node: FontNode) {
  let fontWeight = node.style.fontWeight

  if (FONT_WEIGHT_STRING_TO_NUMBER[`${fontWeight}`.toLowerCase()]) {
    fontWeight = String(FONT_WEIGHT_STRING_TO_NUMBER[`${fontWeight}`.toLowerCase()])
  }

  let fontSize = Number.parseInt(node.style.fontSize)
  const preFontSize = fontSize
  let ratio = 1
  if (fontSize < 12) {
    ratio = fontSize / 12
    fontSize = 12
  }

  const fontSizePx = fontSize + 'px'
  const fontStyle = node.style.fontStyle
  const fontFamily = node.style.fontFamily
  const fontArr = [fontStyle, fontWeight, fontSizePx, fontFamily]

  const ctx = getMeasurementContext()
  // Reset the cached context so an unsupported font cannot retain the previous one.
  ctx.font = '10px sans-serif'
  ctx.font = fontArr.filter(item => item).join(' ')

  const lines = node.content.split('\n')
  const widthArr = lines.map((line) => {
    return ctx.measureText(line).width
  })

  const width = Math.max(...widthArr) * ratio
  const height = lines.length * preFontSize
  return { width, height }
}

export {
  str2NodesArr,
  getNodesSize,
  getTextSize,
}

export type { FontNode }
