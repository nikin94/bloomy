// The funnel (filter) glyph — the order list's filter dialog trigger.
// Decorative (`aria-hidden`): the button carries the accessible name. Keeps its
// `shrink-0` so it never squashes in the cramped mobile top bar.
const FilterIcon = ({ className = 'size-5 shrink-0' }: { className?: string }) => (
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
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

export default FilterIcon
