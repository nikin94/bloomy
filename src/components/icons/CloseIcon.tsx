// The shared X (close/dismiss) glyph — a single source of truth for the cross
// icon used by the Modal header's close button and the SearchControl's clear/
// collapse button (both rendered the identical SVG inline before). Decorative
// (`aria-hidden`): the surrounding control carries the accessible name/label.
// `className` defaults to `size-5` (the size both call sites used) and is
// overridable so a future caller can size it differently.
const CloseIcon = ({ className = 'size-5' }: { className?: string }) => (
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
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

export default CloseIcon
