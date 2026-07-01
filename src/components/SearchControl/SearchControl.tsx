import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'
import Button from '../Button/Button'
import CloseIcon from '../icons/CloseIcon'

const SearchIcon = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-5"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// Width/opacity transition duration for the search field, kept in sync with the
// `duration-200` utilities below so the loupe is revealed exactly when the
// collapse animation ends.
const SEARCH_TRANSITION_MS = 200

// A shared expanding search control, used on every list screen (orders,
// customers, trash). Collapsed to just a loupe icon by default; clicking it
// expands an input that slides out (width transition) and takes focus, replacing
// the loupe with a persistent X that both clears the query and collapses the
// field (also via Escape). While collapsed the input is removed from the tab
// order and the accessibility tree, so only the loupe button is reachable.
//
// `label` is the input's accessible name (e.g. "Поиск заказов" / "Поиск
// клиентов") so each list announces what it searches; the matching predicate
// stays the caller's concern.
const SearchControl = ({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) => {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(value.trim() !== '')
  // The loupe shows only once the field is FULLY collapsed (not mid-animation),
  // so it appears calmly in its resting spot instead of riding the width
  // animation as the right cluster reflows leftward.
  const [loupeVisible, setLoupeVisible] = useState(value.trim() === '')
  const inputRef = useRef<HTMLInputElement>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const expand = () => {
    clearTimeout(collapseTimer.current)
    setLoupeVisible(false)
    setExpanded(true)
    // Focus after the state flush so the (now interactive) input takes the caret.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Clear the field and collapse back to the loupe. Used by the X button and
  // Escape. The loupe is revealed only after the collapse animation finishes
  // (SEARCH_TRANSITION_MS), so it doesn't appear to fly into place.
  const close = () => {
    onChange('')
    setExpanded(false)
    collapseTimer.current = setTimeout(() => setLoupeVisible(true), SEARCH_TRANSITION_MS)
  }

  // Clear any pending reveal on unmount.
  useEffect(() => () => clearTimeout(collapseTimer.current), [])

  return (
    <div className="flex items-center">
      {/* Collapsed: just the loupe. Hidden the instant the field opens and not
          shown again until the collapse animation has finished, so it never
          appears mid-reflow. The input (with the X inside it) is the only thing
          beside it while open. */}
      {loupeVisible && (
        <Button
          variant="secondary"
          size="icon"
          onClick={expand}
          aria-label={t('search')}
          title={t('search')}
          aria-expanded={false}
          className="shrink-0"
        >
          <SearchIcon />
        </Button>
      )}
      {/* The input wrapper carries the width transition; the X is absolutely
          positioned at its right edge, inside the field. */}
      <div
        className={`relative transition-[width] duration-200 ${
          expanded ? 'w-40 sm:w-56' : 'w-0'
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
          placeholder={t('search')}
          aria-label={label}
          // `inert` (not aria-hidden) when collapsed: it removes the field from
          // the a11y tree AND moves focus out, so closing via the X never leaves
          // focus trapped on a hidden input (the aria-hidden focus warning).
          inert={!expanded}
          // `leading-5` pins the line-box to 1.25rem so the field's height
          // matches the icon buttons (size-5 icon + p-2); without it the input's
          // default 145% line-height makes it a couple of pixels taller and
          // stretches the header when it opens.
          className={`${FIELD_BASE} ${FIELD_NORMAL} w-full leading-5 transition-[padding,opacity] duration-200 ${
            expanded ? 'py-2 pl-3 pr-9 opacity-100' : 'border-0 p-0 opacity-0'
          }`}
        />
        {/* Inside the field at its right end: clears the query AND collapses.
            The px/py padding enlarges the tap target beyond the icon (hitslop)
            without the icon overflowing the input. onMouseDown keeps focus from
            leaving before the click registers. */}
        {expanded && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={close}
            aria-label={t('searchClear')}
            title={t('close')}
            className="absolute inset-y-0 right-0 flex items-center px-1.5 text-text transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  )
}

export default SearchControl
