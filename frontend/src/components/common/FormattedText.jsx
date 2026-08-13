import React from 'react';
import CodeBlock from './CodeBlock';

/**
 * Parses and renders rich Markdown formatting including code blocks, inline code,
 * bold/italic text, math formulas, headings, and bullet lists.
 */
export default function FormattedText({ content = '', className = '' }) {
  if (!content || !content.trim()) {
    return <span className="text-text-muted italic opacity-60">Empty content</span>;
  }

  // Regex to detect fenced code blocks: ```lang\ncode```
  const codeBlockRegex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const [fullMatch, lang, code] = match;
    const matchIndex = match.index;

    // Render preceding prose before the code block
    if (matchIndex > lastIndex) {
      const prose = content.substring(lastIndex, matchIndex);
      elements.push(
        <React.Fragment key={`prose-${lastIndex}`}>
          {renderProse(prose)}
        </React.Fragment>
      );
    }

    // Render code block
    const cleanLang = lang.trim() || 'python';
    elements.push(
      <CodeBlock
        key={`code-${matchIndex}`}
        code={code.trim()}
        lang={cleanLang}
        title={`${cleanLang.toUpperCase()} CODE`}
        className="my-3"
      />
    );

    lastIndex = matchIndex + fullMatch.length;
  }

  // Render remaining prose after last code block
  if (lastIndex < content.length) {
    const remainingProse = content.substring(lastIndex);
    elements.push(
      <React.Fragment key={`prose-${lastIndex}`}>
        {renderProse(remainingProse)}
      </React.Fragment>
    );
  }

  return <div className={`formatted-text leading-relaxed text-left ${className}`}>{elements}</div>;
}

/**
 * Helper to parse inline prose: headings, lists, bold, italic, inline code, and math formulas.
 */
function renderProse(text) {
  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      return <div key={lineIdx} className="h-2" />;
    }

    // Headings (e.g. ### Heading)
    if (trimmed.startsWith('#')) {
      const level = trimmed.match(/^#+/)?.[0].length || 1;
      const headingText = trimmed.replace(/^#+\s*/, '');
      const fontSize = level === 1 ? 'text-fs-18' : level === 2 ? 'text-fs-16' : 'text-fs-14';
      return (
        <div key={lineIdx} className={`${fontSize} font-bold text-text-main my-2 tracking-tight`}>
          {parseInlineFormatting(headingText)}
        </div>
      );
    }

    // Bullet List Items (e.g. - Item or * Item)
    if (/^[-*•]\s+/.test(trimmed)) {
      const itemText = trimmed.replace(/^[-*•]\s+/, '');
      return (
        <div key={lineIdx} className="flex items-start gap-2 my-1 pl-2">
          <span className="text-accent select-none font-bold">•</span>
          <span className="flex-1">{parseInlineFormatting(itemText)}</span>
        </div>
      );
    }

    // Standard Paragraph Line
    return (
      <p key={lineIdx} className="my-1">
        {parseInlineFormatting(line)}
      </p>
    );
  });
}

/**
 * Parses inline formatting: inline code `code`, bold **text**, italic *text*, math $formula$
 */
function parseInlineFormatting(str) {
  if (!str) return '';

  // Tokenize inline syntax
  // Pattern matches `inline code`, $math$, **bold**, *italic*
  const tokenRegex = /(`[^`]+`|\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = str.split(tokenRegex);

  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={i}
          className="font-mono text-fs-12 px-1.5 py-0.5 rounded bg-bg-track border border-border-btn text-accent font-semibold inline-block"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return (
        <span
          key={i}
          className="font-mono text-fs-12 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 inline-block font-semibold"
        >
          {part.slice(1, -1)}
        </span>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold text-text-main">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i} className="italic text-text-light">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}
