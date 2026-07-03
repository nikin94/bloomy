import type { ReactNode } from 'react'

// One settings row: label on the left, control on the right. The label stays on
// one line (shrink-0 + nowrap) so a wide control can't squeeze it into a wrap.
// No horizontal padding — the row runs edge to edge inside the Group (the Modal
// panel already insets it), so the control gets the full width; only vertical
// padding sets the row rhythm.
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div
    // ≤768px: stack label over control (two lines) so a fixed-width control can't
    // push the row wider than a phone viewport. ≥769px: the original label-left /
    // control-right row.
    className="flex flex-col items-start gap-1.5 py-3 min-[769px]:flex-row min-[769px]:items-center min-[769px]:justify-between min-[769px]:gap-3"
  >
    <span className="text-sm font-medium text-heading min-[769px]:shrink-0 min-[769px]:whitespace-nowrap">
      {label}
    </span>
    {children}
  </div>
)

export default Row
