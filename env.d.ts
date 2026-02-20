/// <reference types="wxt/client-types" />

declare const chrome: typeof globalThis.chrome & {
  runtime: {
    sendMessage: (msg: unknown, cb?: (r: unknown) => void) => void;
    getURL: (path: string) => string;
    id: string;
  };
  storage: {
    local: {
      get: (keys: string | string[] | null, cb?: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, cb?: () => void) => void;
      remove: (keys: string | string[], cb?: () => void) => void;
    };
  };
  windows: {
    create: (options: {
      url?: string;
      type?: string;
      width?: number;
      height?: number;
      left?: number;
      top?: number;
      focused?: boolean;
    }) => Promise<{ id?: number }>;
    getLastFocused: () => Promise<{
      id?: number;
      left?: number;
      top?: number;
      width?: number;
      height?: number;
    }>;
    onRemoved: {
      addListener: (callback: (windowId: number) => void) => void;
    };
  };
  tabs: {
    create: (options: { url?: string; active?: boolean }) => void;
  };
};
