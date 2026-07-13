import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello() {
  return <div>hello vobo</div>;
}

describe('smoke', () => {
  it('renders a component with RTL + jsdom', () => {
    render(<Hello />);
    expect(screen.getByText('hello vobo')).toBeInTheDocument();
  });
});
