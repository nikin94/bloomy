import { useState } from 'react'

// A single timestamp captured once on mount, stable across renders. Used for
// day-granularity "now" (purge countdowns, period boundaries) where a render-time
// Date.now() would be impure and could drift between renders.
export const useNow = (): number => useState(() => Date.now())[0]
