// The shared checkmark (confirm/save) glyph, matching CloseIcon's stroke style.
// Decorative (`aria-hidden`): the surrounding control carries the accessible
// name/label. `className` defaults to `size-5` and is overridable.
const CheckIcon = ({ className = 'size-5' }: { className?: string }) => (
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
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export default CheckIcon
