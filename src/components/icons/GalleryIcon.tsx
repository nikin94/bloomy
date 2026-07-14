// The picture/gallery glyph — the "add photo from the gallery / file picker"
// tile on the order photo galleries, next to the camera tile (CameraIcon, which
// opens the device camera directly). Decorative (`aria-hidden`): the surrounding
// button carries the accessible name.
const GalleryIcon = ({ className = 'size-6' }: { className?: string }) => (
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
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.75" />
    <path d="m21 15.5-4.1-4.1a2 2 0 0 0-2.8 0L6.5 19" />
  </svg>
)

export default GalleryIcon
