import React, { useMemo } from 'react';
import CodeMirror, { EditorView } from '@uiw/react-codemirror';
import { createTheme } from '@uiw/codemirror-themes';
import { tags as t } from '@lezer/highlight';
import { indentUnit } from '@codemirror/language';
import { python } from '@codemirror/lang-python';
import { javascript } from '@codemirror/lang-javascript';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { go } from '@codemirror/lang-go';
import { rust } from '@codemirror/lang-rust';

// Language names as they appear in approach/template `lang` fields
const LANGUAGE_EXTENSIONS = {
  python: python,
  javascript: javascript,
  typescript: () => javascript({ typescript: true }),
  java: java,
  'c++': cpp,
  cpp: cpp,
  c: cpp,
  go: go,
  rust: rust,
};

// Token colors mirror SyntaxHighlighter.jsx so read-only blocks and editors
// look the same. CSS variables keep the dynamic accent theme working.
const algormaTheme = createTheme({
  theme: 'dark',
  settings: {
    background: 'transparent',
    foreground: 'var(--color-text-code)',
    caret: 'var(--color-accent)',
    selection: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
    selectionMatch: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    lineHighlight: 'transparent',
    gutterBackground: 'transparent',
    gutterForeground: '#333333',
    gutterBorder: 'var(--color-border-muted)',
    fontFamily: 'var(--font-mono)',
  },
  styles: [
    { tag: t.comment, color: 'var(--color-text-muted)', fontStyle: 'italic' },
    { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--color-accent-green)' },
    { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--color-accent-orange)', fontWeight: '500' },
    { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--color-accent-blue)' },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--color-accent)', fontWeight: '500' },
    { tag: [t.typeName, t.className, t.namespace], color: 'var(--color-accent-blue)' },
  ],
});

const baseStyles = EditorView.theme({
  '&': { fontSize: 'inherit' },
  '.cm-content': { padding: '12px 0', lineHeight: '1.65' },
  '.cm-line': { padding: '0 14px' },
  '.cm-gutters': { lineHeight: '1.65' },
  '.cm-lineNumbers .cm-gutterElement': { paddingLeft: '10px', paddingRight: '10px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-placeholder': { color: 'var(--color-text-muted)' },
});

export default function CodeEditor({
  value,
  onChange,
  language = 'Python',
  placeholder,
  lineNumbers = true,
  height,
  minHeight,
  maxHeight,
  readOnly = false,
  className = '',
}) {
  const extensions = useMemo(() => {
    const langFactory = LANGUAGE_EXTENSIONS[(language || '').toLowerCase()];
    const exts = [baseStyles, indentUnit.of('    ')];
    if (langFactory) exts.push(langFactory());
    return exts;
  }, [language]);

  return (
    <CodeMirror
      value={value || ''}
      onChange={onChange}
      theme={algormaTheme}
      extensions={extensions}
      placeholder={placeholder}
      height={height}
      minHeight={minHeight}
      maxHeight={maxHeight}
      readOnly={readOnly}
      indentWithTab
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        autocompletion: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        searchKeymap: false,
      }}
      className={`select-text text-left ${className}`}
    />
  );
}
