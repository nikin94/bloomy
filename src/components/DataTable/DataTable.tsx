import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Order } from '@/types/order'
import type { OrderColumn, OrderSort } from '@/components/DataTable/orderColumns'
import SortChevron from '@/components/icons/SortChevron'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'
import { cn } from '@/lib/cn'
import { cellValue } from './rowHelpers'
import OrderTableRow from './OrderTableRow'
import OrderCard from './OrderCard'

// One shared empty sorting array for the "no explicit sort" case, so a controlled
// table hands TanStack the SAME reference every render instead of a fresh `[]`
// (which it would read as a state change and re-sync on — see the sorting memo).
const EMPTY_SORTING: SortingState = []

// Only virtualize a genuinely long list. Below this the whole table fits a few
// hundred DOM nodes — the browser renders and scrolls it fine, and the spacer-row
// machinery would only add overhead. A single florist's order list rarely crosses
// this, so real-world usage keeps the plain render-all path; virtualization engages
// only for a pathological list (and only when the viewport is measurable — see below).
const VIRTUALIZE_THRESHOLD = 80

// The scroll container's live pixel height, tracked so virtualization can gate on a
// MEASURABLE viewport. Returns 0 when it can't measure: pre-paint, a display:none
// (hidden layout) branch, or jsdom — where clientHeight is 0 and ResizeObserver is
// absent. That 0 makes `virtualize` false, so the test environment (and any
// unmeasured mount) always takes the unchanged render-all path.
const useMeasuredHeight = (ref: RefObject<HTMLElement | null>): number => {
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return height
}

interface DataTableProps {
  orders: Order[]
  columns: OrderColumn[]
  onRowClick: (order: Order) => void
  // Order id to briefly highlight (e.g. the one just created). The matching
  // row/card plays a one-shot fade animation; see `.row-highlight` in App.css.
  highlightOrderId?: string
  // Shown when there are no rows. The caller distinguishes "no orders yet" from
  // "nothing matched the active filter".
  emptyMessage?: string
  // Controlled sort. When `onSortChange` is passed the table's sort is owned by
  // the caller (a page that also exposes it in the filter dialog for phones);
  // clicking a header calls `onSortChange`, and `sort` drives what's displayed.
  // When omitted the table keeps its own ephemeral sort (header clicks only),
  // preserving the original uncontrolled behaviour for callers that don't lift it.
  sort?: OrderSort | null
  onSortChange?: (sort: OrderSort | null) => void
}

// Cell value for the table. A formatted value may contain newlines (e.g. the
// stacked plant list); render each line on its own row so it reads as a column,
// not one long string.
const renderCell = (order: Order, column: OrderColumn): ReactNode => {
  const value = cellValue(order, column)
  if (!value.includes('\n')) return value
  return value.split('\n').map((line, i) => <div key={i}>{line}</div>)
}

// Adapt our declarative OrderColumn config to TanStack column definitions.
// OrderColumn stays the domain-level source of truth (unit-tested on its own and
// shared by both the table and the mobile card layout); TanStack owns only the
// rendering engine (row model + flexRender + sorting), so the library never
// leaks types. A column with a `sortValue` becomes sortable: that raw value is
// the accessor TanStack's default sort compares (the rendered cell stays our
// `format`); a column without one is explicitly non-sortable.
const toColumnDef = (column: OrderColumn): ColumnDef<Order> => ({
  id: column.id,
  header: column.header,
  cell: ({ row }) => renderCell(row.original, column),
  ...(column.sortValue
    ? { accessorFn: column.sortValue, enableSorting: true }
    : { enableSorting: false }),
})

// A filled triangle next to a sorted header: up for ascending, down for
// descending. Rendered only on the column currently sorted, so the chevron
// itself signals which column drives the order and in which direction.
// Map TanStack's sort state to the `aria-sort` value assistive tech expects.
const ariaSort = (direction: false | 'asc' | 'desc') =>
  direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'

// Renders the orders as a sticky-header table on wider screens (lg+) and as a
// stack of cards below that (the eight columns don't fit a tablet/phone width).
// Both layouts come from the same TanStack row model, so the data and formatting
// stay in sync.
const DataTable = ({
  orders,
  columns,
  onRowClick,
  highlightOrderId,
  emptyMessage,
  sort,
  onSortChange,
}: DataTableProps) => {
  const { t } = useTranslation()
  // The mobile card's delivery note reuses the order form's `form.totalDelivery`
  // key; one subscription here, passed down so each card doesn't open its own.
  const { t: tOrder } = useTranslation('order')
  // Memoize the column defs so the table instance keeps a stable reference
  // (TanStack recomputes its models when columns/data identity changes).
  const columnDefs = useMemo(() => columns.map(toColumnDef), [columns])

  // The full column config keyed by id — the single source of truth the table
  // header + rows read for per-column width and wrap hints, and the mobile card
  // reads for each value (customer name, total, statuses, …). Kept a plain
  // DataTable concern (not threaded through TanStack's meta) so OrderColumn stays
  // free of the library's typing.
  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns])

  // Sorting. When the caller controls it (`onSortChange` passed), the sort lives
  // on the page — shared with the filter dialog — and we adapt the domain
  // `OrderSort` to/from TanStack's `SortingState`. Otherwise it is local,
  // ephemeral state (header clicks only), as before.
  //
  // `sorting` MUST keep a STABLE reference when the sort hasn't changed. TanStack
  // treats a new `state.sorting` array as a state change and re-syncs its models,
  // and this component isn't memoised (the React Compiler bails on useReactTable),
  // so a fresh `[]`/`[{…}]` literal every render made an unrelated re-render (e.g.
  // the header-actions republish that fires on every search keystroke/close) cascade
  // into a storm of table commits — which pegged the browser on a big list. Memoise
  // the mapping so the reference only changes when the actual field/dir does; the
  // empty case reuses one module-level array (see EMPTY_SORTING).
  const controlled = onSortChange !== undefined
  const [internalSorting, setInternalSorting] = useState<SortingState>([])
  const sorting: SortingState = useMemo(
    () =>
      controlled
        ? sort
          ? [{ id: sort.field, desc: sort.dir === 'desc' }]
          : EMPTY_SORTING
        : internalSorting,
    [controlled, sort, internalSorting],
  )
  const setSorting: OnChangeFn<SortingState> = useCallback(
    (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      if (onSortChange) {
        const first = next[0]
        onSortChange(first ? { field: first.id, dir: first.desc ? 'desc' : 'asc' } : null)
      } else {
        setInternalSorting(next)
      }
    },
    [onSortChange, sorting],
  )

  // React Compiler bails out of memoizing this component because useReactTable
  // returns fresh functions each render (react-hooks/incompatible-library). That
  // is safe here — TanStack manages its own memoization internally and the orders
  // list is small — so silence the advisory rather than fight it.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: orders,
    columns: columnDefs,
    state: { sorting },
    onSortingChange: setSorting,
    // First click sorts descending for every column (overriding TanStack's
    // type-dependent default), so the first click always reveals the "top"
    // values — newest, priciest, latest — consistently across columns.
    sortDescFirst: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows

  // Virtualize the desktop table only when the list is long AND the viewport is
  // measurable (see useMeasuredHeight). The hooks below are always called (rules of
  // hooks), but the RENDER branches on `virtualize`, so a short/unmeasured list —
  // including every jsdom test — renders every row exactly as before. Row height is
  // measured (measureElement), so wrapping cells need no fixed height; `estimateSize`
  // is just the initial guess for the scrollbar before rows are measured.
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewportHeight = useMeasuredHeight(scrollRef)
  const virtualize = viewportHeight > 0 && rows.length > VIRTUALIZE_THRESHOLD
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    overscan: 10,
    enabled: virtualize,
  })
  // The rows to actually render as <tr>, plus the top/bottom spacer heights that
  // stand in for the off-screen rows so the scrollbar stays the full-list size. All
  // zero/empty on the non-virtualized path, which renders `rows` directly instead.
  const virtualItems = virtualize ? rowVirtualizer.getVirtualItems() : []
  const padTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const padBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="px-4 py-8 text-center text-text">{emptyMessage ?? t('nothingFound')}</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
      {/* Desktop: full table. */}
      <table
        data-testid="orders-table"
        className="hidden w-full border-collapse text-[0.8333rem] lg:table"
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                const label = flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <th
                    key={header.id}
                    aria-sort={header.column.getCanSort() ? ariaSort(sorted) : undefined}
                    className={cn(
                      // bg-bg/80 + backdrop-blur (not the old opaque bg-bg): over the
                      // photo backdrop a solid header read as a glaring white slab
                      // against the translucent rows. The blur keeps rows scrolling
                      // under the sticky header illegible (its masking job) while the
                      // header stays in the same tinted register as the content scrim.
                      'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg/80 backdrop-blur-sm px-4 py-3 text-left font-semibold text-heading',
                      columnById.get(header.column.id)?.width,
                    )}
                  >
                    {header.column.getCanSort() ? (
                      // A real button so the sort toggles by keyboard (Enter/Space)
                      // too. The negative margins + w-full make the WHOLE cell the
                      // hit area (not just the label), and the chevron rides a
                      // fixed-size slot that's always present, so toggling the sort
                      // never changes the column's width.
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          '-mx-4 -my-3 flex w-full items-center gap-1 px-4 py-3 text-left font-semibold text-heading transition-colors hover:text-primary',
                          FOCUS_RING_INSET,
                        )}
                      >
                        {label}
                        <span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center">
                          <SortChevron direction={sorted} />
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {virtualize ? (
            <>
              {/* Spacer rows stand in for the off-screen rows above/below the
                  rendered window, so the scrollbar spans the whole list. `colSpan`
                  keeps them from disturbing the column layout; aria-hidden keeps
                  them out of the a11y tree. The <thead> sits outside <tbody>, so
                  its `sticky top-0` is untouched by any of this. */}
              {padTop > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: padTop }} />
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const row = rows[virtualRow.index]
                return (
                  <OrderTableRow
                    key={row.id}
                    row={row}
                    highlighted={row.original.id === highlightOrderId}
                    columnById={columnById}
                    onActivate={onRowClick}
                    measureRef={rowVirtualizer.measureElement}
                    index={virtualRow.index}
                  />
                )
              })}
              {padBottom > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={columns.length} style={{ height: padBottom }} />
                </tr>
              )}
            </>
          ) : (
            rows.map((row) => (
              <OrderTableRow
                key={row.id}
                row={row}
                highlighted={row.original.id === highlightOrderId}
                columnById={columnById}
                onActivate={onRowClick}
              />
            ))
          )}
        </tbody>
      </table>

      {/* Mobile: one card per order. */}
      <div data-testid="orders-cards" className="flex flex-col gap-3 p-4 lg:hidden">
        {rows.map((row) => (
          <OrderCard
            key={row.id}
            order={row.original}
            columnById={columnById}
            highlighted={row.original.id === highlightOrderId}
            onActivate={onRowClick}
            t={tOrder}
          />
        ))}
      </div>
    </div>
  )
}

export default DataTable
