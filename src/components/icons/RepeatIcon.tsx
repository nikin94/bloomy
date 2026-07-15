// The repeat (re-order) glyph — circular arrows, used by the order detail
// page's compact mobile action row ("Повторить" collapses to this icon).
// Decorative (`aria-hidden`): the surrounding control carries the accessible
// name/label. `className` defaults to `size-5`, matching the icon set.
const RepeatIcon = ({ className = 'size-5' }: { className?: string }) => (
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
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
)

export default RepeatIcon
