import { useLayoutEffect, useRef } from "react";

export type EditBox = { id: string; title: string; box: DOMRect };
export function TopicEditor({
  edit,
  finish,
}: {
  edit: EditBox;
  finish: (commit: boolean, title: string, save?: boolean) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false),
    done = useRef(false);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const end = (commit: boolean, save = false) => {
    if (done.current) return;
    done.current = true;
    finish(commit, ref.current?.value || "", save);
  };
  return (
    <textarea
      ref={ref}
      className="topic-editor"
      defaultValue={edit.title}
      style={{
        left: edit.box.left,
        top: edit.box.top,
        width: Math.max(edit.box.width, 120),
        height: Math.max(edit.box.height, 35),
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onBlur={() => end(true)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.stopPropagation();
          if (!composing.current && !e.nativeEvent.isComposing) end(true, true);
        } else if (e.key === "Escape") end(false);
        else if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !composing.current &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          end(true);
        }
      }}
    />
  );
}
