'use dom';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

// Rich-text editor for text notes. Runs as an Expo DOM component: rendered
// inline on web and inside a WebView on native, so the same contentEditable
// editor (with real as-you-type formatting) works everywhere.

type Props = {
  /** Only read on mount — later changes are ignored so typing never resets the cursor. */
  initialHtml: string;
  placeholder?: string;
  onChangeHtml: (html: string) => void | Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

type Format = 'bold' | 'italic' | 'underline' | 'h1' | 'h2';

const TEXT = '#2C1A0E';
const MUTED = 'rgba(44,26,14,0.45)';
const FONT = 'Inter_400Regular, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const FONT_BOLD = 'Inter_700Bold, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'DIV', 'P', 'BR']);

// Rebuilds the HTML keeping only the formatting tags the editor supports, with
// no attributes, so stored or pasted markup can never carry scripts or styles.
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = document.createElement('div');
  const copy = (from: Node, to: Node) => {
    from.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(child.textContent ?? ''));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName;
        if (ALLOWED_TAGS.has(tag)) {
          const el = document.createElement(tag.toLowerCase());
          copy(child, el);
          to.appendChild(el);
        } else if (tag !== 'SCRIPT' && tag !== 'STYLE') {
          copy(child, to);
        }
      }
    });
  };
  copy(doc.body, out);
  return out.innerHTML;
}

function currentBlock(): string | null {
  const sel = document.getSelection();
  let node: Node | null = sel?.anchorNode ?? null;
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  while (node && (node as Element).getAttribute?.('contenteditable') !== 'true') {
    const tag = (node as Element).tagName;
    if (tag === 'H1' || tag === 'H2') return tag;
    node = node.parentNode;
  }
  return null;
}

export default function RichNoteEditor({ initialHtml, placeholder, onChangeHtml }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initialHtml);
  const [active, setActive] = useState<Record<Format, boolean>>({
    bold: false, italic: false, underline: false, h1: false, h2: false,
  });
  const [empty, setEmpty] = useState(!initialHtml);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = sanitize(initialRef.current);
    setEmpty(!el.textContent);
    try {
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('defaultParagraphSeparator', false, 'div');
    } catch {}

    const refresh = () => {
      if (!el.contains(document.getSelection()?.anchorNode ?? null)) return;
      const block = currentBlock();
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        h1: block === 'H1',
        h2: block === 'H2',
      });
    };
    document.addEventListener('selectionchange', refresh);
    return () => document.removeEventListener('selectionchange', refresh);
  }, []);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    const hasText = !!el.textContent?.trim();
    setEmpty(!el.textContent);
    onChangeHtml(hasText ? el.innerHTML : '');
  };

  const apply = (format: Format) => {
    editorRef.current?.focus();
    if (format === 'h1' || format === 'h2') {
      const tag = format.toUpperCase();
      document.execCommand('formatBlock', false, currentBlock() === tag ? 'div' : tag);
    } else {
      document.execCommand(format);
    }
    emit();
    document.dispatchEvent(new Event('selectionchange'));
  };

  return (
    <div style={styles.root}>
      <div style={styles.toolbar}>
        <ToolButton label="Bold" active={active.bold} onPress={() => apply('bold')}>
          <span style={{ fontFamily: FONT_BOLD, fontWeight: 700 }}>B</span>
        </ToolButton>
        <ToolButton label="Italic" active={active.italic} onPress={() => apply('italic')}>
          <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>I</span>
        </ToolButton>
        <ToolButton label="Underline" active={active.underline} onPress={() => apply('underline')}>
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolButton>
        <div style={styles.toolbarGap} />
        <ToolButton label="Heading" active={active.h1} onPress={() => apply('h1')}>
          <span style={{ fontFamily: FONT_BOLD, fontWeight: 700 }}>H1</span>
        </ToolButton>
        <ToolButton label="Subheading" active={active.h2} onPress={() => apply('h2')}>
          <span style={{ fontFamily: FONT_BOLD, fontWeight: 700, fontSize: 13 }}>H2</span>
        </ToolButton>
      </div>

      <div style={styles.editorWrap}>
        {empty && placeholder ? <div style={styles.placeholder}>{placeholder}</div> : null}
        <div
          ref={editorRef}
          className="rich-note-editor"
          contentEditable
          suppressContentEditableWarning
          style={styles.editor}
          onInput={emit}
          onPaste={(e) => {
            // Paste as plain text so foreign styles and markup don't come along.
            e.preventDefault();
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
          }}
        />
      </div>

      <style>{`
        html, body, #root { margin: 0; padding: 0; height: 100%; background: transparent; overflow: hidden; }
        .rich-note-editor:focus { outline: none; }
        .rich-note-editor b, .rich-note-editor strong { font-family: ${FONT_BOLD}; font-weight: 700; }
        .rich-note-editor h1 { font-family: ${FONT_BOLD}; font-size: 24px; line-height: 32px; font-weight: 700; margin: 6px 0 4px; }
        .rich-note-editor h2 { font-family: ${FONT_BOLD}; font-size: 19px; line-height: 26px; font-weight: 700; margin: 4px 0 2px; }
        .rich-note-editor div, .rich-note-editor p { margin: 0; }
      `}</style>
    </div>
  );
}

function ToolButton({
  label, active, onPress, children,
}: { label: string; active: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Run on mousedown and cancel it so the editor keeps its focus and selection.
      onMouseDown={(e) => { e.preventDefault(); onPress(); }}
      style={{ ...styles.button, ...(active ? styles.buttonActive : null) }}
    >
      {children}
    </button>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    minHeight: 0,
    color: TEXT,
    fontFamily: FONT,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    flexShrink: 0,
  },
  toolbarGap: { width: 6 },
  button: {
    minWidth: 36,
    height: 32,
    padding: '0 8px',
    border: 'none',
    borderRadius: 8,
    background: 'rgba(44,26,14,0.06)',
    color: TEXT,
    fontSize: 15,
    fontFamily: FONT,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
  },
  buttonActive: {
    background: 'rgba(44,26,14,0.18)',
  },
  editorWrap: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  placeholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    color: MUTED,
    fontSize: 16,
    lineHeight: '24px',
    pointerEvents: 'none',
  },
  editor: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    fontSize: 16,
    lineHeight: '24px',
    color: TEXT,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    WebkitUserSelect: 'text',
    userSelect: 'text',
  },
};
