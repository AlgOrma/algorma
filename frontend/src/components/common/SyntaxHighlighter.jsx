import React, { useMemo } from 'react';
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight';
import { pythonLanguage } from '@codemirror/lang-python';
import { javascriptLanguage, typescriptLanguage } from '@codemirror/lang-javascript';
import { javaLanguage } from '@codemirror/lang-java';
import { cppLanguage } from '@codemirror/lang-cpp';
import { goLanguage } from '@codemirror/lang-go';
import { rustLanguage } from '@codemirror/lang-rust';

// Language names as they appear in approach/template `lang` fields
const LANGUAGE_PARSERS = {
  python: pythonLanguage,
  javascript: javascriptLanguage,
  typescript: typescriptLanguage,
  java: javaLanguage,
  'c++': cppLanguage,
  cpp: cppLanguage,
  c: cppLanguage,
  go: goLanguage,
  rust: rustLanguage,
};

// Same token palette as CodeEditor's theme and the regex fallback below
const tokenClasses = tagHighlighter([
  { tag: t.comment, class: 'text-text-muted/80 italic' },
  { tag: [t.string, t.special(t.string), t.regexp], class: 'text-accent-green' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], class: 'text-accent-orange font-medium' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'text-accent-blue' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'text-accent font-medium' },
  { tag: [t.typeName, t.className, t.namespace], class: 'text-accent-blue' },
]);

// Grammar-accurate highlighting for languages CodeMirror can parse
function lezerTokenize(code, language) {
  const nodes = [];
  let key = 0;
  highlightCode(
    code,
    language.parser.parse(code),
    tokenClasses,
    (text, classes) => {
      nodes.push(
        classes ? (
          <span key={key++} className={classes}>
            {text}
          </span>
        ) : (
          text
        )
      );
    },
    () => {
      nodes.push('\n');
    }
  );
  return nodes;
}

// A lightweight, fast regex-based tokenizer used as a fallback when the
// language is unknown. Zero extra bundle footprint.
const TOKEN_REGEX = new RegExp(
  [
    // Comments: // or /* */ or #
    '(?<comment>//.*|/\\*[\\s\\S]*?\\*/|#.*)',
    // Strings: triple quotes, double/single quotes, or backticks
    '(?<string>"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\'|`(?:\\\\.|[^`\\\\])*`)',
    // Keywords: C, C++, Java, Go, Rust, Python keywords
    '(?<keyword>\\b(?:auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|class|namespace|using|template|typename|public|private|protected|new|delete|throw|try|catch|operator|friend|virtual|inline|explicit|export|mutable|nullptr|constexpr|decltype|thread_local|std|interface|extends|implements|package|import|this|super|throws|final|abstract|synchronized|transient|native|strictfp|instanceof|assert|func|select|defer|go|map|chan|fallthrough|range|type|as|async|await|crate|dyn|false|fn|impl|loop|match|mod|move|mut|pub|ref|self|Self|trait|true|unsafe|use|where|def|del|elif|except|finally|from|global|lambda|nonlocal|not|or|pass|raise|with|yield|None)\\b)',
    // Numbers: integer or decimal
    '(?<number>\\b\\d+(?:\\.\\d+)?\\b)',
    // Functions: words followed by '('
    '(?<function>\\b\\w+(?=\\())',
  ].join('|'),
  'g'
);

const REGEX_TOKEN_CLASSES = {
  comment: 'text-text-muted/80 italic',
  string: 'text-accent-green',
  keyword: 'text-accent-orange font-medium',
  number: 'text-accent-blue',
  function: 'text-accent font-medium',
};

function regexTokenize(code) {
  if (!code) return [];
  TOKEN_REGEX.lastIndex = 0;

  const nodes = [];
  let lastIndex = 0;
  let key = 0;
  let match;

  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(code.slice(lastIndex, match.index));
    }

    const groups = match.groups || {};
    const matchedType = Object.keys(REGEX_TOKEN_CLASSES).find((type) => groups[type]);

    nodes.push(
      matchedType ? (
        <span key={key++} className={REGEX_TOKEN_CLASSES[matchedType]}>
          {match[0]}
        </span>
      ) : (
        match[0]
      )
    );

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    nodes.push(code.slice(lastIndex));
  }

  return nodes;
}

export default function SyntaxHighlighter({ code, lang, className = '' }) {
  const content = useMemo(() => {
    const language = LANGUAGE_PARSERS[(lang || '').toLowerCase()];
    if (language) {
      try {
        return lezerTokenize(code || '', language);
      } catch {
        // fall through to the regex tokenizer
      }
    }
    return regexTokenize(code);
  }, [code, lang]);

  return <span className={className}>{content}</span>;
}
