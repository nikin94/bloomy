import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef, OnChangeFn, SortingState } from '@tanstack/react-table'
import type { Order } from '@/types/order'
import type { OrderColumn, OrderSort } from '@/components/DataTable/orderColumns'
import SortChevron from '@/components/icons/SortChevron'
import { FOCUS_RING_INSET } from '@/styles/fieldStyles'
import { cellValue } from './rowHelpers'
import OrderTableRow from './OrderTableRow'
import OrderCard from './OrderCard'

// One shared empty sorting array for the "no explicit sort" case, so a controlled
// table hands TanStack the SAME reference every render instead of a fresh `[]`
// (which it would read as a state change and re-sync on — see the sorting memo).
const EMPTY_SORTING: SortingState = []

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

  if (rows.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <p className="px-4 py-8 text-center text-text">{emptyMessage ?? t('nothingFound')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
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
                    className={`sticky top-0 z-10 whitespace-nowrap border-b border-border bg-bg px-4 py-3 text-left font-semibold text-heading${
                      columnById.get(header.column.id)?.width
                        ? ` ${columnById.get(header.column.id)?.width}`
                        : ''
                    }`}
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
                        className={`-mx-4 -my-3 flex w-full items-center gap-1 px-4 py-3 text-left font-semibold text-heading transition-colors hover:text-primary ${FOCUS_RING_INSET}`}
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
          {rows.map((row) => (
            <OrderTableRow
              key={row.id}
              row={row}
              highlighted={row.original.id === highlightOrderId}
              columnById={columnById}
              onActivate={onRowClick}
            />
          ))}
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
          />
        ))}
      </div>
    </div>
  )
}

export default DataTable
