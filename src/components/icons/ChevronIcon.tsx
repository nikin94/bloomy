// A downward chevron glyph — used by the sidebar's mobile settings accordion
// (rotated 180° when expanded). Decorative (`aria-hidden`): the surrounding
// control carries the accessible name.
const ChevronIcon = ({ className = 'size-4' }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export default ChevronIcon
