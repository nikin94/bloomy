import Loader from '../Loader/Loader'

// Full-screen loading indicator. Rendered as a fixed overlay centred on the
// viewport, so it sits ABOVE the page without taking layout space — toggling it
// never reflows the content underneath, which avoids the layout jump you get
// from an inline "Loading…" text node appearing and disappearing.
//
// `pointer-events-none` so the overlay never swallows clicks: the ring is centred
// and the rest is transparent, so controls it visually clears — e.g. the
// "← Back to orders" link at the top — stay clickable while data loads.
//
// The ring itself is the shared Loader at its largest size, tinted with the brand
// colour (`text-primary` → the loader draws from currentColor).
function Spinner() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <Loader size="lg" className="text-primary" />
    </div>
  )
}

export default Spinner
