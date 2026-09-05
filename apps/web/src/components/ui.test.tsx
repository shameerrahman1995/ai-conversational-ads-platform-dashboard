import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Chip, StatusChip } from './ui';

describe('Chip', () => {
  it('renders its children and applies the tone + dot classes', () => {
    render(
      <Chip tone="success" dot>
        Connected
      </Chip>,
    );
    const chip = screen.getByText('Connected');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass('chip', 'chip-success', 'chip-dot');
  });

  it('defaults to the neutral tone and no dot', () => {
    render(<Chip>Draft</Chip>);
    const chip = screen.getByText('Draft');
    expect(chip).toHaveClass('chip', 'chip-neutral');
    expect(chip).not.toHaveClass('chip-dot');
  });
});

describe('StatusChip', () => {
  it('maps a known lifecycle status to its tone and humanizes the label', () => {
    render(<StatusChip status="VALIDATION_FAILED" />);
    const chip = screen.getByText('Validation Failed');
    expect(chip).toBeInTheDocument();
    // VALIDATION_FAILED -> danger tone in the status map.
    expect(chip).toHaveClass('chip-danger');
    // StatusChip always renders as a dotted chip.
    expect(chip).toHaveClass('chip-dot');
  });

  it('falls back to the neutral tone for an unknown status', () => {
    render(<StatusChip status="SOMETHING_NEW" />);
    const chip = screen.getByText('Something New');
    expect(chip).toHaveClass('chip-neutral');
  });
});
