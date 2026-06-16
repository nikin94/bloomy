import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppHeader from '../../components/AppHeader/AppHeader'
import DataTable from '../../components/DataTable/DataTable'
import Spinner from '../../components/Spinner/Spinner'
import Select from '../../components/Select/Select'
import Input from '../../components/Input/Input'
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

const CloseIcon = () => (
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
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

// Width/opacity transition duration for the search field, kept in sync with the
// `duration-200` utilities below so the loupe is revealed exactly when the
// collapse animation ends.
const SEARCH_TRANSITION_MS = 200

// Collapsed to just a loupe icon by default; clicking it expands an input that
// slides out (width transition) and takes focus, replacing the loupe with a
// persistent X that both clears the query and collapses the field (also via
// Escape). While collapsed the input is removed from the tab order and the
// accessibility tree, so only the loupe button is reachable.
const SearchControl = ({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) => {
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
          aria-label="Поиск"
          title="Поиск"
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
          placeholder="Поиск"
          aria-label="Поиск заказов"
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
            aria-label="Очистить и закрыть поиск"
            title="Закрыть"
            className="absolute inset-y-0 right-0 flex items-center px-1.5 text-text transition-colors hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          >
            <CloseIcon />
          </button>
        )}
      </div>
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
  // expanding loupe; the filter icon opens the dialog and fills in when active.
  const headerActions = (
    <>
      <SearchControl
        value={filter.query}
        onChange={(query) => setFilter((f) => ({ ...f, query }))}
      />
      {/* When a dialog filter is active the whole button fills in (primary), the
          same language as an active nav button — far more legible than a small
          badge that filtering is on while the filters themselves are hidden. */}
      <Button
        variant={modalFilterActive ? 'primary' : 'secondary'}
        size="icon"
        onClick={() => setFiltersOpen(true)}
        aria-label="Фильтры"
        title="Фильтры"
        aria-pressed={modalFilterActive}
        className="shrink-0"
      >
        <FilterIcon />
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

            {/* Delivery-date range. Each bound is optional, so the user can
                filter "from", "until", or a closed window. */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-heading">Дата доставки</span>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text">С</span>
                  <Input
                    type="date"
                    aria-label="Дата доставки с"
                    max={filter.deliveryTo || undefined}
                    value={filter.deliveryFrom}
                    onChange={(e) =>
                      setFilter((f) => ({ ...f, deliveryFrom: e.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text">По</span>
                  <Input
                    type="date"
                    aria-label="Дата доставки по"
                    min={filter.deliveryFrom || undefined}
                    value={filter.deliveryTo}
                    onChange={(e) => setFilter((f) => ({ ...f, deliveryTo: e.target.value }))}
                  />
                </label>
              </div>
            </div>

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
                    deliveryFrom: '',
                    deliveryTo: '',
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
