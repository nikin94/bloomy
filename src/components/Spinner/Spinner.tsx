// Full-screen loading indicator. Rendered as a fixed overlay centred on the
// viewport, so it sits ABOVE the page without taking layout space — toggling it
// never reflows the content underneath, which avoids the layout jump you get
// from an inline "Загрузка…" text node appearing and disappearing.
//
// The ring is built from Tailwind's built-in `animate-spin` utility (no extra
// library): a thick circle whose track uses the translucent primary colour and
// whose top edge uses the solid primary, producing the classic spinner arc.
function Spinner() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="status"
      aria-label="Загрузка"
    >
      <span className="h-16 w-16 animate-spin rounded-full border-4 border-primary-bg border-t-primary" />
    </div>
  )
}

export default Spinner
