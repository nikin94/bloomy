// The shared pencil (edit) glyph — a single source of truth for the edit icon
// (customers list rows, the customer page header, the order page's action
// stack). A PLAIN pencil (owner request): the earlier pencil-over-document
// variant read as "edit a file", and the framing square just added noise at
// icon sizes. Decorative (`aria-hidden`): the surrounding control carries the
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
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
)

export default PencilIcon
