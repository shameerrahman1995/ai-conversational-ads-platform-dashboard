import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { Icon } from './Icon';

describe('Icon', () => {
  it('renders an accessible-hidden 24x24 SVG at the default size', () => {
    const { container } = render(<Icon name="check" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('width', '18');
    expect(svg).toHaveAttribute('height', '18');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies a custom size to both width and height', () => {
    const { container } = render(<Icon name="alert" size={32} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '32');
    expect(svg).toHaveAttribute('height', '32');
    // The glyph draws at least one path element.
    expect(svg?.querySelector('path')).not.toBeNull();
  });
});
