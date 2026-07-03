import type { ReactNode } from 'react'

// A rail row's text label. Kept ALWAYS MOUNTED so collapsing the rail can FADE it
// (opacity, over the same 300ms as the rail's width animation) and let the narrowing
// rail clip it away, instead of unmounting it instantly. `whitespace-nowrap` keeps it
// one line so it's swallowed cleanly from the right rather than reflowing.
const RailLabel = ({ collapsed, children }: { collapsed: boolean; children: ReactNode }) => (
  <span
    className={`whitespace-nowrap transition-opacity duration-300 ease-out motion-reduce:transition-none ${
      collapsed ? 'opacity-0' : 'opacity-100'
    }`}
  >
    {children}
  </span>
)

export default RailLabel
