import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  dev: {
    server: {
      port: 3456,
    },
  },
  manifest: {
    name: 'Bunker46',
    description: 'NIP-07 remote signer via NIP-46 / Bunker46',
    permissions: ['storage'],
    web_accessible_resources: [
      {
        resources: ['nostr-provider.js'],
        matches: ['<all_urls>'],
      },
    ],
  },
});
