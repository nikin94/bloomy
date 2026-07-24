import { cn } from '@/lib/cn'

// The mobile menu toggle glyph — three lines when the drawer is closed, an X
// while it's open, so the same button reads as "open"/"close". Decorative
// (`aria-hidden`): the button carries the accessible name (open/close menu).
//
// The three→X transition is ANIMATED, not a swap: the same three <line>s stay
// mounted and CSS-transition between states, so pressing the button morphs the
// bars (and reverses on close) instead of hard-cutting. The top and bottom bars
// slide to the middle (translateY ±6 user units — a quarter of the 24 viewBox)
// and rotate ±45° to cross; the middle bar fades out. `transform-box: fill-box`
// + `origin-center` pins each bar's rotation to its OWN midpoint (a <line>'s
// geometry bbox), so they rotate in place rather than around the SVG origin.
const BurgerIcon = ({ open }: { open: boolean }) => (
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
    <line
      x1="3"
      y1="6"
      x2="21"
      y2="6"
      className={cn(
        'origin-center transition-transform duration-200 ease-out [transform-box:fill-box]',
        open && 'translate-y-[6px] rotate-45',
      )}
    />
    <line
      x1="3"
      y1="12"
      x2="21"
      y2="12"
      className={cn('transition-opacity duration-200 ease-out', open && 'opacity-0')}
    />
    <line
      x1="3"
      y1="18"
      x2="21"
      y2="18"
      className={cn(
        'origin-center transition-transform duration-200 ease-out [transform-box:fill-box]',
        open && '-translate-y-[6px] -rotate-45',
      )}
    />
  </svg>
)

export default BurgerIcon
