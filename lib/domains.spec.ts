import { describe, it, expect } from 'vitest';
import { getPermissionDomains, filterAndPinDomains } from './domains';

describe('getPermissionDomains', () => {
  it('returns sorted unique domains from permissions and whitelist', () => {
    expect(getPermissionDomains(['zap.stream', 'snort.social'], ['iris.to'])).toEqual([
      'iris.to',
      'snort.social',
      'zap.stream',
    ]);
  });

  it('deduplicates domains present in both sources', () => {
    expect(getPermissionDomains(['snort.social'], ['snort.social', 'iris.to'])).toEqual([
      'iris.to',
      'snort.social',
    ]);
  });

  it('returns empty array when both sources are empty', () => {
    expect(getPermissionDomains([], [])).toEqual([]);
  });
});

describe('filterAndPinDomains', () => {
  const domains = ['iris.to', 'snort.social', 'zap.stream'];

  describe('filtering', () => {
    it('returns all domains when query is empty', () => {
      expect(filterAndPinDomains(domains, '', '')).toEqual(domains);
    });

    it('returns all domains when query is whitespace only', () => {
      expect(filterAndPinDomains(domains, '   ', '')).toEqual(domains);
    });

    it('filters domains by substring match (case-insensitive)', () => {
      expect(filterAndPinDomains(domains, 'snort', '')).toEqual(['snort.social']);
    });

    it('filter is case-insensitive', () => {
      expect(filterAndPinDomains(domains, 'SNORT', '')).toEqual(['snort.social']);
    });

    it('returns empty array when no domain matches the query', () => {
      expect(filterAndPinDomains(domains, 'github', '')).toEqual([]);
    });
  });

  describe('pinning current domain', () => {
    it('pins the current domain to the top', () => {
      const result = filterAndPinDomains(domains, '', 'zap.stream');
      expect(result[0]).toBe('zap.stream');
      expect(result).toHaveLength(3);
    });

    it('preserves the relative order of non-current domains after the pinned one', () => {
      const result = filterAndPinDomains(domains, '', 'zap.stream');
      expect(result).toEqual(['zap.stream', 'iris.to', 'snort.social']);
    });

    it('does not change order when currentDomain is already first', () => {
      const result = filterAndPinDomains(domains, '', 'iris.to');
      expect(result[0]).toBe('iris.to');
    });

    it('is case-insensitive when matching the current domain', () => {
      const result = filterAndPinDomains(domains, '', 'ZAP.STREAM');
      expect(result[0]).toBe('zap.stream');
    });

    it('does not pin when currentDomain is not in the list', () => {
      const result = filterAndPinDomains(domains, '', 'github.com');
      expect(result).toEqual(domains);
    });

    it('does not pin when currentDomain is empty', () => {
      const result = filterAndPinDomains(domains, '', '');
      expect(result).toEqual(domains);
    });
  });

  describe('filtering and pinning combined', () => {
    it('filters first, then pins the current domain among the filtered results', () => {
      const result = filterAndPinDomains(['alpha.io', 'beta.io', 'gamma.io'], 'io', 'gamma.io');
      expect(result[0]).toBe('gamma.io');
      expect(result).toContain('alpha.io');
      expect(result).toContain('beta.io');
    });

    it('returns just the current domain when filter matches only it', () => {
      const result = filterAndPinDomains(domains, 'zap', 'zap.stream');
      expect(result).toEqual(['zap.stream']);
    });

    it('returns empty array when filter excludes the current domain too', () => {
      const result = filterAndPinDomains(domains, 'github', 'zap.stream');
      expect(result).toEqual([]);
    });
  });
});
