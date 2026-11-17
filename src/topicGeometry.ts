import type { EditorDocument } from './editorDocument';

export type TopicBounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
type BoundsForTopic = (id: string) => TopicBounds | undefined;

/** Read only the rendered topic shape, never the surrounding branch or connectors. */
export function topicBounds(
  container: HTMLElement,
  id: string,
): DOMRect | undefined {
  const topic = container.querySelector<SVGGraphicsElement>(
    `[data-topic-id="${CSS.escape(id)}"]`,
  );
  if (!topic) return undefined;
  const shape = topic.querySelector<SVGGraphicsElement>(
    '[data-name="topic-shape-group"]',
  );
  const box = shape?.getBoundingClientRect();
  return box && box.width && box.height ? box : topic.getBoundingClientRect();
}
/** Match the direction of visible children, then the inherited structure for folded branches. */
export function resolveFoldPosition(
  doc: Pick<EditorDocument, 'index'>,
  id: string,
  box: TopicBounds,
  boundsForTopic: BoundsForTopic,
) {
  const entry = doc.index.get(id)!;
  const child = entry.topic.children?.attached?.map(topic => boundsForTopic(topic.id)).find(Boolean);
  let left: boolean | undefined;
  if (child) left = child.left + child.width / 2 < box.left + box.width / 2;
  if (left === undefined) {
    let current = entry;
    const root = entry.sheet.rootTopic;
    while (current) {
      if (current.topic.structureClass === 'org.xmind.ui.logic.left') { left = true; break; }
      if (current.topic.structureClass === 'org.xmind.ui.logic.right') { left = false; break; }
      if (current.type === 'detached') { left = false; break; }
      if (current.parent?.id === root.id) {
        const branchBox = boundsForTopic(current.topic.id);
        const center = boundsForTopic(root.id);
        if (branchBox && center) left = branchBox.left + branchBox.width / 2 < center.left + center.width / 2;
        break;
      }
      if (!current.parent) break;
      current = doc.index.get(current.parent.id)!;
    }
  }
  return { x: left ? box.left - 10 : box.left + box.width + 10, y: box.top + box.height / 2 };
}

export function foldPosition(container: HTMLElement, doc: EditorDocument, id: string, box: DOMRect) {
  return resolveFoldPosition(doc, id, box, topicId => topicBounds(container, topicId));
}
