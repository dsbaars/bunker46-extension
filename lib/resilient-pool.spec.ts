import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientPool } from './resilient-pool';

// Mock WebSocket for Node.js test environment
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  readyState: number = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 10);
  }

  send(_data: string) {}
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: 'Normal closure' });
  }

  static clear() {
    MockWebSocket.instances = [];
  }
}

beforeEach(() => {
  MockWebSocket.clear();
  (global as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
});

afterEach(() => {
  MockWebSocket.clear();
});

describe('ResilientPool', () => {
  describe('constructor', () => {
    it('should create a pool with default options', () => {
      const pool = new ResilientPool();
      expect(pool).toBeInstanceOf(ResilientPool);
      expect(pool.minSuccessfulRelays).toBe(1);
    });

    it('should accept custom minSuccessfulRelays', () => {
      const pool = new ResilientPool({ minSuccessfulRelays: 2 });
      expect(pool.minSuccessfulRelays).toBe(2);
    });

    it('should accept custom maxWaitForConnection', () => {
      const pool = new ResilientPool({ maxWaitForConnection: 5000 });
      expect(pool.maxWaitForConnection).toBe(5000);
    });
  });

  describe('callbacks', () => {
    it('should store onRelayConnectionFailure callback', () => {
      const onRelayConnectionFailure = vi.fn();
      const pool = new ResilientPool({ onRelayConnectionFailure });
      expect(pool.onRelayConnectionFailure).toBe(onRelayConnectionFailure);
    });

    it('should store onRelayConnectionSuccess callback', () => {
      const onRelayConnectionSuccess = vi.fn();
      const pool = new ResilientPool({ onRelayConnectionSuccess });
      expect(pool.onRelayConnectionSuccess).toBe(onRelayConnectionSuccess);
    });

    it('should store onPartialSuccess callback', () => {
      const onPartialSuccess = vi.fn();
      const pool = new ResilientPool({ onPartialSuccess });
      expect(pool.onPartialSuccess).toBe(onPartialSuccess);
    });
  });

  describe('interface compatibility', () => {
    it('should have the same public interface as SimplePool', () => {
      const pool = new ResilientPool();

      // Core methods required for NIP-46 compatibility
      expect(typeof pool.ensureRelay).toBe('function');
      expect(typeof pool.subscribe).toBe('function');
      expect(typeof pool.subscribeMany).toBe('function');
      expect(typeof pool.subscribeMap).toBe('function');
      expect(typeof pool.publish).toBe('function');
      expect(typeof pool.get).toBe('function');
      expect(typeof pool.close).toBe('function');
      expect(typeof pool.destroy).toBe('function');
    });

    it('should have verifyEvent', () => {
      const pool = new ResilientPool();
      expect(pool.verifyEvent).toBeDefined();
      expect(typeof pool.verifyEvent).toBe('function');
    });
  });

  describe('subscribeMap', () => {
    it('should handle empty relay list', () => {
      const pool = new ResilientPool();
      const closer = pool.subscribeMap([], { onevent: () => {} });
      expect(closer).toBeDefined();
      expect(typeof closer.close).toBe('function');
    });
  });

  describe('publish', () => {
    it('should return an array of promises', () => {
      const pool = new ResilientPool();
      const event = {
        id: 'test-id',
        pubkey: 'test-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [] as string[][],
        content: 'test',
        sig: 'test-sig',
      };

      const results = pool.publish(['wss://relay1.example', 'wss://relay2.example'], event);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(2);
    });
  });

  describe('publishResilient', () => {
    it('should be available', () => {
      const pool = new ResilientPool();
      expect(typeof pool.publishResilient).toBe('function');
    });
  });
});
