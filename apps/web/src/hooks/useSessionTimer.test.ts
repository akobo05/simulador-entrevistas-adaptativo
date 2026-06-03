import { renderHook, act } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { useSessionTimer } from './useSessionTimer';

test('useSessionTimer cuenta y formatea', () => {
  vi.useFakeTimers();
  // La firma real es useSessionTimer(autoStart: boolean), no un objeto de opciones
  const { result } = renderHook(() => useSessionTimer(true));
  act(() => {
    vi.advanceTimersByTime(65_000);
  });
  expect(result.current.formattedTime).toBe('01:05');
  vi.useRealTimers();
});
