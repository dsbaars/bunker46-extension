/**
 * Vanilla browser.i18n helper for extension messages.
 * Use in Vue script/template via: import { t } from '@/lib/i18n'
 */
export function t(key: string, ...substitutions: string[]): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    return msg !== '' ? msg : key;
  }
  return key;
}

/** Get method label key for NIP-07 method name (e.g. getPublicKey -> method_getPublicKey) */
export function methodLabelKey(method: string): string {
  return `method_${method}`;
}

/** Get translated method label, falling back to raw method name if no translation */
export function getMethodLabel(method: string): string {
  if (method.startsWith('signEvent:')) {
    const kind = method.slice('signEvent:'.length);
    const msg = t('method_signEvent_kind', kind);
    return msg !== 'method_signEvent_kind' ? msg : `Sign event (kind ${kind})`;
  }
  const key = methodLabelKey(method);
  const msg = t(key);
  return msg !== key ? msg : method;
}
