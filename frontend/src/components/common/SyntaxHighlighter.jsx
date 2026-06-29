import React, { useMemo } from 'react';

// A lightweight, fast regex-based tokenizer/syntax highlighter.
// Zero dependencies, very small bundle footprint.
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

function tokenize(code) {
  if (!code) return [];
  TOKEN_REGEX.lastIndex = 0;
  
  const tokens = [];
  let lastIndex = 0;
  let match;
  
  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        text: code.slice(lastIndex, match.index),
      });
    }
    
    const groups = match.groups || {};
    let matchedType = 'text';
    
    if (groups.comment) matchedType = 'comment';
    else if (groups.string) matchedType = 'string';
    else if (groups.keyword) matchedType = 'keyword';
    else if (groups.number) matchedType = 'number';
    else if (groups.function) matchedType = 'function';
    
    tokens.push({
      type: matchedType,
      text: match[0],
    });
    
    lastIndex = TOKEN_REGEX.lastIndex;
  }
  
  if (lastIndex < code.length) {
    tokens.push({
      type: 'text',
      text: code.slice(lastIndex),
    });
  }
  
  return tokens;
}

export default function SyntaxHighlighter({ code, className = '' }) {
  const tokens = useMemo(() => tokenize(code), [code]);

  return (
    <span className={className}>
      {tokens.map((token, idx) => {
        if (token.type === 'text') {
          return token.text;
        }
        
        let styleClass = '';
        switch (token.type) {
          case 'comment':
            styleClass = 'text-text-muted/80 italic';
            break;
          case 'string':
            styleClass = 'text-accent-green';
            break;
          case 'keyword':
            styleClass = 'text-accent-orange font-medium';
            break;
          case 'number':
            styleClass = 'text-accent-blue';
            break;
          case 'function':
            styleClass = 'text-accent font-medium';
            break;
          default:
            break;
        }
        
        return (
          <span key={idx} className={styleClass}>
            {token.text}
          </span>
        );
      })}
    </span>
  );
}
