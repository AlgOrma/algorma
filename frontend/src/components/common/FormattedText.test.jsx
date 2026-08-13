import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormattedText from './FormattedText';

function preText(container) {
  return container.querySelector('pre')?.textContent || '';
}

describe('FormattedText code blocks', () => {
  it('parses a python code fence and keeps the language tag out of the code', () => {
    const { container } = render(
      <FormattedText content={'```python\ndef f():\n    return 42\n```'} />
    );

    expect(screen.getByText('PYTHON CODE')).toBeInTheDocument();
    expect(preText(container)).toContain('def f():');
    expect(preText(container)).not.toContain('python');
  });

  it('captures common language tags', () => {
    for (const lang of ['cpp', 'js', 'java', 'go']) {
      const { container, unmount } = render(
        <FormattedText content={`\`\`\`${lang}\nint main() {}\n\`\`\``} />
      );
      expect(screen.getByText(`${lang.toUpperCase()} CODE`)).toBeInTheDocument();
      expect(preText(container)).not.toMatch(new RegExp(`^${lang}\\s`));
      unmount();
    }
  });

  it('falls back to a python label for fences without a language tag', () => {
    render(<FormattedText content={'```\nprint(1)\n```'} />);
    expect(screen.getByText('PYTHON CODE')).toBeInTheDocument();
  });

  it('renders prose around and between code blocks', () => {
    render(<FormattedText content={'before\n```js\nconst x = 1;\n```\nafter'} />);
    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
  });

  it('shows an empty-content placeholder', () => {
    render(<FormattedText content="   " />);
    expect(screen.getByText('Empty content')).toBeInTheDocument();
  });
});

describe('FormattedText inline formatting', () => {
  it('renders bold, italic, inline code and math', () => {
    render(<FormattedText content={'**b** and *i* and `c` and $x^2$'} />);
    expect(screen.getByText('b').tagName).toBe('STRONG');
    expect(screen.getByText('i').tagName).toBe('EM');
    expect(screen.getByText('c').tagName).toBe('CODE');
    expect(screen.getByText('x^2')).toBeInTheDocument();
  });

  it('leaves multiplication asterisks in complexity notation alone', () => {
    const { container } = render(
      <FormattedText content={'Time: O(n * m) and space O(n * k)'} />
    );
    expect(container.querySelector('em')).toBeNull();
    expect(container.textContent).toBe('Time: O(n * m) and space O(n * k)');
  });

  it('leaves literal dollar amounts alone', () => {
    const { container } = render(<FormattedText content={'The pass costs $5 and $10'} />);
    expect(container.textContent).toBe('The pass costs $5 and $10');
  });

  it('does not italicise across a space-padded delimiter', () => {
    const { container } = render(<FormattedText content={'a * b * c'} />);
    expect(container.querySelector('em')).toBeNull();
  });

  it('leaves bare delimiter runs alone', () => {
    const { container } = render(
      <FormattedText content={'5 stars ***** and I paid $$$ for it'} />
    );
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
    expect(container.textContent).toBe('5 stars ***** and I paid $$$ for it');
  });

  it('does not let a bold+italic wrap swallow its own delimiters', () => {
    // The editor toolbar produces this by applying Bold then Italic to one
    // selection, so the live preview hits it constantly.
    const { container } = render(<FormattedText content={'***text***'} />);
    expect(container.querySelector('strong')?.textContent).toBe('text');
    expect(container.textContent).toBe('*text*');
  });
});
