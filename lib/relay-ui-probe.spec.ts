import { describe, expect, it } from 'vitest';
import { messageLooksLikeNip42AuthChallenge } from './relay-ui-probe';

describe('relay-ui-probe', () => {
  it('detects NIP-42 AUTH frame with string challenge', () => {
    expect(messageLooksLikeNip42AuthChallenge('["AUTH","abc"]')).toBe(true);
  });

  it('rejects non-JSON', () => {
    expect(messageLooksLikeNip42AuthChallenge('NOTICE hello')).toBe(false);
  });

  it('rejects wrong message type', () => {
    expect(messageLooksLikeNip42AuthChallenge('["EVENT","x",{}]')).toBe(false);
  });
});
