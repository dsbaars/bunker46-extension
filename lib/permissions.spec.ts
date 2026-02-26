import { describe, it, expect, beforeEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getPermissions,
  checkPermission,
  setPermission,
  removePermission,
  removeDomainPermissions,
} from './permissions';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('permissions', () => {
  it('getPermissions returns empty object initially', async () => {
    const policies = await getPermissions();
    expect(policies).toEqual({});
  });

  it('setPermission and checkPermission', async () => {
    await setPermission('example.com', 'getPublicKey', 'allow');
    expect(await checkPermission('example.com', 'getPublicKey')).toBe('allow');
    expect(await checkPermission('example.com', 'signEvent')).toBe(null);
    expect(await checkPermission('other.com', 'getPublicKey')).toBe(null);
  });

  it('setPermission deny', async () => {
    await setPermission('example.com', 'signEvent', 'deny');
    expect(await checkPermission('example.com', 'signEvent')).toBe('deny');
  });

  it('removePermission removes one method', async () => {
    await setPermission('example.com', 'getPublicKey', 'allow');
    await setPermission('example.com', 'signEvent', 'allow');
    await removePermission('example.com', 'getPublicKey');
    expect(await checkPermission('example.com', 'getPublicKey')).toBe(null);
    expect(await checkPermission('example.com', 'signEvent')).toBe('allow');
  });

  it('removePermission removes domain when last method removed', async () => {
    await setPermission('example.com', 'getPublicKey', 'allow');
    await removePermission('example.com', 'getPublicKey');
    const policies = await getPermissions();
    expect(policies).not.toHaveProperty('example.com');
  });

  it('removeDomainPermissions removes all methods for domain', async () => {
    await setPermission('example.com', 'getPublicKey', 'allow');
    await setPermission('example.com', 'signEvent', 'deny');
    await removeDomainPermissions('example.com');
    expect(await checkPermission('example.com', 'getPublicKey')).toBe(null);
    expect(await checkPermission('example.com', 'signEvent')).toBe(null);
    const policies = await getPermissions();
    expect(policies).not.toHaveProperty('example.com');
  });

  it('rejects reserved keys and invalid method (security)', async () => {
    await setPermission('__proto__', 'signEvent', 'allow');
    expect(await checkPermission('__proto__', 'signEvent')).toBe(null);

    await setPermission('example.com', 'invalidMethod', 'allow');
    expect(await checkPermission('example.com', 'invalidMethod')).toBe(null);

    await setPermission('example.com', 'getPublicKey', 'allow');
    await removePermission('__proto__', 'signEvent');
    await removeDomainPermissions('constructor');
    const policies = await getPermissions();
    expect(policies).toHaveProperty('example.com');
    expect(policies).not.toHaveProperty('__proto__');
    expect(policies).not.toHaveProperty('constructor');
  });

  it('signEvent per-kind: kind-specific overrides generic', async () => {
    await setPermission('example.com', 'signEvent', 'allow'); // all kinds
    expect(await checkPermission('example.com', 'signEvent')).toBe('allow');
    expect(await checkPermission('example.com', 'signEvent', 1)).toBe('allow');
    expect(await checkPermission('example.com', 'signEvent', 7)).toBe('allow');

    await setPermission('example.com', 'signEvent', 'deny', 0); // deny kind 0 only
    expect(await checkPermission('example.com', 'signEvent', 0)).toBe('deny');
    expect(await checkPermission('example.com', 'signEvent', 1)).toBe('allow');
    expect(await checkPermission('example.com', 'signEvent')).toBe('allow');

    await setPermission('example.com', 'signEvent', 'allow', 7); // allow kind 7
    expect(await checkPermission('example.com', 'signEvent', 7)).toBe('allow');
    expect(await checkPermission('example.com', 'signEvent', 1)).toBe('allow');
  });

  it('signEvent per-kind: revoke by composite key', async () => {
    await setPermission('example.com', 'signEvent', 'allow', 1);
    expect(await checkPermission('example.com', 'signEvent', 1)).toBe('allow');
    await removePermission('example.com', 'signEvent:1');
    expect(await checkPermission('example.com', 'signEvent', 1)).toBe(null);
  });
});
