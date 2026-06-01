import { describe, it, expect } from 'vitest';
import { formatTime } from './formatTime';

describe('formatTime', () => {
  it('formatea la hora como hh:mm', () => {
    const d = new Date(2026, 0, 1, 9, 5);
    expect(formatTime(d)).toMatch(/^\d{2}:\d{2}/);
  });

  it('usa dos digitos en la medianoche', () => {
    const d = new Date(2026, 0, 1, 0, 0);
    expect(formatTime(d)).toMatch(/^\d{2}:\d{2}/);
  });

  it('usa dos digitos al mediodia', () => {
    const d = new Date(2026, 0, 1, 12, 30);
    expect(formatTime(d)).toMatch(/^\d{2}:\d{2}/);
  });
});
