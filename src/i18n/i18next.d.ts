import 'i18next'
import type { defaultNS, resources } from './config'

// Type-safe translation keys: `t('settings:title')` is checked at compile time,
// and a typo or a removed key is a TypeScript error, not a silent runtime
// fallback. Keys are derived from the Russian resources — the complete set
// (English may legitimately omit a plural form a locale doesn't need).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS
    resources: (typeof resources)['ru']
  }
}
