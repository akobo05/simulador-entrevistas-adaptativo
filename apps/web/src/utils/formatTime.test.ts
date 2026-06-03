import { describe, it, expect, test } from 'vitest';
import { formatTime, formatMMSS, formatDuration } from './formatTime';

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

test('formatMMSS convierte segundos a MM:SS con padding', () => {
  expect(formatMMSS(0)).toBe('00:00');
  expect(formatMMSS(65)).toBe('01:05');
  expect(formatMMSS(600)).toBe('10:00');
});

test('formatDuration da texto legible', () => {
  expect(formatDuration(45)).toBe('45 seg');
  expect(formatDuration(120)).toBe('2 min');
});
