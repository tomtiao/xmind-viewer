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
export function foldPosition(box: DOMRect, center: DOMRect | undefined) {
  const left =
    center && box.left + box.width / 2 < center.left + center.width / 2;
  return {
    x: left ? box.left - 10 : box.right + 10,
    y: box.top + box.height / 2,
  };
}
