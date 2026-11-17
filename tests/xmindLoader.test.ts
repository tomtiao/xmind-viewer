import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { loadFromXMind } from '../src/xmindLoader'

const sheets = [{
  id: 'sheet-1',
  title: '导图',
  rootTopic: {
    id: 'root',
    title: '中心主题',
    structureClass: 'org.xmind.ui.map.clockwise',
    markers: [{ markerId: 'flag-red' }],
    children: {
      attached: [{ id: 'child', title: '图片主题', image: { src: 'xap:resources/image.png' } }],
      detached: [{ id: 'floating', title: '自由主题', position: { x: -67, y: -193 } }]
    }
  },
  theme: { futureThemeProperty: true },
  futureSheetProperty: { retained: true }
}]

describe('loadFromXMind', () => {
  it('reads a real ZIP round trip and preserves fields that the renderer does not support yet', async () => {
    const source = new JSZip()
      .file('content.json', JSON.stringify(sheets))
      .file('content.xml', '<warning>Compatibility placeholder</warning>')
      .file('resources/image.png', new Uint8Array([1, 2, 3]))
    const zip = await JSZip.loadAsync(await source.generateAsync({ type: 'uint8array' }))

    expect(await loadFromXMind(zip)).toEqual({ sheets })
  })

  it('reports XML-only files explicitly', async () => {
    const zip = new JSZip().file('content.xml', '<xmap-content />')
    await expect(loadFromXMind(zip)).rejects.toThrow('暂不支持旧版 XML')
  })

  it('reports missing content', async () => {
    await expect(loadFromXMind(new JSZip())).rejects.toThrow('缺少 content.json')
  })

  it('rejects malformed JSON', async () => {
    const zip = new JSZip().file('content.json', '{')
    await expect(loadFromXMind(zip)).rejects.toThrow(SyntaxError)
  })

  it.each([null, {}, [], [null], [{ id: 'sheet', title: 'Sheet' }]])(
    'rejects invalid sheet data: %j',
    async value => {
      const zip = new JSZip().file('content.json', JSON.stringify(value))
      await expect(loadFromXMind(zip)).rejects.toThrow('工作表数组')
    }
  )
})
