import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge', () => {
  describe('difficulty type', () => {
    it('renders the label for a known difficulty', () => {
      render(<Badge type="difficulty" value="Hard" />);
      expect(screen.getByText('HARD')).toBeInTheDocument();
    });

    it('renders the abbreviated Medium label', () => {
      render(<Badge type="difficulty" value="Medium" />);
      expect(screen.getByText('MED')).toBeInTheDocument();
    });

    it('falls back to Easy for an unknown difficulty value', () => {
      render(<Badge type="difficulty" value="Impossible" />);
      expect(screen.getByText('EASY')).toBeInTheDocument();
    });

    it('falls back to Easy when value is missing', () => {
      render(<Badge type="difficulty" />);
      expect(screen.getByText('EASY')).toBeInTheDocument();
    });
  });

  describe('status type', () => {
    it('renders the mapped Done status label', () => {
      render(<Badge type="status" value="Done" />);
      expect(screen.getByText('● Done')).toBeInTheDocument();
    });

    it('renders the mapped Solving status label', () => {
      render(<Badge type="status" value="Solving" />);
      expect(screen.getByText('◐ Solving')).toBeInTheDocument();
    });

    it('falls back to "Not started" for an unknown status value', () => {
      render(<Badge type="status" value="Paused" />);
      expect(screen.getByText('○ Not started')).toBeInTheDocument();
    });
  });

  describe('unknown type', () => {
    it('renders nothing when type is not recognized', () => {
      const { container } = render(<Badge type="mystery" value="Easy" />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when type is omitted entirely', () => {
      const { container } = render(<Badge value="Done" />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
