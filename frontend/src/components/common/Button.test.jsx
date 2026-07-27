import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from './Button';

describe('Button', () => {
  it('renders its children inside a button element', () => {
    render(<Button>Save changes</Button>);
    expect(
      screen.getByRole('button', { name: 'Save changes' })
    ).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);

    await user.click(screen.getByRole('button', { name: 'Click me' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not crash when clicked without an onClick handler', async () => {
    const user = userEvent.setup();
    render(<Button>No handler</Button>);

    await user.click(screen.getByRole('button', { name: 'No handler' }));

    expect(
      screen.getByRole('button', { name: 'No handler' })
    ).toBeInTheDocument();
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Disabled
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards extra props like type and aria-label to the button element', () => {
    render(
      <Button type="submit" aria-label="Submit form">
        Go
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Submit form' });
    expect(button).toHaveAttribute('type', 'submit');
  });

  it.each(['primary', 'secondary', 'white', 'green', 'red', 'orange', 'ghost'])(
    'remains a clickable button for the %s variant',
    async (variant) => {
      const user = userEvent.setup();
      const onClick = vi.fn();
      render(
        <Button variant={variant} onClick={onClick}>
          Variant
        </Button>
      );

      await user.click(screen.getByRole('button', { name: 'Variant' }));
      expect(onClick).toHaveBeenCalledTimes(1);
    }
  );

  it('applies the variant class as its styling contract', () => {
    render(<Button variant="red">Danger</Button>);
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass(
      'btn-3d-red'
    );
  });

  it('adds the small size class when size is sm', () => {
    render(<Button size="sm">Small</Button>);
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass(
      'btn-3d-sm'
    );
  });

  it('keeps the small size class for the ghost variant', () => {
    // ConfirmationModal renders variant="ghost" size="sm" for its Cancel
    // button next to a size="sm" confirm button; both must get btn-3d-sm so
    // the pair renders at the same size.
    render(
      <Button variant="ghost" size="sm">
        Ghost small
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Ghost small' });
    expect(button).toHaveClass('btn-3d-sm');
    // Ghost must still opt out of the 3D chrome. Asserting only the size class
    // would also pass if ghost became additive over the default base classes,
    // which would restyle every ghost button in the app.
    expect(button).not.toHaveClass('btn-3d');
  });
});
