import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { EditorDocument, rightSideCount } from '../src/editorDocument'
import type { SheetData } from '../src/model/sheet'

const UNBALANCED = 'org.xmind.ui.map.unbalanced'

function document(count?: number, configure?: (sheets: SheetData[]) => void) {
  const sheets = [{
    id: 'sheet', title: 'Map',
    rootTopic: {
      id: 'root', title: 'Root',
      structureClass: count === undefined ? 'org.xmind.ui.map.clockwise' : UNBALANCED,
      ...(count === undefined ? {} : { extensions: [{ provider: UNBALANCED, content: [{ name: 'right-number', content: String(count) }] }] }),
      children: { attached: ['a', 'b', 'c', 'd'].map(id => ({ id, title: id.toUpperCase() })) }
    }
  }, { id: 'other-sheet', title: 'Other', rootTopic: { id: 'other-root', title: 'Other' } }] as SheetData[]
  configure?.(sheets)
  return new EditorDocument(sheets, new JSZip())
}

const root = (doc: EditorDocument) => doc.sheets[0].rootTopic
const order = (doc: EditorDocument) => root(doc).children!.attached.map(topic => topic.id)

describe('history and save checkpoints', () => {
  it('invalidates redo after a new edit and keeps no-op commands out of history', () => {
    const doc = document()
    doc.rename('a', 'First edit')
    doc.undo()
    doc.rename('a', 'A')
    doc.setSide('a', 'right', 2)
    doc.redo()
    expect(doc.index.get('a')!.topic.title).toBe('First edit')
    doc.undo()
    doc.rename('b', 'New branch')
    doc.redo()
    expect(doc.index.get('a')!.topic.title).toBe('A')
    expect(doc.index.get('b')!.topic.title).toBe('New branch')
    doc.undo()
    expect(doc.dirty).toBe(false)
    doc.undo()
    expect(doc.dirty).toBe(false)
  })

  it('restores JSON, indexes and redo when a command throws after partial mutation', () => {
    const doc = document(undefined, sheets => {
      sheets[0].rootTopic.extensions = [{ provider: UNBALANCED, content: { opaque: true } as any }]
    })
    doc.rename('a', 'Preserved redo')
    doc.undo()
    const before = structuredClone(doc.sheets)
    // setSide reorders the array before rejecting this unsupported extension representation.
    expect(() => doc.setSide('a', 'left', 2)).toThrow('左右侧配置')
    expect(doc.sheets).toEqual(before)
    expect(doc.dirty).toBe(false)
    expect(doc.index.get('a')!.parent).toBe(root(doc))
    expect(doc.index.get('a')!.sheet).toBe(doc.sheets[0])
    doc.redo()
    expect(doc.index.get('a')!.topic.title).toBe('Preserved redo')
  })

  it('tracks dirty state relative to the last saved snapshot through undo and redo', async () => {
    const doc = document()
    expect(doc.dirty).toBe(false)
    doc.rename('a', 'Saved version')
    expect(doc.dirty).toBe(true)
    await doc.save()
    expect(doc.dirty).toBe(false)
    doc.rename('a', 'Unsaved version')
    expect(doc.dirty).toBe(true)
    doc.undo()
    expect(doc.dirty).toBe(false)
    doc.undo()
    expect(doc.dirty).toBe(true)
    doc.redo()
    expect(doc.dirty).toBe(false)
    doc.redo()
    expect(doc.dirty).toBe(true)
  })

  it('saves a consistent snapshot while a later edit remains dirty', async () => {
    const doc = document()
    doc.rename('a', 'Snapshot')
    const pending = doc.save()
    doc.rename('a', 'Later edit')
    const zip = await JSZip.loadAsync(await (await pending).arrayBuffer())
    const saved = JSON.parse(await zip.file('content.json')!.async('string'))
    expect(saved[0].rootTopic.children.attached[0].title).toBe('Snapshot')
    expect(doc.index.get('a')!.topic.title).toBe('Later edit')
    expect(doc.dirty).toBe(true)
    await doc.save()
    expect(doc.dirty).toBe(false)
  })

  it('keeps a failed save dirty and preserves manifest metadata on recovery', async () => {
    const doc = document()
    doc.rename('a', 'Pending')
    doc.zip.file('manifest.json', '{')
    await expect(doc.save()).rejects.toThrow(SyntaxError)
    expect(doc.dirty).toBe(true)
    doc.undo()
    expect(doc.dirty).toBe(false)
    doc.redo()
    const original = { extra: { keep: true }, 'file-entries': { 'resources/old.bin': { custom: 7 } } }
    doc.zip.file('manifest.json', JSON.stringify(original))
    doc.zip.file('resources/old.bin', new Uint8Array([0, 255]))
    doc.zip.file('resources/new.bin', new Uint8Array([1, 2]))
    const output = await JSZip.loadAsync(await (await doc.save()).arrayBuffer())
    expect(JSON.parse(await output.file('manifest.json')!.async('string'))).toEqual({
      ...original, 'file-entries': { ...original['file-entries'], 'resources/new.bin': {} }
    })
    expect(await output.file('resources/old.bin')!.async('uint8array')).toEqual(new Uint8Array([0, 255]))
    expect(doc.dirty).toBe(false)
  })
})

describe('structural command boundaries', () => {
  it.each([
    { id: 'a', index: undefined, expected: ['b', 'c', 'd', 'a'] },
    { id: 'd', index: 0, expected: ['d', 'a', 'b', 'c'] },
    { id: 'b', index: 3, expected: ['a', 'c', 'b', 'd'] },
    { id: 'c', index: 1, expected: ['a', 'c', 'b', 'd'] },
    { id: 'a', index: 99, expected: ['b', 'c', 'd', 'a'] },
    { id: 'c', index: -1, expected: ['c', 'a', 'b', 'd'] },
    { id: 'a', index: 1, expected: ['a', 'b', 'c', 'd'] }
  ])('moves $id to insertion gap $index without losing siblings', ({ id, index, expected }) => {
    const doc = document()
    const before = structuredClone(doc.sheets)
    doc.move(id, 'root', index)
    expect(order(doc)).toEqual(expected)
    expect(doc.index.size).toBe(6)
    expect(doc.index.get(id)!.parent).toBe(root(doc))
    doc.undo()
    expect(doc.sheets).toEqual(before)
    doc.redo()
    expect(order(doc)).toEqual(expected)
  })

  it.each(['relationships', 'boundaries', 'summaries'])('rejects structural edits with nested %s references atomically', key => {
    const doc = document(undefined, sheets => {
      Object.assign(sheets[0].rootTopic.children!.attached[0], { [key]: [{ range: '(0,1)', unknown: true }] })
    })
    const before = structuredClone(doc.sheets)
    for (const action of [() => doc.add('root'), () => doc.remove('b'), () => doc.move('b', 'c')]) {
      expect(action).toThrow('结构修改')
      expect(doc.sheets).toEqual(before)
      expect(doc.dirty).toBe(false)
    }
    doc.rename('a', 'Safe text edit')
    doc.undo()
    expect(doc.sheets).toEqual(before)
  })

  it.each([
    { name: 'cross-sheet move', action: (doc: EditorDocument) => doc.move('a', 'other-root') },
    { name: 'root deletion', action: (doc: EditorDocument) => doc.remove('root') },
    { name: 'root folding', action: (doc: EditorDocument) => doc.toggleFold('root') },
    { name: 'leaf folding', action: (doc: EditorDocument) => doc.toggleFold('a') },
    { name: 'self move', action: (doc: EditorDocument) => doc.move('a', 'a') },
    { name: 'ordinary topic coordinates', action: (doc: EditorDocument) => doc.position('a', 20, 30) }
  ])('rejects $name without changing the document or history', ({ action }) => {
    const doc = document()
    const before = structuredClone(doc.sheets)
    expect(() => action(doc)).toThrow()
    expect(doc.sheets).toEqual(before)
    expect(doc.dirty).toBe(false)
    doc.undo()
    expect(doc.sheets).toEqual(before)
  })

  it('rejects duplicate IDs across sheets before an ambiguous index can be used', () => {
    expect(() => document(undefined, sheets => { sheets[1].rootTopic.id = 'a' })).toThrow('重复主题 ID')
  })
})

describe('unbalanced side partitions', () => {
  it.each([
    { id: 'a', index: 4, right: false, expected: ['b', 'c', 'd', 'a'], count: 1 },
    { id: 'c', index: 1, right: true, expected: ['a', 'c', 'b', 'd'], count: 3 },
    { id: 'b', index: 0, right: true, expected: ['b', 'a', 'c', 'd'], count: 2 },
    { id: 'd', index: 2, right: false, expected: ['a', 'b', 'd', 'c'], count: 2 },
    { id: 'b', index: 2, right: true, expected: ['a', 'b', 'c', 'd'], count: 2 },
    { id: 'c', index: 2, right: false, expected: ['a', 'b', 'c', 'd'], count: 2 }
  ])('maintains the partition while moving $id to gap $index on right=$right', ({ id, index, right, expected, count }) => {
    const doc = document(2)
    const before = structuredClone(doc.sheets)
    doc.move(id, 'root', index, right)
    expect(order(doc)).toEqual(expected)
    expect(rightSideCount(root(doc))).toBe(count)
    doc.undo()
    expect(doc.sheets).toEqual(before)
    doc.redo()
    expect(order(doc)).toEqual(expected)
    expect(rightSideCount(root(doc))).toBe(count)
  })

  it.each([
    { count: 0, index: 0, right: false, expected: 0 },
    { count: 0, index: 0, right: true, expected: 1 },
    { count: 4, index: 4, right: false, expected: 4 },
    { count: 4, index: 4, right: true, expected: 5 }
  ])('inserts at the edge of a $count-right partition, right=$right', ({ count, index, right, expected }) => {
    const doc = document(count)
    const added = doc.add('root', 'attached', index, undefined, right)
    expect(order(doc)[index]).toBe(added)
    expect(rightSideCount(root(doc))).toBe(expected)
    doc.remove(added)
    expect(rightSideCount(root(doc))).toBe(count)
    expect(order(doc)).toEqual(['a', 'b', 'c', 'd'])
  })

  it.each([0, 4])('retains a valid count after removing all topics from a %s-right map', count => {
    const doc = document(count)
    for (const id of ['a', 'b', 'c', 'd']) doc.remove(id)
    expect(rightSideCount(root(doc))).toBe(0)
    expect(order(doc)).toEqual([])
    doc.undo()
    expect(order(doc)).toEqual(['d'])
    expect(rightSideCount(root(doc))).toBe(count === 0 ? 0 : 1)
  })

  it.each([true, false])('updates counts when a subtree enters or leaves the root, targetRight=%s', right => {
    const doc = document(2)
    const child = doc.add('b')
    const before = structuredClone(doc.sheets)
    doc.move(child, 'root', right ? 2 : 4, right)
    expect(rightSideCount(root(doc))).toBe(right ? 3 : 2)
    expect(doc.index.get(child)!.parent).toBe(root(doc))
    doc.move(child, 'b')
    expect(rightSideCount(root(doc))).toBe(2)
    expect(doc.index.get(child)!.parent?.id).toBe('b')
    doc.undo()
    doc.undo()
    expect(doc.sheets).toEqual(before)
  })

  it('preserves other extension content when changing side counts', () => {
    const doc = document(2, sheets => {
      sheets[0].rootTopic.extensions!.unshift({ provider: 'custom', content: [{ opaque: true }] })
      const content = sheets[0].rootTopic.extensions![1].content as object[]
      content.unshift({ name: 'future', content: 'opaque', extra: 7 })
    })
    doc.setSide('a', 'left', 2)
    expect(root(doc).extensions![0]).toEqual({ provider: 'custom', content: [{ opaque: true }] })
    expect(root(doc).extensions![1].content[0]).toEqual({ name: 'future', content: 'opaque', extra: 7 })
    expect(rightSideCount(root(doc))).toBe(1)
  })

  it.each(['-1', '5', '1.5', '1e0', '', ' 1', '1x', '9007199254740992'])('rejects an invalid right-number: %j', value => {
    const doc = document(2)
    ;(root(doc).extensions![0].content[0] as any).content = value
    expect(rightSideCount(root(doc))).toBeUndefined()
  })
})
