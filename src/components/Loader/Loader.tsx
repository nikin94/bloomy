// A spinning ring loader, drawn from the current text colour so it reads on any
// background it's placed on: inside a primary Button it's white, inside a danger
// Button it's red, on the page it's the brand colour — set via `text-*` on the
// element or an ancestor. The track is transparent and only the TOP edge is
// coloured (currentColor), so the spinning arc is clearly visible — Tailwind v4
// drops the opacity modifier on the `current` keyword, so a faint full ring isn't
// available without hardcoding a colour, and an arc reads better anyway. No extra
// library — the same Tailwind `animate-spin` the full-page spinner used.
//
// `size` covers the three places it's needed: `sm` inside buttons (replacing the
// "Сохранение…" text), `lg` as the full-page overlay (see Spinner). Carries the
// `status` role + a Russian label so a button in its loading state announces it.
type LoaderSize = 'sm' | 'md' | 'lg'

const sizeClass: Record<LoaderSize, string> = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-16 border-4',
}

const Loader = ({ size = 'md', className = '' }: { size?: LoaderSize; className?: string }) => (
  <span
    role="status"
    aria-label="Загрузка"
    className={`inline-block shrink-0 animate-spin rounded-full border-transparent border-t-current ${sizeClass[size]} ${className}`}
  />
)

export default Loader
