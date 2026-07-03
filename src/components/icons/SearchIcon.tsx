// The loupe (search) glyph — the order/customer/trash list search trigger.
// Decorative (`aria-hidden`): the button carries the accessible name. Keeps its
// `shrink-0` so it never squashes in the cramped mobile top bar.
const SearchIcon = ({ className = 'size-5 shrink-0' }: { className?: string }) => (
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
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

export default SearchIcon
