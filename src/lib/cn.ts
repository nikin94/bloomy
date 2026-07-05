import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Compose Tailwind class names: `clsx` flattens conditionals (strings, arrays,
// `cond && 'x'`, `{ 'x': cond }`) into one string, and `tailwind-merge` then
// de-dupes conflicting utilities so the LAST one wins (e.g. a caller's
// `className` can override a base `px-4` with `px-6` without both lingering).
//
// Replaces the two ad-hoc patterns that were sprinkled across the components:
// hand-built template literals (`` `base ${cond ? 'a' : 'b'}` ``) and
// `[ ... ].join(' ')` arrays. Use it wherever class names are assembled
// conditionally; a plain static string stays a plain string.
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
