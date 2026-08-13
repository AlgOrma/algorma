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
