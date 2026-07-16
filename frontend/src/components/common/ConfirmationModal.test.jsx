import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmationModal from './ConfirmationModal';

describe('ConfirmationModal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmationModal isOpen={false} onConfirm={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the default title, message and button labels when open', () => {
    render(<ConfirmationModal isOpen onConfirm={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('ARE YOU SURE?')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('uppercases a custom title and shows the custom message and labels', () => {
    render(
      <ConfirmationModal
        isOpen
        title="Remove problem"
        message="The problem will be gone forever."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('REMOVE PROBLEM')).toBeInTheDocument();
    expect(
      screen.getByText('The problem will be gone forever.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
  });

  it('calls onConfirm (and not onCancel) when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationModal isOpen onConfirm={onConfirm} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel (and not onConfirm) when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmationModal isOpen onConfirm={onConfirm} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel when the close (X) button in the header is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <ConfirmationModal isOpen onConfirm={vi.fn()} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: '✕' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies the confirmVariant to the confirm button', () => {
    render(
      <ConfirmationModal
        isOpen
        confirmVariant="green"
        confirmLabel="Approve"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toHaveClass(
      'btn-3d-green'
    );
  });
});
