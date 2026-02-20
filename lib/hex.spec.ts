import { describe, it, expect } from 'vitest';
import { bytesToHex, hexToBytes } from './hex';

describe('bytesToHex', () => {
  it('converts bytes to hex string', () => {
    expect(bytesToHex(new Uint8Array([0, 255, 16]))).toBe('00ff10');
  });

  it('handles empty array', () => {
    expect(bytesToHex(new Uint8Array(0))).toBe('');
  });
});

describe('hexToBytes', () => {
  it('converts hex string to bytes', () => {
    const bytes = hexToBytes('00ff10');
    expect(bytes).toEqual(new Uint8Array([0, 255, 16]));
  });

  it('handles empty string', () => {
    expect(hexToBytes('')).toEqual(new Uint8Array(0));
  });

  it('round-trips with bytesToHex', () => {
    const original = new Uint8Array([1, 2, 3, 254, 255]);
    const hex = bytesToHex(original);
    const back = hexToBytes(hex);
    expect(back).toEqual(original);
  });
});
