import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { EditorDocument } from '../src/editorDocument'
import type { SheetData } from '../src/model/sheet'

function document() {
  const sheets = [{ id: 's', title: 'Sheet', unknown: { keep: true }, arrangeableLayerOrder: ['root'], rootTopic: { id: 'root', title: 'Root', children: { attached: [{ id: 'a', title: 'A', extra: 7 }] } } }, { id: 'other', title: 'Other', rootTopic: { id: 'other-root', title: 'Other' } }] as unknown as SheetData[]
  return new EditorDocument(sheets, new JSZip().file('resources/original', 'bytes'))
}

describe('document commands', () => {
  it('keeps unknown fields, other sheets and archive entries across history and save', async () => {
    const doc = document()
    doc.rename('a', '中文')
    const added = doc.add('a')
    expect(doc.index.get(added)?.parent?.id).toBe('a')
    doc.toggleFold('a')
    expect(doc.index.get('a')?.topic.branch).toBe('folded')
    doc.undo(); expect(doc.index.get('a')?.topic.branch).toBeUndefined()
    doc.undo(); expect(doc.index.has(added)).toBe(false)
    doc.redo(); expect(doc.index.has(added)).toBe(true)
    const zip = await JSZip.loadAsync(await (await doc.save()).arrayBuffer())
    const data = JSON.parse(await zip.file('content.json')!.async('string'))
    expect(data[0].unknown).toEqual({ keep: true })
    expect(data[0].rootTopic.children.attached[0]).toMatchObject({ title: '中文', extra: 7 })
    expect(data[1].rootTopic.title).toBe('Other')
    expect(await zip.file('resources/original')!.async('string')).toBe('bytes')
  })
  it('maintains floating layer order and prevents unsafe removal', () => {
    const doc = document()
    const id = doc.add('root', 'detached')
    expect((doc.sheets[0] as any).arrangeableLayerOrder).toContain(id)
    doc.remove(id)
    expect((doc.sheets[0] as any).arrangeableLayerOrder).not.toContain(id)
    ;(doc.sheets[0] as any).relationships = [{ end1Id: 'a' }]
    expect(() => doc.remove('a')).toThrow('关系线')
    expect(doc.index.has('a')).toBe(true)
  })
  it('moves topics without cycles and restores their order with undo', () => {
    const doc = document()
    const child = doc.add('a')
    expect(() => doc.move('a', child)).toThrow('自身或后代')
    doc.move(child, 'root', 0)
    expect(doc.index.get(child)?.parent?.id).toBe('root')
    doc.undo()
    expect(doc.index.get(child)?.parent?.id).toBe('a')
  })
})
