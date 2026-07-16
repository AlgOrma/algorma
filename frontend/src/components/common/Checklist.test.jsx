import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Checklist from './Checklist';

const steps = [
  { label: 'Read the problem', done: true },
  { label: 'Sketch an approach', done: false, current: true },
  { label: 'Write the code', done: false },
];

describe('Checklist', () => {
  it('renders a label for every step', () => {
    render(<Checklist checklist={steps} />);

    expect(screen.getByText('Read the problem')).toBeInTheDocument();
    expect(screen.getByText('Sketch an approach')).toBeInTheDocument();
    expect(screen.getByText('Write the code')).toBeInTheDocument();
  });

  it('renders nothing for an empty checklist', () => {
    const { container } = render(<Checklist checklist={[]} />);
    expect(container.firstChild).toBeEmptyDOMElement();
  });

  it('calls onToggleStep with the index of the clicked step', async () => {
    const user = userEvent.setup();
    const onToggleStep = vi.fn();
    render(<Checklist checklist={steps} onToggleStep={onToggleStep} />);

    await user.click(screen.getByText('Sketch an approach'));

    expect(onToggleStep).toHaveBeenCalledTimes(1);
    expect(onToggleStep).toHaveBeenCalledWith(1);
  });

  it('reports the correct index for each step across multiple clicks', async () => {
    const user = userEvent.setup();
    const onToggleStep = vi.fn();
    render(<Checklist checklist={steps} onToggleStep={onToggleStep} />);

    await user.click(screen.getByText('Read the problem'));
    await user.click(screen.getByText('Write the code'));

    expect(onToggleStep).toHaveBeenNthCalledWith(1, 0);
    expect(onToggleStep).toHaveBeenNthCalledWith(2, 2);
  });

  it('does not crash when a step is clicked without an onToggleStep callback', async () => {
    const user = userEvent.setup();
    render(<Checklist checklist={steps} />);

    await user.click(screen.getByText('Read the problem'));

    expect(screen.getByText('Read the problem')).toBeInTheDocument();
  });

  it('renders a filled check icon for done steps and an empty circle otherwise', () => {
    render(<Checklist checklist={steps} />);

    // Done steps draw a checkmark <path>; pending steps only draw the outline
    // circle. Rows are plain divs (no checkbox role), so we inspect the svg.
    const doneRow = screen.getByText('Read the problem').closest('div');
    const pendingRow = screen.getByText('Write the code').closest('div');

    expect(doneRow.querySelector('svg path')).toBeInTheDocument();
    expect(pendingRow.querySelector('svg path')).not.toBeInTheDocument();
  });

  it('strikes through a step label when the step has strike set', () => {
    render(
      <Checklist
        checklist={[{ label: 'Old step', done: true, strike: true }]}
      />
    );

    expect(screen.getByText('Old step')).toHaveClass('line-through');
  });

  it('does not strike through a step label without strike set', () => {
    render(<Checklist checklist={[{ label: 'Fresh step', done: false }]} />);

    expect(screen.getByText('Fresh step')).not.toHaveClass('line-through');
  });
});
