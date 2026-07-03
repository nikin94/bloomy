import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Input from '@/components/Input/Input'

// How many suggestions to show at once — keeps the popup compact; the rest stay
// reachable by typing more of the name. When the pool has more, a non-interactive
// footer tells the user to keep typing (see the "+N more" line).
const MAX_VISIBLE = 8

interface AutocompleteProps {
  // Floating label, forwarded to the underlying Input (also its accessible name).
  label: string
  value: string
  // Called with the new text on every keystroke AND when a suggestion is picked.
  onChange: (value: string) => void
  // The full suggestion pool; filtered against the current value as the user
  // types. A suggestion is only a hint — any free text is still allowed.
  suggestions: string[]
  autoFocus?: boolean
  // Width/layout class for the field (e.g. `min-w-0 flex-1`).
  className?: string
}

// A text input with a styled suggestion dropdown (an ARIA combobox). Replaces a
// native <datalist>, whose popup the browser draws and CSS cannot style — its
// surface, width, position, the input's dropdown arrow and the pointer are all
// browser chrome. This owns its popup, so it matches the app's themed surfaces
// (lifted `tooltip-bg` so it stands off the page in dark mode), is exactly the
// input's width, and is keyboard- and touch-operable. The list only HINTS: the
// field accepts any text, so a brand-new plant name is never blocked.
const Autocomplete = ({
  label,
  value,
  onChange,
  suggestions,
  autoFocus,
  className = '',
}: AutocompleteProps) => {
  const { t } = useTranslation()
  const listboxId = useId()
  const optionId = (i: number) => `${listboxId}-opt-${i}`
  // Whether the popup is open (the field is focused), and which option is
  // keyboard-active (-1 = none; the active row is highlighted and chosen on Enter).
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  // The active option's node, so keyboard navigation can scroll it into view when
  // it moves past the popup's scroll window.
  const activeRef = useRef<HTMLLIElement>(null)

  // Case-insensitive "contains" filter; an empty field offers the whole pool.
  // Drop an exact match — there's nothing to suggest once the field already
  // equals a known name.
  const q = value.trim().toLowerCase()
  const allMatches = suggestions.filter((s) => {
    const sl = s.toLowerCase()
    return sl !== q && (q === '' || sl.includes(q))
  })
  // Cap the visible rows so the popup never grows unbounded; the overflow count
  // drives the "keep typing — N more" footer.
  const matches = allMatches.slice(0, MAX_VISIBLE)
  const hiddenCount = allMatches.length - matches.length

  const isOpen = open && matches.length > 0
  // Active index guarded against a shrinking list: the pool can change (orders
  // load async) after a keyboard/hover set `active`, leaving it past the end. A
  // clamped read keeps aria-activedescendant and Enter pointing at a real row.
  const activeInRange = active >= 0 && active < matches.length

  // Keep the highlighted row visible when arrow-keying past the scroll window.
  // scrollIntoView is a no-op in jsdom (guarded with `?.`), so tests don't break.
  useEffect(() => {
    if (activeInRange) activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [active, activeInRange])

  const choose = (name: string) => {
    onChange(name)
    setOpen(false)
    setActive(-1)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Closed (e.g. just after Escape) → reopen and highlight the first row in
      // the same press, so ArrowDown always advances the selection.
      if (!open) {
        setOpen(true)
        setActive(0)
      } else {
        setActive((a) => Math.min(a + 1, matches.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && isOpen && activeInRange) {
      // Pick the highlighted suggestion; don't submit the form on this Enter.
      e.preventDefault()
      choose(matches[active])
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setActive(-1)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <Input
        label={label}
        value={value}
        autoFocus={autoFocus}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeInRange ? optionId(active) : undefined}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        // Closing on blur is safe: an option is chosen on mousedown (which
        // preventDefaults, so the input never blurs first).
        onBlur={() => {
          setOpen(false)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
      />

      {isOpen && (
        // Full input width (left-0 right-0); pt-2 sets the gap below the field and
        // leaves room for the centered pointer that ties the popup to the input.
        <div className="absolute left-0 right-0 top-full z-20 pt-2">
          <div className="relative rounded-lg border border-border bg-tooltip-bg shadow-lg">
            {/* Centered pointer: a small square rotated 45° with only its top/left
                edges bordered reads as an up-caret; same fill as the popup. */}
            <span
              aria-hidden="true"
              className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-l border-t border-border bg-tooltip-bg"
            />
            <ul
              id={listboxId}
              role="listbox"
              className="relative m-0 max-h-56 list-none overflow-auto p-1"
            >
              {matches.map((name, i) => (
                <li
                  key={name}
                  ref={i === active ? activeRef : undefined}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  // mousedown (not click) so the input doesn't blur-and-close
                  // before the pick registers; preventDefault keeps focus.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(name)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer truncate rounded px-3 py-2 text-sm ${
                    i === active ? 'bg-primary text-white' : 'text-heading'
                  }`}
                >
                  {name}
                </li>
              ))}
            </ul>
            {/* Non-interactive overflow hint: some matches are hidden past the cap,
                so tell the user typing more narrows them. Outside the listbox so
                assistive tech doesn't read it as a selectable option. */}
            {hiddenCount > 0 && (
              <p className="m-0 border-t border-border px-3 py-1.5 text-xs text-text">
                {t('moreSuggestions', { count: hiddenCount })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Autocomplete
