// One legend row for the status bar: a colour dot (matching a bar segment) plus
// the label and exact count.
const LegendItem = ({ dot, label, value }: { dot: string; label: string; value: number }) => (
  <li className="flex items-center gap-2">
    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
    <span className="text-text">{label}</span>
    <span className="tabular-nums font-medium text-heading">{value}</span>
  </li>
)

export default LegendItem
