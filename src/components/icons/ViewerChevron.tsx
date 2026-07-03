// The photo viewer's prev/next nav chevron. A stroked SVG (not the ‹/› glyphs,
// which sit off-centre in their em-box) so `flex items-center justify-center`
// centres it exactly in the round button. `direction` flips it left/right.
// Decorative (`aria-hidden`): the button carries the accessible name.
const ViewerChevron = ({ direction }: { direction: 'left' | 'right' }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-6"
  >
    {direction === 'left' ? (
      <polyline points="15 18 9 12 15 6" />
    ) : (
      <polyline points="9 18 15 12 9 6" />
    )}
  </svg>
)

export default ViewerChevron
