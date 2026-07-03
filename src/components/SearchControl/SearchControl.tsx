import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'
import { useSidebarCollapse } from '../../context/sidebarCollapseContext'
import CloseIcon from '../icons/CloseIcon'
import SearchIcon from '../icons/SearchIcon'

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
// `label` is the input's accessible name (e.g. "Search orders" / "Search
// customers") so each list announces what it searches; the matching predicate
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
  // When hosted in a COLLAPSED desktop rail the loupe shows icon-only; activating
  // it first re-opens the rail (`expandRail`) so the field has room to slide out,
  // and closing it restores the rail to how it was (`collapseRail`).
  const { collapsed, expand: expandRail, collapse: collapseRail } = useSidebarCollapse()
  const [expanded, setExpanded] = useState(value.trim() !== '')
  // The loupe shows only once the field is FULLY collapsed (not mid-animation),
  // so it appears calmly in its resting spot instead of riding the width
  // animation as the right cluster reflows leftward.
  const [loupeVisible, setLoupeVisible] = useState(value.trim() === '')
  const inputRef = useRef<HTMLInputElement>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Whether the rail was collapsed when the field was opened. If so, closing the
  // field re-collapses the rail so the user gets their compact layout back
  // instead of being left with a fully expanded rail after a one-off search. A
  // ref (not state) so capturing it doesn't re-render.
  const wasCollapsedBeforeSearch = useRef(false)

  const expand = () => {
    // In a collapsed rail there's no room for the field — widen the rail first,
    // remembering it was collapsed so close() can restore that.
    wasCollapsedBeforeSearch.current = collapsed
    if (collapsed) expandRail()
    clearTimeout(collapseTimer.current)
    setLoupeVisible(false)
    setExpanded(true)
    // Focus after the state flush so the (now interactive) input takes the caret.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Clear the field and collapse back to the loupe. Used by the X button and
  // Escape. The loupe is revealed only after the collapse animation finishes
  // (SEARCH_TRANSITION_MS), so it doesn't appear to fly into place. If opening
  // the field had widened a collapsed rail, put the rail back so the field close
  // returns the layout to its previous (collapsed) state.
  const close = () => {
    onChange('')
    setExpanded(false)
    if (wasCollapsedBeforeSearch.current) collapseRail()
    wasCollapsedBeforeSearch.current = false
    collapseTimer.current = setTimeout(() => setLoupeVisible(true), SEARCH_TRANSITION_MS)
  }

  // Clear any pending reveal on unmount.
  useEffect(() => () => clearTimeout(collapseTimer.current), [])

  return (
    // `min-w-0` lets the whole control shrink below its content width when its
    // container is tight. On the mobile top bar (a flex row, below md) the control
    // GROWS to fill the free width (`flex-1`) so the expanded field takes the room
    // between the page title and the burger; on the desktop rail (`md:`, a flex
    // column) it reverts to `flex-none` so it keeps its natural height. `js-search-open`
    // is a marker the mobile bar keys off (via :has) to give the control the row and
    // hide the title while the field is open.
    <div className={`flex min-w-0 flex-1 items-center md:flex-none ${expanded ? 'js-search-open' : ''}`}>
      {/* Collapsed: just the loupe. Hidden the instant the field opens and not
          shown again until the collapse animation has finished, so it never
          appears mid-reflow. The input (with the X inside it) is the only thing
          beside it while open. */}
      {loupeVisible && (
        // Responsive trigger: a bordered icon button in the cramped mobile top
        // bar (base), and a borderless full-width "icon + label" row from md: up
        // (the desktop rail), matching the sidebar's settings/nav rows so the
        // search control reads as part of the same button list.
        <button
          type="button"
          onClick={expand}
          aria-label={t('search')}
          title={t('search')}
          aria-expanded={false}
          className={
            'flex shrink-0 items-center justify-center rounded-md border border-border p-2 text-heading transition-colors hover:bg-primary-bg ' +
            // In the rail the loupe is ALWAYS icon-left at `md:px-2.5` (matching the
            // nav rows, so the icon's centre sits at 32px in the collapsed strip and
            // never slides). Collapsing doesn't switch the layout — the label just
            // fades and `md:overflow-hidden` lets the narrowing rail swallow it.
            'md:w-full md:justify-start md:gap-2 md:overflow-hidden md:border-0 md:px-2.5 md:py-2 md:text-sm md:font-medium ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
          }
        >
          <SearchIcon />
          {/* Always mounted so it can fade with the rail (not unmount instantly);
              `hidden md:inline` keeps it out of the mobile icon button entirely. */}
          <span
            className={`hidden whitespace-nowrap transition-opacity duration-300 ease-out motion-reduce:transition-none md:inline ${
              collapsed ? 'md:opacity-0' : 'md:opacity-100'
            }`}
          >
            {t('search')}
          </span>
        </button>
      )}
      {/* The input wrapper carries the width transition; the X is absolutely
          positioned at its right edge, inside the field. */}
      <div
        // Expanded: fill the available width (`w-full`) rather than a fixed size, so
        // the field stretches into whatever room the growing control has — capped at
        // `max-w-md` on the mobile bar so it never gets absurdly wide on a large
        // phone/tablet, and uncapped on the desktop rail (`md:max-w-none md:w-full`)
        // where it fills the rail exactly.
        className={`relative transition-[width] duration-200 ${
          expanded ? 'w-full max-w-md md:w-full md:max-w-none' : 'w-0'
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
          className={`${FIELD_BASE} ${FIELD_NORMAL} w-full min-w-0 leading-5 transition-[padding,opacity] duration-200 ${
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
