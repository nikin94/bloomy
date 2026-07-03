// The sortable-column header direction glyph: a filled up-triangle when the
// column sorts ascending, a down-triangle when descending, and nothing when the
// column isn't the active sort. `direction` mirrors TanStack's sort state
// (`false | 'asc' | 'desc'`). Decorative (`aria-hidden`): the header's
// `aria-sort` conveys the direction to assistive tech.
const SortChevron = ({ direction }: { direction: false | 'asc' | 'desc' }) => {
  if (!direction) return null
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3 shrink-0" fill="currentColor">
      {direction === 'asc' ? <path d="M6 3 1 9h10z" /> : <path d="M6 9 1 3h10z" />}
    </svg>
  )
}

export default SortChevron
