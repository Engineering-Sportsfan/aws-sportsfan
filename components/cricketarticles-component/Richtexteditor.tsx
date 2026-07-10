"use client";

import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
}

type EditorInstance = {
  getData: () => string;
  setData: (data: string) => void;
  execute: (commandName: string, options?: { value?: string }) => void;
};

type CKEditorProps = {
  editor: unknown;
  data: string;
  config?: {
    placeholder?: string;
    heading?: {
      options: Array<{
        model: string;
        view?: string;
        title: string;
        class: string;
      }>;
    };
    toolbar?: string[];
    simpleUpload?: {
      uploadUrl: string;
    };
  };
  onReady?: (editor: EditorInstance) => void;
  onChange?: (event: unknown, editor: EditorInstance) => void;
};

const CKEditorComponent = CKEditor as unknown as ComponentType<CKEditorProps>;

export function RichTextEditor({ value, onChange, placeholder = "Write here...", minHeight = 140 }: RichTextEditorProps) {
  const editorRef = useRef<EditorInstance | null>(null);
  const lastSyncedValue = useRef(value ?? "");
  const [showSource, setShowSource] = useState(false);
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  const draftKey = useRef<string | null>(null);
  useEffect(() => {
    try {
      const m = placeholder.match(/paragraph\s*(\d+)/i);
      if (m) draftKey.current = `cricket-article-paragraph-${m[1]}`;
      else draftKey.current = `cricket-article-raw-${btoa(placeholder).slice(0, 8)}`;
    } catch {
      draftKey.current = `cricket-article-raw`;
    }
  }, [placeholder]);

  const stripHtml = useCallback((html: string) => html.replace(/<[^>]*>/g, "").trim(), []);

  useEffect(() => {
    const plain = stripHtml(localValue ?? "");
    setCharCount(plain.length);
    setWordCount(plain ? plain.split(/\s+/).filter(Boolean).length : 0);
  }, [localValue, stripHtml]);

  const saveDraft = useCallback(() => {
    if (!draftKey.current) return;
    try {
      localStorage.setItem(draftKey.current, localValue || "");
    } catch {}
  }, [localValue]);

  const restoreDraft = useCallback(() => {
    if (!draftKey.current) return;
    try {
      const v = localStorage.getItem(draftKey.current);
      if (v != null) {
        setLocalValue(v);
        onChange(v);
        if (editorRef.current) editorRef.current.setData(v);
      }
    } catch {}
  }, [onChange]);

  const applyHeading = useCallback((level: "heading1" | "heading2" | "heading3") => {
    editorRef.current?.execute("heading", { value: level });
  }, []);

  useEffect(() => {
    const id = setTimeout(() => saveDraft(), 1000);
    return () => clearTimeout(id);
  }, [localValue, saveDraft]);

  useEffect(() => {
    const editor = editorRef.current;
    const nextValue = value ?? "";

    setLocalValue(nextValue);

    if (!editor) {
      lastSyncedValue.current = nextValue;
      return;
    }

    if (nextValue !== lastSyncedValue.current && editor.getData() !== nextValue) {
      editor.setData(nextValue);
    }

    lastSyncedValue.current = nextValue;
  }, [value]);

  return (
    <div className="rich-editor-wrapper">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", padding: "6px 8px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => applyHeading("heading1")} className="toolbar-btn">
            H1
          </button>
          <button type="button" onClick={() => applyHeading("heading2")} className="toolbar-btn">
            H2
          </button>
          <button type="button" onClick={() => applyHeading("heading3")} className="toolbar-btn">
            H3
          </button>
          <button type="button" onClick={() => setShowSource((s) => !s)} className="toolbar-btn">
            {showSource ? "WYSIWYG" : "HTML"}
          </button>
          <button type="button" onClick={restoreDraft} className="toolbar-btn">
            Restore Draft
          </button>
          <button type="button" onClick={saveDraft} className="toolbar-btn">
            Save Draft
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{wordCount} words • {charCount} chars</div>
      </div>

      {!showSource ? (
        <CKEditorComponent
          editor={ClassicEditor}
          data={localValue ?? ""}
          config={{
            placeholder,
            toolbar: [
              "|",
              "bold",
              "italic",
              "underline",
              "link",
              "bulletedList",
              "numberedList",
              "blockQuote",
              "insertTable",
              "imageUpload",
              "mediaEmbed",
              "|",
              "undo",
              "redo",
            ],
            simpleUpload: {
              uploadUrl: "/api/upload",
            },
          }}
          onReady={(editor: EditorInstance) => {
            editorRef.current = editor;
            editor.setData(localValue ?? "");
            lastSyncedValue.current = localValue ?? "";
          }}
          onChange={(_: unknown, editor: EditorInstance) => {
            const nextValue = editor.getData();
            lastSyncedValue.current = nextValue;
            setLocalValue(nextValue);
            onChange(nextValue);
          }}
        />
      ) : (
        <textarea
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          style={{ width: "100%", minHeight, padding: 12, background: "#0d1117", color: "#f9fafb", border: "none", boxSizing: "border-box" }}
        />
      )}

      <style>{`
        .rich-editor-wrapper {
          border: 1px solid #374151;
          border-radius: 8px;
          background: #0d1117;
          overflow: hidden;
        }

        .toolbar-btn {
          padding: 6px 10px;
          background: transparent;
          border: 1px solid transparent;
          color: #d1d5db;
          border-radius: 6px;
          cursor: pointer;
        }
        .toolbar-btn:hover { background: #111827; border-color:#374151 }

        .rich-editor-wrapper .ck.ck-editor {
          display: flex;
          flex-direction: column;
        }

        .rich-editor-wrapper .ck.ck-editor__top .ck-sticky-panel__content,
        .rich-editor-wrapper .ck.ck-toolbar {
          background: #161b22;
          border-color: #1f2937;
        }

        .rich-editor-wrapper .ck.ck-toolbar {
          border-bottom: 1px solid #1f2937;
        }

        .rich-editor-wrapper .ck.ck-toolbar .ck-toolbar__items {
          flex-wrap: wrap;
        }

        .rich-editor-wrapper .ck.ck-button,
        .rich-editor-wrapper .ck.ck-button.ck-on,
        .rich-editor-wrapper .ck.ck-dropdown__button {
          color: #d1d5db;
        }

        .rich-editor-wrapper .ck.ck-button:hover,
        .rich-editor-wrapper .ck.ck-button.ck-on,
        .rich-editor-wrapper .ck.ck-dropdown__button:hover {
          background: #1f2937;
        }

        .rich-editor-wrapper .ck.ck-editor__main > .ck-editor__editable {
          min-height: ${minHeight}px;
          padding: 12px 14px;
          background: #0d1117;
          color: #f9fafb;
          border: none !important;
          box-shadow: none !important;
          line-height: 1.65;
        }

        .rich-editor-wrapper .ck.ck-editor__main > .ck-editor__editable.ck-focused {
          box-shadow: inset 0 0 0 1px #3b82f6;
        }

        .rich-editor-wrapper .ck.ck-editor__main > .ck-editor__editable p {
          margin: 0 0 0.75rem;
        }

        .rich-editor-wrapper .ck-content h1,
        .rich-editor-wrapper .ck-content h2,
        .rich-editor-wrapper .ck-content h3,
        .rich-editor-wrapper .ck-content h4 {
          color: #f9fafb;
          font-weight: 700;
        }

        .rich-editor-wrapper .ck-content h1 {
          font-size: 2rem;
          line-height: 1.2;
          margin: 0 0 0.85rem;
        }

        .rich-editor-wrapper .ck-content h2 {
          font-size: 1.5rem;
          line-height: 1.25;
          margin: 0 0 0.8rem;
        }

        .rich-editor-wrapper .ck-content h3 {
          font-size: 1.25rem;
          line-height: 1.3;
          margin: 0 0 0.75rem;
        }

        .rich-editor-wrapper .ck-content h4 {
          font-size: 1.1rem;
          line-height: 1.35;
          margin: 0 0 0.7rem;
        }

        .rich-editor-wrapper .ck-content blockquote {
          border-left: 3px solid #3b82f6;
          margin: 0.75rem 0;
          padding: 0.5rem 1rem;
          color: #cbd5e1;
          background: #161b22;
          border-radius: 0 4px 4px 0;
        }

        .rich-editor-wrapper .ck-content a {
          color: #60a5fa;
        }

        .rich-editor-wrapper .ck-content u {
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .rich-editor-wrapper .ck-placeholder:before {
          color: #6b7280;
        }
      `}</style>
    </div>
  );
}
