import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renderiza el título del proyecto', () => {
    render(<App />);
    expect(screen.getByText(/Warachikuy/i)).toBeInTheDocument();
  });
});
