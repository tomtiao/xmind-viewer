import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { EditorDocument } from '../src/editorDocument'
import type { SheetData } from '../src/model/sheet'
import { resolveFoldPosition, type TopicBounds } from '../src/topicGeometry'

const box = (left: number, top = 20, width = 80, height = 40): TopicBounds => ({ left, top, width, height })

function document(structureClass?: string) {
  return new EditorDocument([{
    id: 'sheet', title: 'Map', rootTopic: {
      id: 'root', title: 'Root', structureClass: 'org.xmind.ui.map.clockwise', children: {
        attached: [{ id: 'main', title: 'Main', children: { attached: [{ id: 'deep', title: 'Deep' }] } }],
        detached: [{ id: 'free', title: 'Free', structureClass, children: {
          attached: [{ id: 'free-child', title: 'Child', children: { attached: [{ id: 'grandchild', title: 'Grandchild' }] } }]
        } }]
      }
    }
  }] as SheetData[], new JSZip())
}

describe('fold control geometry without a browser', () => {
  it.each([
    { childLeft: -100, expected: { x: -10, y: 40 } },
    { childLeft: 160, expected: { x: 90, y: 40 } }
  ])('uses the visible child at x=$childLeft before fallback structure rules', ({ childLeft, expected }) => {
    const doc = document('org.xmind.ui.logic.left')
    const before = structuredClone(doc.sheets)
    expect(resolveFoldPosition(doc, 'free', box(0), id => id === 'free-child' ? box(childLeft) : undefined)).toEqual(expected)
    expect(doc.sheets).toEqual(before)
  })

  it.each([
    { structure: undefined, expected: { x: -110, y: 40 } },
    { structure: 'org.xmind.ui.logic.right', expected: { x: -110, y: 40 } },
    { structure: 'org.xmind.ui.logic.left', expected: { x: -210, y: 40 } }
  ])('resolves an initially folded floating tree with structure=$structure', ({ structure, expected }) => {
    const doc = document(structure)
    doc.toggleFold('free')
    expect(resolveFoldPosition(doc, 'free', box(-200), () => undefined)).toEqual(expected)
  })

  it.each([
    { structure: undefined, expectedX: -210 },
    { structure: 'org.xmind.ui.logic.left', expectedX: -310 }
  ])('inherits the floating ancestor direction for a folded descendant: $structure', ({ structure, expectedX }) => {
    const doc = document(structure)
    doc.toggleFold('free-child')
    expect(resolveFoldPosition(doc, 'free-child', box(-300), () => undefined)).toEqual({ x: expectedX, y: 40 })
  })

  it.each([
    { mainLeft: -200, nodeLeft: 100, expectedX: 90 },
    { mainLeft: 200, nodeLeft: -100, expectedX: -10 }
  ])('uses the main branch side when a descendant crosses the central axis: $mainLeft', ({ mainLeft, nodeLeft, expectedX }) => {
    const doc = document()
    const bounds = new Map([['root', box(0)], ['main', box(mainLeft)]])
    expect(resolveFoldPosition(doc, 'deep', box(nodeLeft), id => bounds.get(id))).toEqual({ x: expectedX, y: 40 })
  })

  it('skips an invisible first child and uses the next visible child', () => {
    const doc = document()
    doc.add('free')
    const second = doc.index.get('free')!.topic.children!.attached[1].id
    expect(resolveFoldPosition(doc, 'free', box(0), id => id === second ? box(-100) : undefined)).toEqual({ x: -10, y: 40 })
  })

  it('uses the topic own sheet when resolving the main branch side', () => {
    const doc = document()
    const other = { id: 'other-sheet', title: 'Other', rootTopic: { id: 'other-root', title: 'Other', children: { attached: [{ id: 'other-main', title: 'Other main' }] } } }
    const multi = new EditorDocument([...doc.sheets, other], new JSZip())
    const bounds = new Map([['root', box(-500)], ['other-root', box(500)], ['other-main', box(200)]])
    expect(resolveFoldPosition(multi, 'other-main', box(200), id => bounds.get(id))).toEqual({ x: 190, y: 40 })
  })
})
