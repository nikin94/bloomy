import type { ReactNode } from 'react'

// The standard "nothing here" message shown when a screen (or its filtered view)
// has no content: horizontally centred muted text with comfortable vertical
// padding. Every list/stats screen used to hand-roll this same <p>; centralising
// it keeps the empty state identical everywhere, so a new screen just drops one
// in instead of copying the classes.
const EmptyState = ({ children }: { children: ReactNode }) => (
  <p className="m-0 px-4 py-8 text-center text-text">{children}</p>
)

export default EmptyState
