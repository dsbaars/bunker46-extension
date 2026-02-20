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
});
