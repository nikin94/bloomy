// The back (arrow-left) glyph — the mobile top bar's "up to the parent screen"
// control. Decorative (`aria-hidden`): the button carries the accessible name.
const BackIcon = ({ className = 'size-6' }: { className?: string }) => (
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
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
)

export default BackIcon
