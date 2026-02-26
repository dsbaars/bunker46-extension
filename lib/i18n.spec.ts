import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'public', '_locales');

type MessagesJson = Record<string, { message: string }>;

function loadMessages(locale: string): MessagesJson {
  const filePath = path.join(LOCALES_DIR, locale, 'messages.json');
  return JSON.parse(readFileSync(filePath, 'utf-8')) as MessagesJson;
}

function getMessageKeys(messages: MessagesJson): string[] {
  return Object.keys(messages).sort();
}

describe('i18n locale files', () => {
  const locales = readdirSync(LOCALES_DIR).filter((name) => {
    const full = path.join(LOCALES_DIR, name);
    return path.basename(full) !== 'messages.json' && path.extname(name) === '';
  });

  it('has at least en and one other locale', () => {
    expect(locales).toContain('en');
    expect(locales.length).toBeGreaterThanOrEqual(2);
  });

  const enMessages = loadMessages('en');
  const enKeys = getMessageKeys(enMessages);

  it('en has expected message keys (extName, tab labels, etc.)', () => {
    expect(enMessages).toHaveProperty('extName');
    expect(enMessages).toHaveProperty('extDescription');
    expect(enMessages).toHaveProperty('tabConnection');
    expect(enMessages).toHaveProperty('tabPermissions');
    expect(enMessages).toHaveProperty('tabSettings');
    expect(enMessages).toHaveProperty('connect');
    expect(enMessages).toHaveProperty('promptPermissionRequest');
  });

  describe.each(locales)('%s has same keys as en and non-empty messages', (locale) => {
    it(`${locale} messages.json is valid and complete`, () => {
      const messages = loadMessages(locale);
      const keys = getMessageKeys(messages);
      expect(keys).toEqual(enKeys);

      for (const key of enKeys) {
        const entry = messages[key];
        expect(entry, `missing entry for key: ${key}`).toBeDefined();
        expect(entry!.message, `empty message for key: ${key}`).toBeDefined();
        expect(typeof entry!.message).toBe('string');
        expect(entry!.message.length).toBeGreaterThan(0);
      }
    });
  });
});
