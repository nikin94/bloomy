import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import Button from '../../components/Button/Button'
import Modal from '../../components/Modal/Modal'
import RangeSliderImport from 'react-range-slider-input'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'
import { fetchOrders } from '../../firebase/orders'
import { fetchCustomers } from '../../firebase/customers'
import { useAuth } from '../../context/authContext'
import { formatMoney } from '../../utils/format'
import {
  buildOrderColumns,
  filterOrders,
  getTotalMinor,
  isOrderFilterActive,
  isModalFilterActive,
  EMPTY_ORDER_FILTER,
  PAYMENT_STATUS_OPTIONS,
  SHIPMENT_STATUS_OPTIONS,
} from '../../types/order'
import type { Order, OrderFilter, PaymentStatus, ShipmentStatus } from '../../types/order'
import type { Customer } from '../../types/customer'

// react-range-slider-input ships CommonJS (`exports.default = Component`).
// Depending on the bundler's interop the default import can arrive wrapped one
// level deep as `{ default: Component }`; unwrap so we render the component, not
// the namespace object (otherwise React throws "Element type is invalid").
const RangeSlider =
  (RangeSliderImport as unknown as { default?: typeof RangeSliderImport }).default ??
  RangeSliderImport

// Slider step for the price filter: 1 ₽ (100 kopecks). Fine enough to land on a
// specific amount, coarse enough that dragging feels smooth.
const PRICE_STEP_MINOR = 100

// Funnel icon for the filter button. A small dot is overlaid by the caller when
// a status filter is active, so the closed dialog still signals it's filtering.
const FilterIcon = () => (
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
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
)

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

// Collapsed to just a loupe icon by default; clicking it expands an input that
// slides out (width transition) and takes focus. It collapses again when blurred
// while empty. While collapsed the input is removed from the tab order and the
// accessibility tree, so only the loupe button is reachable.
const SearchControl = ({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) => {
  const [expanded, setExpanded] = useState(value.trim() !== '')
  const inputRef = useRef<HTMLInputElement>(null)

  const expand = () => {
    setExpanded(true)
    // Focus after the state flush so the (now interactive) input takes the caret.
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="flex items-center">
      <Button
        variant="secondary"
        size="icon"
        onClick={expanded ? () => inputRef.current?.focus() : expand}
        aria-label="Поиск"
        title="Поиск"
        aria-expanded={expanded}
        className="shrink-0"
      >
        <SearchIcon />
      </Button>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (value.trim() === '') setExpanded(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onChange('')
            setExpanded(false)
          }
        }}
        placeholder="Поиск"
        aria-label="Поиск заказов"
        aria-hidden={!expanded}
        tabIndex={expanded ? 0 : -1}
        className={`${FIELD_BASE} ${FIELD_NORMAL} ml-1 transition-[width,padding,opacity] duration-200 ${
          expanded ? 'w-40 px-3 py-2 opacity-100 sm:w-56' : 'w-0 border-0 p-0 opacity-0'
        }`}
      />
    </div>
  )
}

const OrdersPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  // Guaranteed non-null here (rendered under ProtectedRoute), but typed as
  // optional, so we read the uid defensively and gate the fetch on it.
  const { user } = useAuth()
  const ownerId = user?.uid
  const [orders, setOrders] = useState<Order[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<OrderFilter>(EMPTY_ORDER_FILTER)
  // The status filters live in a dialog opened from the filter icon; the search
  // box stays inline as the most-frequent action.
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Set by NewOrderPage after a successful create, to highlight the new order.
  // Read once into state, then strip it from history so a refresh or back-nav
  // doesn't replay the highlight.
  const highlightState = (location.state as { highlightId?: string } | null) ?? null
  // Captured once on mount so it survives the history cleanup below (which sets
  // location.state to null); the row keeps highlighting through its animation.
  const [highlightOrderId] = useState(highlightState?.highlightId)
  useEffect(() => {
    if (highlightState?.highlightId) {
      navigate('.', { replace: true, state: null })
    }
    // Only on first mount: consume the navigation state exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ownerId) return
    let active = true
    // Two queries (orders + customers) instead of N+1: customers are loaded
    // once and the table resolves each order's name from this list in memory.
    // `includeDeleted` so an order whose customer was soft-deleted still shows
    // the name in the list, not "—".
    Promise.all([fetchOrders(ownerId), fetchCustomers(ownerId, { includeDeleted: true })])
      .then(([orderData, customerData]) => {
        if (!active) return
        setOrders(orderData)
        setCustomers(customerData)
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось загрузить заказы')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [ownerId])

  const customerNameById = new Map(customers.map((c) => [c.id, c.name]))
  const getCustomerName = (id: string) => customerNameById.get(id) ?? '—'
  const columns = buildOrderColumns(getCustomerName)

  // Filtering is in memory: the whole list is already loaded, the dataset is
  // small, and it keeps search instant with no extra reads.
  const visibleOrders = filterOrders(orders, filter, getCustomerName)
  const filterActive = isOrderFilterActive(filter)
  const modalFilterActive = isModalFilterActive(filter)

  // Price slider bounds: 0 to the highest order total in the list. The max thumb
  // sits at the ceiling when there is no upper bound (maxPriceMinor === null).
  const priceCeilingMinor = orders.reduce((max, o) => Math.max(max, getTotalMinor(o)), 0)
  const maxThumb = filter.maxPriceMinor ?? priceCeilingMinor
  // The range slider keeps its two thumbs ordered internally, so we just store
  // the pair it reports. An upper thumb at the ceiling means "no upper bound"
  // (null), so a fresh order priced above the old max still shows.
  const setPriceRange = ([lo, hi]: [number, number]) =>
    setFilter((f) => ({
      ...f,
      minPriceMinor: lo,
      maxPriceMinor: hi >= priceCeilingMinor ? null : hi,
    }))

  // Search + filter controls live in the header (next to settings). Search is an
  // expanding loupe; the filter icon opens the dialog and carries an active dot.
  const headerActions = (
    <>
      <SearchControl
        value={filter.query}
        onChange={(query) => setFilter((f) => ({ ...f, query }))}
      />
      <Button
        variant="secondary"
        size="icon"
        onClick={() => setFiltersOpen(true)}
        aria-label="Фильтры"
        title="Фильтры"
        className="relative shrink-0"
      >
        <FilterIcon />
        {/* Active dot: the dialog filters are hidden, so the closed button still
            signals that filtering is on. */}
        {modalFilterActive && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 size-2 rounded-full border border-bg bg-primary"
          />
        )}
      </Button>
    </>
  )

  return (
    <div className="flex h-full flex-col">
      <AppHeader actions={headerActions} />

      {loading && <Spinner />}
      {error && <p className="px-6 py-8 text-danger">{error}</p>}

      {!loading && !error && (
        <DataTable
          orders={visibleOrders}
          columns={columns}
          onRowClick={(order) => navigate(`/orders/${order.id}`)}
          highlightOrderId={highlightOrderId}
          emptyMessage={filterActive ? 'Ничего не найдено' : 'Заказов пока нет'}
        />
      )}

      {filtersOpen && (
        <Modal title="Фильтры" onClose={() => setFiltersOpen(false)}>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-heading">Статус оплаты</span>
              <Select
                aria-label="Фильтр по статусу оплаты"
                value={filter.paymentStatus}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, paymentStatus: e.target.value as PaymentStatus | '' }))
                }
              >
                <option value="">Все</option>
                {PAYMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-heading">Статус отправки</span>
              <Select
                aria-label="Фильтр по статусу отправки"
                value={filter.shipmentStatus}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, shipmentStatus: e.target.value as ShipmentStatus | '' }))
                }
              >
                <option value="">Все</option>
                {SHIPMENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>

            {/* Price range: one track with two thumbs (from / to) over the
                0…ceiling scale. Hidden when every order costs the same (or there
                are none) — there is no range to pick. */}
            {priceCeilingMinor > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-heading">Сумма заказа</span>
                  <span className="text-sm text-text">
                    {formatMoney(filter.minPriceMinor)} – {formatMoney(maxThumb)}
                  </span>
                </div>
                <RangeSlider
                  min={0}
                  max={priceCeilingMinor}
                  step={PRICE_STEP_MINOR}
                  value={[filter.minPriceMinor, maxThumb]}
                  onInput={setPriceRange}
                  ariaLabel={['Минимальная сумма', 'Максимальная сумма']}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  setFilter((f) => ({
                    ...f,
                    paymentStatus: '',
                    shipmentStatus: '',
                    minPriceMinor: 0,
                    maxPriceMinor: null,
                  }))
                }
                disabled={!modalFilterActive}
              >
                Сбросить
              </Button>
              <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                Готово
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default OrdersPage
