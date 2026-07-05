import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Compose Tailwind class names: `clsx` flattens conditionals (strings, arrays,
// `cond && 'x'`, `{ 'x': cond }`) into one string, and `tailwind-merge` then
// de-dupes conflicting utilities so the LAST one wins (e.g. a caller's
// `className` can override a base `px-4` with `px-6` without both lingering).
//
// CONTRACT: when a caller passes a Tailwind utility that conflicts with a base
// utility, the caller's class wins DETERMINISTICALLY — not by CSS source-order
// (which is what a plain `` `base ${className}` `` concat relied on, and which
// shifts if the emitted CSS is reordered). Components that take an external
// `className` and route it through `cn(...)` (Button, Tooltip, DataTable rows,
// etc.) can therefore be trusted to let the caller override — that is a
// guarantee, not a happy accident of specificity.
//
// Replaces the two ad-hoc patterns that were sprinkled across the components:
// hand-built template literals (`` `base ${cond ? 'a' : 'b'}` ``) and
// `[ ... ].join(' ')` arrays. Use it wherever class names are assembled
// conditionally; a plain static string stays a plain string.
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs))
