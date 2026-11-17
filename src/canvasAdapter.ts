import JSZip from "jszip";
import { SnowbrushRenderer } from "./index";
import type { SheetData } from "./model/sheet";
import type { TopicData } from "./model/topic";
import { resolveImageSize } from "./imageSize";

export async function prepareImages(
  topic: TopicData,
  zip: JSZip,
  warnings: string[],
): Promise<void> {
  const path = topic.image?.src?.replace(/^xap:/, "");
  const resource = path && zip.file(path);
  if (topic.image && resource)
    try {
      const blob = await resource.async("blob");
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const image = new Image();
      image.src = src;
      await image.decode();
      const { width, height } = resolveImageSize(topic.image, image.naturalWidth, image.naturalHeight);
      topic.renderImage = { src, width, height };
    } catch {
      warnings.push(`主题“${topic.title}”的图片无法读取`);
    }
  else if (topic.image) warnings.push(`主题“${topic.title}”的图片资源缺失`);
  if (topic.image && !topic.renderImage)
    topic.renderImage = {
      src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="90"%3E%3Crect width="160" height="90" fill="%23eee"/%3E%3Ctext x="80" y="49" text-anchor="middle" font-size="14" fill="%23666"%3EImage unavailable%3C/text%3E%3C/svg%3E',
      width: topic.image.width || 160,
      height: topic.image.height || 90,
    };
  await Promise.all(
    Object.values(topic.children || {})
      .flat()
      .map((child) => prepareImages(child, zip, warnings)),
  );
}

export async function renderCanvas(
  container: HTMLElement,
  sheets: SheetData[],
  sheet: number,
  zoom: number,
  preserve: boolean,
  current: () => boolean,
) {
  const oldLeft = container.scrollLeft,
    oldTop = container.scrollTop;
  const selector = `[data-topic-id="${CSS.escape(sheets[sheet].rootTopic.id)}"]`;
  const oldRoot = container
    .querySelector<SVGGraphicsElement>(selector)
    ?.getBoundingClientRect();
  await Promise.all(
    [400, 500, 600, 700, 800].map((weight) =>
      document.fonts.load(`${weight} 14px NeverMind`),
    ),
  );
  await document.fonts.ready;
  if (!current()) return false;
  const renderer = new SnowbrushRenderer(sheets);
  const svg = renderer.render({ sheetIndex: sheet }),
    bounds = renderer.bounds;
  const width = Math.max(container.clientWidth, bounds.width),
    height = Math.max(container.clientHeight, bounds.height);
  const surface = document.createElement("div");
  surface.className = "sheet-container";
  surface.style.zoom = String(zoom);
  surface.style.width = `${width * 2}px`;
  surface.style.height = `${height * 2}px`;
  surface.style.backgroundColor = svg.node.style.backgroundColor;
  svg.addTo(surface);
  renderer.transform(width + bounds.x, height + bounds.y);
  container.replaceChildren(surface);
  if (preserve && oldRoot) {
    container.scrollTo(oldLeft, oldTop);
    const next = container
      .querySelector<SVGGraphicsElement>(selector)
      ?.getBoundingClientRect();
    if (next)
      container.scrollBy(next.left - oldRoot.left, next.top - oldRoot.top);
  } else
    container.scrollTo(
      width - container.clientWidth / 2,
      height - container.clientHeight / 2,
    );
  return true;
}
