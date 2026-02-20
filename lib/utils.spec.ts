import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('handles tailwind conflict (later wins)', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('handles undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });

  it('handles conditional class', () => {
    const show = true;
    const hide = false;
    expect(cn('base', hide && 'hidden', show && 'block')).toBe('base block');
  });
});
