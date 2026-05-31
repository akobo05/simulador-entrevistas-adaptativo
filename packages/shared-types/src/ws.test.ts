import { describe, it, expect } from 'vitest';
import { WS_CLOSE_CODES, type WsCloseCode } from './ws';

describe('WS_CLOSE_CODES', () => {
  it('expone los codigos definidos en la spec §8', () => {
    expect(WS_CLOSE_CODES.NORMAL).toBe(1000);
    expect(WS_CLOSE_CODES.POLICY_VIOLATION).toBe(1008);
    expect(WS_CLOSE_CODES.KEEPALIVE_FAILURE).toBe(1011);
    expect(WS_CLOSE_CODES.SESSION_REPLACED).toBe(4000);
    expect(WS_CLOSE_CODES.SESSION_EXPIRED).toBe(4001);
  });

  it('WsCloseCode acepta solo valores del const', () => {
    const code: WsCloseCode = WS_CLOSE_CODES.SESSION_REPLACED;
    expect(code).toBe(4000);
  });
});
