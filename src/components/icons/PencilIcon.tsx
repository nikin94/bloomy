// The shared pencil (edit) glyph — a single source of truth for the edit icon
// used by the customers list rows, the customer page header (mobile), and the
// order detail page's customer row (all rendered the identical SVG inline
// before). Decorative (`aria-hidden`): the surrounding control carries the
// accessible name/label. `className` defaults to `size-5` (the size the call
// sites used) and is overridable so a caller can size it differently.
const PencilIcon = ({ className = 'size-5' }: { className?: string }) => (
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
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export default PencilIcon
