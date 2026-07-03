// The rail collapse toggle's chevron: points LEFT (toward the content edge) to
// collapse the rail; rotated 180° it points right, to expand it back out.
// Decorative (`aria-hidden`): the toggle carries the accessible name.
const CollapseChevron = ({ className = 'size-4' }: { className?: string }) => (
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
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export default CollapseChevron
