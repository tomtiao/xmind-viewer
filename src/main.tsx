import {
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import contentData from "../example/content.json";
import { loadFromXMind } from "./index";
import type { SheetData } from "./model/sheet";
import { EditorDocument, rightSideCount } from "./editorDocument";
import { markerOptions } from "./markers";
import { Toolbar } from "./Toolbar";
import { TopicEditor, type EditBox } from "./TopicEditor";
import { prepareImages, renderCanvas } from "./canvasAdapter";
import { topicBounds, foldPosition } from "./topicGeometry";
import "./styles.css";

type FoldControl = {
  id: string;
  x: number;
  y: number;
  folded: boolean;
  count: number;
};
function editable(sheet: SheetData) {
  const root = sheet.rootTopic;
  return (
    root.structureClass === "org.xmind.ui.map.clockwise" ||
    (root.structureClass === "org.xmind.ui.map.unbalanced" &&
      rightSideCount(root) !== undefined)
  );
}
function App() {
  const containerRef = useRef<HTMLElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    imageRef = useRef<HTMLInputElement>(null);
  const model = useRef<{
    editor?: EditorDocument;
    selected?: string;
    filename: string;
    sheet: number;
    zoom: number;
    version: number;
    opening: boolean;
  }>({
    filename: "mind-map.xmind",
    sheet: 0,
    zoom: 1,
    version: 0,
    opening: false,
  });
  const [revision, setRevision] = useState(0),
    [status, setStatus] = useState("打开文件后开始编辑"),
    [busy, setBusy] = useState(false);
  const [marker, setMarker] = useState(markerOptions[0].id),
    [imageWidth, setImageWidth] = useState(200),
    [edit, setEdit] = useState<EditBox>();
  const [hover, setHover] = useState<string>(),
    [controls, setControls] = useState<FoldControl[]>([]),
    [focused, setFocused] = useState<string>();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const m = model.current;
  const refresh = () => setRevision((n) => n + 1);
  const select = (id?: string) => {
    m.selected = id;
    syncSelection();
    refresh();
  };
  const syncSelection = () =>
    containerRef.current
      ?.querySelectorAll("[data-topic-id]")
      .forEach((el) =>
        el.classList.toggle(
          "selected",
          el.getAttribute("data-topic-id") === m.selected,
        ),
      );
  const positions = () => {
    const container = containerRef.current,
      doc = m.editor;
    if (!container || !doc || !editable(doc.sheets[m.sheet])) {
      setControls([]);
      return;
    }
    const root = doc.sheets[m.sheet].rootTopic;
    const list: FoldControl[] = [];
    const viewport = container.getBoundingClientRect();
    for (const [id, entry] of doc.index) {
      if (id === root.id || !entry.topic.children?.attached?.length) continue;
      const rect = topicBounds(container, id);
      if (!rect) continue;
      const folded = entry.topic.branch === "folded";
      if (!folded && id !== hover && id !== focused && id !== m.selected) continue;
      const position = foldPosition(container, doc, id, rect);
      if (
        position.x - 12 < viewport.left ||
        position.x + 12 > viewport.right ||
        position.y - 12 < viewport.top ||
        position.y + 12 > viewport.bottom
      )
        continue;
      list.push({
        id,
        ...position,
        folded,
        count: entry.topic.children.attached.length,
      });
    }
    setControls(list);
  };
  async function render(
    sheets: SheetData[],
    preserve = false,
    version = ++m.version,
  ) {
    const rendered = await renderCanvas(
      containerRef.current!,
      sheets,
      m.sheet,
      m.zoom,
      preserve,
      () => version === m.version && !!containerRef.current,
    );
    if (rendered) {
      syncSelection();
      refresh();
    }
    return rendered;
  }
  async function renderDocument(doc: EditorDocument, warnings: string[] = []) {
    const version = ++m.version,
      projection = structuredClone(doc.sheets);
    await Promise.all(
      projection.map((sheet) =>
        prepareImages(sheet.rootTopic, doc.zip, warnings),
      ),
    );
    if (version !== m.version) return false;
    return render(projection, doc === m.editor, version);
  }
  async function runEdit(action: () => void) {
    const doc = m.editor;
    if (!doc || m.opening) return;
    if (!editable(doc.sheets[m.sheet])) {
      setStatus("此结构尚未验证，暂不支持编辑。");
      return;
    }
    try {
      action();
      if (m.selected && !doc.index.has(m.selected))
        m.selected = doc.sheets[m.sheet].rootTopic.id;
      if (await renderDocument(doc)) {
        syncSelection();
        refresh();
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "操作失败。");
    }
  }
  async function openFile(file?: File) {
    if (!file) return;
    m.opening = true;
    setBusy(true);
    ++m.version;
    const previous = m.sheet;
    setStatus("正在打开…");
    try {
      const zip = await JSZip.loadAsync(await file.arrayBuffer()),
        data = await loadFromXMind(zip),
        next = new EditorDocument(data.sheets, zip),
        warnings: string[] = [];
      m.sheet = Math.max(0, data.sheets.findIndex(editable));
      if (!(await renderDocument(next, warnings)))
        throw new Error("打开操作被中断，请重试。");
      m.editor = next;
      m.selected = data.sheets[m.sheet].rootTopic.id;
      m.filename = file.name;
      syncSelection();
      refresh();
      setStatus(
        warnings.length ? `${file.name}：${warnings.join("；")}` : file.name,
      );
    } catch (error) {
      m.sheet = previous;
      if (m.editor) await renderDocument(m.editor);
      setStatus(error instanceof Error ? error.message : "打开文件失败。");
    } finally {
      m.opening = false;
      setBusy(false);
    }
  }
  async function changeSheet(index: number) {
    if (!m.editor || m.opening) return;
    const previous = m.sheet;
    m.sheet = index;
    m.opening = true;
    setBusy(true);
    try {
      if (!(await renderDocument(m.editor)))
        throw new Error("切换工作表被中断。");
      select(m.editor.sheets[index].rootTopic.id);
      setStatus(m.filename);
    } catch (error) {
      m.sheet = previous;
      await renderDocument(m.editor);
      setStatus(error instanceof Error ? error.message : "切换工作表失败。");
    } finally {
      m.opening = false;
      setBusy(false);
    }
  }
  const save = () => {
    if (!m.editor) return;
    void m.editor
      .save()
      .then((blob) => {
        const url = URL.createObjectURL(blob),
          link = document.createElement("a");
        link.href = url;
        link.download = m.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        refresh();
      })
      .catch((error) =>
        setStatus(error instanceof Error ? error.message : "保存失败。"),
      );
  };
  const zoom = (value: number) => {
    const container = containerRef.current;
    const rootId = m.editor?.sheets[m.sheet].rootTopic.id;
    const before = container && rootId ? topicBounds(container, rootId) : undefined;
    m.zoom = Math.max(0.25, Math.min(3, value));
    const surface = container?.querySelector<HTMLElement>(".sheet-container");
    if (surface) surface.style.zoom = String(m.zoom);
    const after = container && rootId ? topicBounds(container, rootId) : undefined;
    if (container && before && after) container.scrollBy(after.left - before.left, after.top - before.top);
    refresh();
  };
  const rightCount = () => {
    const root = m.editor!.sheets[m.sheet].rootTopic,
      container = containerRef.current!,
      center = container
        .querySelector<SVGGraphicsElement>(
          `[data-topic-id="${CSS.escape(root.id)}"]`,
        )
        ?.getBoundingClientRect();
    if (!center) throw new Error("无法确定当前左右侧。");
    return (root.children?.attached || []).filter((topic) => {
      const box = container
        .querySelector<SVGGraphicsElement>(
          `[data-topic-id="${CSS.escape(topic.id)}"]`,
        )
        ?.getBoundingClientRect();
      return box && box.x + box.width / 2 > center.x + center.width / 2;
    }).length;
  };
  const action = (name: string) => {
    const doc = m.editor,
      id = m.selected;
    if (!doc) return;
    if (name === "save-file") return save();
    if (name === "zoom-in" || name === "zoom-out")
      return zoom(m.zoom * (name === "zoom-in" ? 1.2 : 1 / 1.2));
    if (name === "insert-image") {
      if (id) imageRef.current?.click();
      return;
    }
    if (name === "undo" || name === "redo") {
      void runEdit(() => (name === "undo" ? doc.undo() : doc.redo()));
      return;
    }
    if (name === "add-floating") {
      void runEdit(() => {
        m.selected = doc.add(doc.sheets[m.sheet].rootTopic.id, "detached");
      });
      return;
    }
    if (!id) return;
    if (name === "add-child")
      void runEdit(() => {
        m.selected = doc.add(id);
      });
    else if (name === "add-sibling") {
      const entry = doc.index.get(id),
        parent = entry?.parent;
      if (!parent || (entry.type !== "attached" && entry.type !== "detached"))
        return;
      const type = entry.type,
        index = parent.children![type].indexOf(entry.topic) + 1,
        pos = entry.topic.position,
        position =
          type === "detached" && pos
            ? { x: pos.x + 20, y: pos.y + 60 }
            : undefined,
        count = rightSideCount(parent);
      void runEdit(() => {
        m.selected = doc.add(
          parent.id,
          type,
          index,
          position,
          count !== undefined && index <= count,
        );
      });
    } else if (name === "delete-topic")
      void runEdit(() => {
        const parent = doc.index.get(id)?.parent?.id;
        doc.remove(id);
        m.selected = parent;
      });
    else if (name === "fold-topic") void runEdit(() => doc.toggleFold(id));
    else if (name === "side-left" || name === "side-right")
      void runEdit(() =>
        doc.setSide(id, name === "side-left" ? "left" : "right", rightCount()),
      );
    else if (
      name === "tag-red" ||
      name === "flag-red" ||
      name === "toggle-marker"
    )
      void runEdit(() =>
        doc.toggleMarker(id, name === "toggle-marker" ? marker : name),
      );
    else if (name === "resize-image") {
      const image = containerRef.current?.querySelector<SVGImageElement>(
          `[data-topic-id="${CSS.escape(id)}"] image`,
        ),
        ratio = image
          ? Number(image.getAttribute("height")) /
            Number(image.getAttribute("width"))
          : undefined;
      void runEdit(() => doc.resizeImage(id, imageWidth, ratio));
    }
  };
  async function insertImage(file?: File) {
    const id = m.selected,
      doc = m.editor;
    if (!file || !id || !doc) return;
    if (!editable(doc.sheets[m.sheet])) {
      setStatus("此结构尚未验证，暂不支持编辑。");
      return;
    }
    try {
      const bytes = await file.arrayBuffer(),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join(""),
        ext = (
          {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/gif": "gif",
            "image/webp": "webp",
          } as Record<string, string>
        )[file.type];
      if (!ext) throw new Error("不支持此图片格式。");
      const url = URL.createObjectURL(file),
        image = new Image();
      try {
        image.src = url;
        await image.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      const width = Math.min(200, image.naturalWidth),
        height = Math.round((width * image.naturalHeight) / image.naturalWidth),
        path = `resources/${hash}.${ext}`;
      if (doc !== m.editor || m.opening) return;
      doc.zip.file(path, bytes);
      await runEdit(() => doc.setImage(id, path, width, height));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "图片读取失败。");
    }
  }
  const gesture = useRef<{
    drag?: { id: string; x: number; y: number };
    pan?: { x: number; y: number; left: number; top: number };
  }>({});
  useEffect(() => {
    void render(contentData as unknown as SheetData[]).catch((error) =>
      setStatus(error instanceof Error ? error.message : "示例加载失败。"),
    );
    return () => {
      ++m.version;
      clearTimeout(hoverTimer.current);
    };
  }, []);
  useEffect(() => {
    const container = containerRef.current!;
    const before = (event: BeforeUnloadEvent) => {
      if (m.editor?.dirty) event.preventDefault();
    };
    const key = (event: KeyboardEvent) => {
      if (!m.editor || event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        action("save-file");
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.ctrlKey || event.metaKey) {
        const k = event.key.toLowerCase();
        if (k === "z" || k === "y") {
          event.preventDefault();
          action(k === "y" || event.shiftKey ? "redo" : "undo");
        }
      } else if (
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLButtonElement) &&
        m.selected &&
        ["Tab", "Enter", "Delete", "Backspace"].includes(event.key)
      ) {
        event.preventDefault();
        action(
          event.key === "Tab"
            ? "add-child"
            : event.key === "Enter"
              ? "add-sibling"
              : "delete-topic",
        );
      }
    };
    const move = (event: PointerEvent) => {
      const pan = gesture.current.pan;
      if (pan)
        container.scrollTo(
          pan.left - event.clientX + pan.x,
          pan.top - event.clientY + pan.y,
        );
    };
    const up = (event: PointerEvent) => {
      gesture.current.pan = undefined;
      const start = gesture.current.drag;
      gesture.current.drag = undefined;
      const doc = m.editor;
      if (
        !start ||
        !doc ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8
      )
        return;
      const entry = doc.index.get(start.id);
      if (!entry) return;
      if (entry.type === "detached") {
        const matrix = container
          .querySelector<SVGGraphicsElement>('[data-name="sheet"]')
          ?.getScreenCTM();
        if (!matrix) return;
        const inverse = matrix.inverse(),
          from = new DOMPoint(start.x, start.y).matrixTransform(inverse),
          to = new DOMPoint(event.clientX, event.clientY).matrixTransform(
            inverse,
          ),
          position = entry.topic.position || { x: 0, y: 0 };
        void runEdit(() =>
          doc.position(
            start.id,
            Math.round(position.x + to.x - from.x),
            Math.round(position.y + to.y - from.y),
          ),
        );
      } else {
        const target = document
            .elementsFromPoint(event.clientX, event.clientY)
            .map((el) => el.closest("[data-topic-id]"))
            .find(Boolean),
          id = target?.getAttribute("data-topic-id");
        if (!id || id === start.id) return;
        const dest = doc.index.get(id),
          rect = target?.getBoundingClientRect(),
          root = doc.sheets[m.sheet].rootTopic;
        if (
          id === root.id &&
          entry.parent === root &&
          entry.type === "attached" &&
          rect
        ) {
          const side =
            event.clientX < rect.left + rect.width / 2 ? "left" : "right";
          void runEdit(() => doc.setSide(start.id, side, rightCount()));
          return;
        }
        const edge =
          rect &&
          (event.clientY < rect.top + rect.height * 0.3 ||
            event.clientY > rect.bottom - rect.height * 0.3);
        if (edge && dest?.parent && dest.type === "attached") {
          const index =
              dest.parent.children!.attached.indexOf(dest.topic) +
              (event.clientY > rect!.top + rect!.height / 2 ? 1 : 0),
            rootBox =
              dest.parent === root
                ? container
                    .querySelector<SVGGraphicsElement>(
                      `[data-topic-id="${CSS.escape(root.id)}"]`,
                    )
                    ?.getBoundingClientRect()
                : undefined,
            targetRight =
              rect && rootBox
                ? rect.x + rect.width / 2 > rootBox.x + rootBox.width / 2
                : undefined;
          void runEdit(() =>
            doc.move(start.id, dest.parent!.id, index, targetRight),
          );
        } else void runEdit(() => doc.move(start.id, id));
      }
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        zoom(m.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
      }
    };
    window.addEventListener("beforeunload", before);
    window.addEventListener("keydown", key);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    container.addEventListener("wheel", wheel, { passive: false });
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      container.removeEventListener("wheel", wheel);
    };
  });
  useLayoutEffect(() => {
    containerRef.current
      ?.querySelectorAll("[data-topic-id]")
      .forEach((el) =>
        el.classList.toggle(
          "hovered",
          el.getAttribute("data-topic-id") === hover,
        ),
      );
    positions();
  }, [revision, hover, focused, busy]);
  useEffect(() => {
    const container = containerRef.current!,
      update = () => positions(),
      observer = new ResizeObserver(update);
    observer.observe(container);
    container.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [revision, hover, focused]);
  const present =
    (m.selected && m.editor?.index.get(m.selected)?.topic.markers) || [];
  const options = [
    ...markerOptions,
    ...present
      .filter(
        (item) => !markerOptions.some((option) => option.id === item.markerId),
      )
      .map((item) => ({ id: item.markerId, label: `未知：${item.markerId}` })),
  ];
  const disabled = busy || !m.editor;
  return (
    <>
      <Toolbar
        busy={busy}
        disabled={disabled}
        editor={m.editor}
        sheet={m.sheet}
        fileRef={fileRef}
        imageRef={imageRef}
        marker={marker}
        setMarker={setMarker}
        options={options}
        present={present}
        imageWidth={imageWidth}
        setImageWidth={setImageWidth}
        status={status}
        action={action}
        openFile={openFile}
        insertImage={insertImage}
        changeSheet={changeSheet}
      />
      <main
        id="page-content"
        ref={containerRef}
        aria-label="思维导图"
        onClick={(e) => {
          const target = (e.target as Element).closest("[data-topic-id]");
          if (target) select(target.getAttribute("data-topic-id") || undefined);
        }}
        onPointerOver={(e) => {
          const id = (e.target as Element)
            .closest("[data-topic-id]")
            ?.getAttribute("data-topic-id");
          if (id) {
            clearTimeout(hoverTimer.current);
            setHover(id);
          }
        }}
        onPointerOut={(e) => {
          const next = e.relatedTarget as Element | null;
          if (!next?.closest?.("[data-topic-id], .fold-control")) {
            clearTimeout(hoverTimer.current);
            hoverTimer.current = setTimeout(() => setHover(undefined), 200);
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || !m.editor) return;
          const id = (e.target as Element)
            .closest("[data-topic-id]")
            ?.getAttribute("data-topic-id");
          if (id) gesture.current.drag = { id, x: e.clientX, y: e.clientY };
          else
            gesture.current.pan = {
              x: e.clientX,
              y: e.clientY,
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            };
        }}
        onDoubleClick={(e) => {
          const target = (e.target as Element).closest(
              "[data-topic-id]",
            ) as SVGGraphicsElement | null,
            id = target?.getAttribute("data-topic-id"),
            topic = id && m.editor?.index.get(id)?.topic;
          if (target && id && topic) {
            select(id);
            setEdit({
              id,
              title: topic.title,
              box: target.getBoundingClientRect(),
            });
          }
        }}
      />
      {controls.map((control) => (
        <button
          key={control.id}
          type="button"
          className="fold-control"
          data-fold-topic-id={control.id}
          aria-label={`${control.folded ? "展开" : "折叠"}主题`}
          title={control.folded ? `展开 ${control.count} 个子主题` : "折叠主题"}
          style={{ left: control.x, top: control.y }}
          onPointerEnter={() => {
            clearTimeout(hoverTimer.current);
            setHover(control.id);
          }}
          onPointerLeave={() => setHover(undefined)}
          onFocus={() => setFocused(control.id)}
          onBlur={() => setFocused(undefined)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const doc = m.editor;
            if (doc) void runEdit(() => doc.toggleFold(control.id));
          }}
        >
          {control.folded ? "+" : "−"}
        </button>
      ))}
      {edit && (
        <TopicEditor
          key={edit.id}
          edit={edit}
          finish={(commit, title, shouldSave) => {
            setEdit(undefined);
            if (commit && m.editor) {
              const doc = m.editor;
              void runEdit(() => doc.rename(edit.id, title));
              if (shouldSave) save();
            }
          }}
        />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
