import type { RefObject } from "react";
import type { EditorDocument } from "./editorDocument";

type Props = {
  busy: boolean;
  disabled: boolean;
  editor?: EditorDocument;
  sheet: number;
  fileRef: RefObject<HTMLInputElement | null>;
  imageRef: RefObject<HTMLInputElement | null>;
  marker: string;
  setMarker: (value: string) => void;
  options: { id: string; label: string }[];
  present: { markerId: string }[];
  imageWidth: number;
  setImageWidth: (value: number) => void;
  status: string;
  action: (name: string) => void;
  openFile: (file?: File) => Promise<void>;
  insertImage: (file?: File) => Promise<void>;
  changeSheet: (index: number) => Promise<void>;
};
export function Toolbar({
  busy,
  disabled,
  editor,
  sheet,
  fileRef,
  imageRef,
  marker,
  setMarker,
  options,
  present,
  imageWidth,
  setImageWidth,
  status,
  action,
  openFile,
  insertImage,
  changeSheet,
}: Props) {
  const button = (id: string, label: string, aria?: string) => (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-label={aria}
      onClick={() => action(id)}
    >
      {label}
    </button>
  );
  return (
    <header>
      <strong>XMind Editor</strong>
      <button
        type="button"
        id="open-file"
        disabled={busy}
        onClick={() => {
          if (
            !editor?.dirty ||
            window.confirm("当前文件有未保存的修改，确定打开其他文件吗？")
          )
            fileRef.current?.click();
        }}
      >
        打开 XMind 文件
      </button>
      <label>
        工作表{" "}
        <select
          id="sheet-select"
          aria-label="选择工作表"
          disabled={disabled}
          value={sheet}
          onChange={(e) => void changeSheet(Number(e.target.value))}
        >
          {(editor?.sheets || []).map((sheet, i) => (
            <option value={i} key={i}>
              {sheet.title}
            </option>
          ))}
        </select>
      </label>
      {button("save-file", "保存")}
      {button("add-child", "添加子主题")}
      {button("add-sibling", "添加同级主题")}
      {button("add-floating", "添加自由主题")}
      {button("delete-topic", "删除")}
      {button("fold-topic", "折叠 / 展开")}
      {button("side-left", "移至左侧")}
      {button("side-right", "移至右侧")}
      {button("tag-red", "红色标签")}
      {button("flag-red", "红旗")}
      <label>
        标记{" "}
        <select
          id="marker-select"
          aria-label="选择标记"
          value={marker}
          onChange={(e) => setMarker(e.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
              {present.some((item) => item.markerId === option.id) ? " ✓" : ""}
            </option>
          ))}
        </select>
      </label>
      {button("toggle-marker", "添加 / 移除标记")}
      {button("insert-image", "插入图片")}
      <input
        ref={imageRef}
        id="image-dialog"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void insertImage(file);
        }}
      />
      <label>
        图片宽度{" "}
        <input
          id="image-width"
          type="number"
          min="1"
          max="2000"
          value={imageWidth}
          onChange={(e) => setImageWidth(Number(e.target.value))}
        />
      </label>
      {button("resize-image", "调整图片")}
      {button("undo", "撤销")}
      {button("redo", "重做")}
      {button("zoom-out", "−", "缩小")}
      {button("zoom-in", "+", "放大")}
      <input
        ref={fileRef}
        id="input-dialog"
        type="file"
        accept=".xmind"
        aria-label="选择 XMind 文件"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void openFile(file);
        }}
      />
      <span id="status" role="status" aria-live="polite">
        {status}
      </span>
      <small className="editor-hint">
        双击编辑文字；Tab / Enter
        添加主题；拖至主题换层级、拖至边缘排序；拖动空白处平移。
      </small>
    </header>
  );
}
