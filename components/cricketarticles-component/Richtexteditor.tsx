"use client";

import { useEffect, useRef, useState, useCallback, type ComponentType } from "react";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Code,
  Eye,
} from "lucide-react";

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
  editing?: {
    view?: {
      focus: () => void;
    };
  };
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

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write paragraph content here...",
  minHeight = 150,
}: RichTextEditorProps) {
  const editorRef = useRef<EditorInstance | null>(null);
  const lastSyncedValue = useRef(value ?? "");
  const [showSource, setShowSource] = useState(false);
  const [localValue, setLocalValue] = useState<string>(value ?? "");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

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

  const stripHtml = useCallback((html: string) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  }, []);

  useEffect(() => {
    const plain = stripHtml(localValue ?? "");
    setCharCount(plain.length);
    setWordCount(plain ? plain.split(/\s+/).filter(Boolean).length : 0);
  }, [localValue, stripHtml]);

  const saveDraft = useCallback(() => {
    if (!draftKey.current) return;
    try {
      localStorage.setItem(draftKey.current, localValue || "");
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch { }
  }, [localValue]);

  const restoreDraft = useCallback(() => {
    if (!draftKey.current) return;
    try {
      const v = localStorage.getItem(draftKey.current);
      if (v != null) {
        setLocalValue(v);
        onChange(v);
        if (editorRef.current) {
          editorRef.current.setData(v);
        }
        setSaveStatus("Restored");
        setTimeout(() => setSaveStatus(null), 2000);
      }
    } catch { }
  }, [onChange]);

  const executeCommand = useCallback((commandName: string, options?: { value?: string }) => {
    if (!editorRef.current) return;
    try {
      editorRef.current.execute(commandName, options);
    } catch (e) {
      console.warn(`Command ${commandName} failed:`, e);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => saveDraft(), 3000);
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
      {/* Top Quick-Access Formatting Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161b22] border-b border-[#21262d] flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {/* Quick Bold & Italic */}
          <button
            type="button"
            onClick={() => executeCommand("bold")}
            className="format-btn"
            title="Bold (Ctrl+B)"
          >
            <Bold size={14} className="stroke-[2.5]" />
            <span className="text-[11px] font-bold">Bold</span>
          </button>

          <button
            type="button"
            onClick={() => executeCommand("italic")}
            className="format-btn"
            title="Italic (Ctrl+I)"
          >
            <Italic size={14} className="italic stroke-[2.5]" />
            <span className="text-[11px] italic font-semibold">Italic</span>
          </button>

          <div className="h-4 w-px bg-gray-700 mx-1" />

          {/* Quick Headings */}
          <button
            type="button"
            onClick={() => executeCommand("heading", { value: "heading1" })}
            className="format-btn"
            title="Heading 1"
          >
            <Heading1 size={14} />
            <span className="text-[11px]">H1</span>
          </button>

          <button
            type="button"
            onClick={() => executeCommand("heading", { value: "heading2" })}
            className="format-btn"
            title="Heading 2"
          >
            <Heading2 size={14} />
            <span className="text-[11px]">H2</span>
          </button>

          <button
            type="button"
            onClick={() => executeCommand("heading", { value: "heading3" })}
            className="format-btn"
            title="Heading 3"
          >
            <Heading3 size={14} />
            <span className="text-[11px]">H3</span>
          </button>

          <div className="h-4 w-px bg-gray-700 mx-1" />

          {/* Lists & Quotes */}
          <button
            type="button"
            onClick={() => executeCommand("bulletedList")}
            className="format-btn"
            title="Bulleted List"
          >
            <List size={14} />
          </button>

          <button
            type="button"
            onClick={() => executeCommand("numberedList")}
            className="format-btn"
            title="Numbered List"
          >
            <ListOrdered size={14} />
          </button>

          <button
            type="button"
            onClick={() => executeCommand("blockQuote")}
            className="format-btn"
            title="Blockquote"
          >
            <Quote size={14} />
          </button>

          <div className="h-4 w-px bg-gray-700 mx-1" />

          {/* Undo / Redo */}
          <button
            type="button"
            onClick={() => executeCommand("undo")}
            className="format-btn"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={13} />
          </button>

          <button
            type="button"
            onClick={() => executeCommand("redo")}
            className="format-btn"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={13} />
          </button>

          <div className="h-4 w-px bg-gray-700 mx-1" />

          {/* HTML / WYSIWYG Toggle */}
          <button
            type="button"
            onClick={() => setShowSource((s) => !s)}
            className={`format-btn ${showSource ? "!bg-blue-600/30 !border-blue-500/50 !text-blue-300" : ""}`}
            title={showSource ? "Switch to Visual Editor" : "View HTML Source Code"}
          >
            {showSource ? <Eye size={13} /> : <Code size={13} />}
            <span className="text-[11px] font-mono">{showSource ? "Visual" : "HTML"}</span>
          </button>
        </div>

        {/* Status & Draft utilities */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {saveStatus && (
            <span className="text-[11px] text-emerald-400 font-medium animate-pulse">
              ✓ {saveStatus}
            </span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={restoreDraft}
              className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition cursor-pointer"
              title="Restore saved local draft"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition cursor-pointer"
              title="Save local draft"
            >
              Save Draft
            </button>
          </div>
          <span className="text-[11px] font-mono text-gray-400">
            {wordCount} words • {charCount} chars
          </span>
        </div>
      </div>

      {/* Editor Body */}
      {!showSource ? (
        <div className="ckeditor-container">
          <CKEditorComponent
            editor={ClassicEditor}
            data={localValue ?? ""}
            config={{
              placeholder,
              heading: {
                options: [
                  { model: "paragraph", title: "Paragraph", class: "ck-heading_paragraph" },
                  {
                    model: "heading1",
                    view: "h1",
                    title: "Heading 1",
                    class: "ck-heading_heading1",
                  },
                  {
                    model: "heading2",
                    view: "h2",
                    title: "Heading 2",
                    class: "ck-heading_heading2",
                  },
                  {
                    model: "heading3",
                    view: "h3",
                    title: "Heading 3",
                    class: "ck-heading_heading3",
                  },
                ],
              },
              toolbar: [
                "heading",
                "|",
                "bold",
                "italic",
                "link",
                "bulletedList",
                "numberedList",
                "|",
                "blockQuote",
                "insertTable",
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
        </div>
      ) : (
        <textarea
          value={localValue}
          onChange={(e) => {
            const nextValue = e.target.value;
            setLocalValue(nextValue);
            onChange(nextValue);
          }}
          placeholder="Edit raw HTML for this paragraph..."
          style={{ minHeight }}
          className="w-full p-3.5 bg-[#0d1117] text-gray-100 font-mono text-xs focus:outline-none leading-relaxed resize-y block border-0"
        />
      )}

      <style>{`
        .rich-editor-wrapper {
          border: 1px solid #30363d;
          border-radius: 10px;
          background: #0d1117;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
          transition: border-color 0.2s ease;
        }

        .rich-editor-wrapper:focus-within {
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f6;
        }

        .format-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: #21262d;
          border: 1px solid #30363d;
          color: #c9d1d9;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.15s ease;
          user-select: none;
        }

        .format-btn:hover {
          background: #30363d;
          color: #ffffff;
          border-color: #484f58;
        }

        .format-btn:active {
          transform: translateY(1px);
        }

        /* CKEditor Custom Dark Theme Styling */
        .ckeditor-container .ck.ck-editor {
          display: flex;
          flex-direction: column;
        }

        .ckeditor-container .ck.ck-toolbar {
          background: #161b22 !important;
          border: none !important;
          border-bottom: 1px solid #21262d !important;
          padding: 4px 8px !important;
        }

        .ckeditor-container .ck.ck-toolbar .ck-toolbar__items {
          flex-wrap: wrap;
          gap: 2px;
        }

        .ckeditor-container .ck.ck-button,
        .ckeditor-container .ck.ck-dropdown__button {
          color: #c9d1d9 !important;
          background: transparent !important;
          border-radius: 6px !important;
          border: 1px solid transparent !important;
          cursor: pointer !important;
          padding: 4px 6px !important;
          font-size: 13px !important;
        }

        .ckeditor-container .ck.ck-button:hover,
        .ckeditor-container .ck.ck-dropdown__button:hover {
          background: #21262d !important;
          color: #ffffff !important;
          border-color: #30363d !important;
        }

        .ckeditor-container .ck.ck-button.ck-on,
        .ckeditor-container .ck.ck-button:active {
          background: #388bfd26 !important;
          color: #58a6ff !important;
          border-color: #388bfd66 !important;
        }

        .ckeditor-container .ck.ck-dropdown__panel {
          background: #161b22 !important;
          border: 1px solid #30363d !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5) !important;
        }

        .ckeditor-container .ck.ck-list {
          background: #161b22 !important;
        }

        .ckeditor-container .ck.ck-list__item .ck-button {
          color: #e6edf3 !important;
          border-radius: 4px !important;
        }

        .ckeditor-container .ck.ck-list__item .ck-button:hover {
          background: #21262d !important;
        }

        .ckeditor-container .ck.ck-list__item .ck-button.ck-on {
          background: #388bfd26 !important;
          color: #58a6ff !important;
        }

        .ckeditor-container .ck.ck-editor__main > .ck-editor__editable {
          min-height: ${minHeight}px;
          padding: 14px 16px !important;
          background: #0d1117 !important;
          color: #e6edf3 !important;
          border: none !important;
          box-shadow: none !important;
          font-size: 14px;
          line-height: 1.7;
        }

        .ckeditor-container .ck.ck-editor__main > .ck-editor__editable.ck-focused {
          border: none !important;
          box-shadow: none !important;
        }

        .ckeditor-container .ck-content p {
          margin: 0 0 0.75rem;
        }

        .ckeditor-container .ck-content strong,
        .ckeditor-container .ck-content b {
          font-weight: 700;
          color: #ffffff;
        }

        .ckeditor-container .ck-content em,
        .ckeditor-container .ck-content i {
          font-style: italic;
          color: #d1d5db;
        }

        .ckeditor-container .ck-content h1,
        .ckeditor-container .ck-content h2,
        .ckeditor-container .ck-content h3,
        .ckeditor-container .ck-content h4 {
          color: #ffffff;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }

        .ckeditor-container .ck-content h1 {
          font-size: 1.5rem;
          line-height: 1.3;
        }

        .ckeditor-container .ck-content h2 {
          font-size: 1.3rem;
          line-height: 1.35;
        }

        .ckeditor-container .ck-content h3 {
          font-size: 1.15rem;
          line-height: 1.4;
        }

        .ckeditor-container .ck-content blockquote {
          border-left: 3px solid #3b82f6;
          margin: 0.75rem 0;
          padding: 0.5rem 1rem;
          color: #cbd5e1;
          background: #161b22;
          border-radius: 0 6px 6px 0;
        }

        .ckeditor-container .ck-content a {
          color: #58a6ff;
          text-decoration: underline;
        }

        .ckeditor-container .ck-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .ckeditor-container .ck-content ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }

        .ckeditor-container .ck-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.75rem 0;
        }

        .ckeditor-container .ck-content table td,
        .ckeditor-container .ck-content table th {
          border: 1px solid #30363d;
          padding: 6px 10px;
        }

        .ckeditor-container .ck-placeholder:before {
          color: #6e7681 !important;
        }
      `}</style>
    </div>
  );
}
