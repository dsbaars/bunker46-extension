import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig(async () => ({
  plugins: [await WxtVitest()],
  test: {
    environment: 'node',
    include: ['lib/**/*.spec.ts', 'lib/**/*.test.ts'],
    globals: true,
  },
}));
