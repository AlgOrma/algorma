// Markdown → HTML string for editorial solutions, rendered via
// dangerouslySetInnerHTML by the LeetCode library and the problem detail page.
//
// This is deliberately separate from <FormattedText>, which renders React nodes
// (and real <CodeBlock> syntax highlighting) for flashcards. Two renderers, two
// output types — but only one copy of each: this used to be duplicated verbatim
// in ProblemDetail.jsx and LeetCodeLibrary.jsx, so every fix had to land twice.
export const formatMarkdown = (text) => {
  if (!text) return '';
  let html = text
    .replace(/^### (.*$)/gim, '<h4 class="text-fs-14 font-semibold text-text-main mt-4 mb-1.5">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 class="text-fs-16 font-bold text-text-main mt-5 mb-2 border-b border-border-main pb-1">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 class="text-fs-18 font-extrabold text-text-main mt-6 mb-3">$1</h2>')
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-text-main font-semibold">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-bg-code border border-border-muted px-1.5 py-0.5 rounded text-fs-12 font-mono text-accent-text">$1</code>')
    .replace(/```python([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```javascript([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```java([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```cpp([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre class="bg-bg-code border border-border-muted rounded-lg p-3 my-3.5 font-mono text-fs-12 text-left overflow-x-auto whitespace-pre"><code class="text-text-main">$1</code></pre>')
    .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13-5">$1</li>')
    .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc my-1 text-fs-13-5">$1</li>')
    .replace(/\$\$(.*?)\$\$/g, '<span class="font-mono bg-bg-code/30 px-1 py-0.5 rounded text-fs-12">$1</span>');

  return html
    .split('\n')
    .map((line) => {
      if (
        line.trim().startsWith('<h') ||
        line.trim().startsWith('<li') ||
        line.trim().startsWith('<pre') ||
        line.trim().startsWith('</pre') ||
        line.trim().startsWith('<code') ||
        line.trim().startsWith('</code')
      ) {
        return line;
      }
      return line ? `<p class="my-2 text-fs-13-5 leading-relaxed text-text-hover">${line}</p>` : '';
    })
    .join('');
};

export default formatMarkdown;
