import type { ReactNode } from 'react'

// A plain vertical list of settings rows separated by hairline dividers — NOT a
// bordered card. Dropping the card border + rounding (and the rows' own
// horizontal padding, see Row) lets each control span the page's full content
// width: the page already pads the edges, so a boxed card here only stacked a
// second inset that squeezed the usable width on a phone. The between-row
// hairline keeps the settings scannable (same divider language as
// DetailRow) without walling them off. The FIRST row drops its top padding
// (`first:pt-0`) so the section content sits flush against the page's top padding
// — the same start offset as the account/admin sections (which have no Group), so
// the gap under the top divider is identical across every settings section.
const Group = ({ children }: { children: ReactNode }) => (
  <div className="[&>*+*]:border-t [&>*+*]:border-border [&>*:first-child]:pt-0">{children}</div>
)

export default Group
