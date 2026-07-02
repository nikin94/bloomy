import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import RangeSliderImport from 'react-range-slider-input'
import Button from '../Button/Button'
import Select from '../Select/Select'
import Modal from '../Modal/Modal'
import { useSettings } from '../../context/settingsContext'
import { useSidebarCollapse } from '../../context/sidebarCollapseContext'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'
import { formatMoney, parseDateInput, toDateInputValue } from '../../utils/format'
import {
  currencyOptions,
  getTotalMinor,
  isModalFilterActive,
  paymentStatusOptions,
  shipmentStatusOptions,
} from '../../types/order'
import type { Currency, Order, OrderFilter, PaymentStatus, ShipmentStatus } from '../../types/order'

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

// Funnel icon for the filter button. The button itself fills in (primary) when a
// filter is active, so the closed dialog still signals that filtering is on.
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

// Reusable status / currency / price filter for an order list. The main orders
// list and the trash share the identical OrderFilter shape, so they share this
// control instead of duplicating the funnel button + dialog. It renders BOTH the
// funnel button (meant for the header `actions` slot) and the dialog it opens —
// keeping them in one component means a list page wires the same filter the same
// way. The button fills in (primary) whenever a dialog filter is active. The
// price range is single-currency (minor units only compare within one currency),
// so its ceiling and label follow the chosen currency, or the settings default
// when none is picked.
const OrderFilterControl = ({
  orders,
  filter,
  onChange,
}: {
  orders: Order[]
  filter: OrderFilter
  onChange: Dispatch<SetStateAction<OrderFilter>>
}) => {
  const { t } = useTranslation(['order', 'common'])
  // Order-bound t for the option helpers (typed TFunction<'order'>).
  const { t: tOrder } = useTranslation('order')
  // The price-range bounds aren't tied to one order; show them in the user's
  // default currency when no currency filter narrows the scope.
  const { defaultCurrency } = useSettings()
  // Collapsed desktop rail → the funnel shows icon-only, centred like the other
  // collapsed rows.
  const { collapsed } = useSidebarCollapse()
  const [open, setOpen] = useState(false)

  const modalFilterActive = isModalFilterActive(filter)

  const priceCurrency = filter.currency || defaultCurrency
  const priceScopeOrders = filter.currency
    ? orders.filter((o) => o.currency === filter.currency)
    : orders
  const priceCeilingMinor = priceScopeOrders.reduce((max, o) => Math.max(max, getTotalMinor(o)), 0)
  const maxThumb = filter.maxPriceMinor ?? priceCeilingMinor
  // The range slider keeps its two thumbs ordered internally, so we just store
  // the pair it reports. An upper thumb at the ceiling means "no upper bound"
  // (null), so a fresh order priced above the old max still shows.
  const setPriceRange = ([lo, hi]: [number, number]) =>
    onChange((f) => ({
      ...f,
      minPriceMinor: lo,
      maxPriceMinor: hi >= priceCeilingMinor ? null : hi,
    }))

  return (
    <>
      {/* Responsive trigger. In the cramped mobile top bar (base) it's a compact
          icon button that fills in (primary) when a filter is active — the same
          language as an active nav button. From md: up (the EXPANDED desktop rail)
          it becomes a borderless full-width "icon + label" row matching the
          sidebar's settings/nav rows; there the active state is shown as primary
          TEXT, since a full fill would read like an active nav destination beside
          them. But once the rail COLLAPSES the label is gone, and primary text on a
          soft tint reads like a plain hover — so collapsed keeps the solid
          bg-primary fill, the only unambiguous "active" cue without a label. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('filters.open')}
        title={t('filters.open')}
        aria-pressed={modalFilterActive}
        className={[
          'flex shrink-0 items-center justify-center rounded-md border p-2 transition-colors',
          'md:w-full md:justify-start md:gap-2 md:border-0 md:px-3 md:py-2 md:text-sm md:font-medium',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          modalFilterActive
            ? collapsed
              ? 'border-primary bg-primary text-white'
              : 'border-primary bg-primary text-white md:bg-transparent md:text-primary md:hover:bg-primary-bg'
            : 'border-border text-heading hover:bg-primary-bg',
        ].join(' ')}
      >
        <FilterIcon />
        {!collapsed && <span className="hidden md:inline">{t('filters.open')}</span>}
      </button>

      {open && (
        <Modal title={t('filters.title')} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4">
            <Select
              label={t('filters.paymentStatus')}
              value={filter.paymentStatus}
              onChange={(e) =>
                onChange((f) => ({ ...f, paymentStatus: e.target.value as PaymentStatus | '' }))
              }
            >
              <option value="">{t('filters.all')}</option>
              {paymentStatusOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            <Select
              label={t('filters.shipmentStatus')}
              value={filter.shipmentStatus}
              onChange={(e) =>
                onChange((f) => ({ ...f, shipmentStatus: e.target.value as ShipmentStatus | '' }))
              }
            >
              <option value="">{t('filters.all')}</option>
              {shipmentStatusOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            {/* Currency filter — each order keeps its own currency, so this
                narrows the list to orders priced in the chosen one. */}
            <Select
              label={t('filters.currency')}
              value={filter.currency}
              onChange={(e) =>
                // Reset the price bounds: they were set on the previous
                // currency's minor-unit scale, so they don't carry over.
                onChange((f) => ({
                  ...f,
                  currency: e.target.value as Currency | '',
                  minPriceMinor: 0,
                  maxPriceMinor: null,
                }))
              }
            >
              <option value="">{t('filters.all')}</option>
              {currencyOptions(tOrder).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>

            {/* Creation-date range: two native date fields (from / to). `max`/`min`
                cross-link them so the range can't be inverted; an empty side leaves
                that bound open. Native date inputs are the expected mobile control
                and need no extra library — matching the statistics tab's custom
                period. The `to` day is included in full (parseDateInput 'end'). */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-heading">{t('filters.dateRange')}</span>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm text-text">
                  {t('filters.dateFrom')}
                  <input
                    type="date"
                    aria-label={t('filters.dateFrom')}
                    value={filter.minDate !== null ? toDateInputValue(filter.minDate) : ''}
                    max={filter.maxDate !== null ? toDateInputValue(filter.maxDate) : undefined}
                    onChange={(e) =>
                      onChange((f) => ({ ...f, minDate: parseDateInput(e.target.value, 'start') }))
                    }
                    className={`${FIELD_BASE} ${FIELD_NORMAL} px-3 py-2 text-heading`}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-text">
                  {t('filters.dateTo')}
                  <input
                    type="date"
                    aria-label={t('filters.dateTo')}
                    value={filter.maxDate !== null ? toDateInputValue(filter.maxDate) : ''}
                    min={filter.minDate !== null ? toDateInputValue(filter.minDate) : undefined}
                    onChange={(e) =>
                      onChange((f) => ({ ...f, maxDate: parseDateInput(e.target.value, 'end') }))
                    }
                    className={`${FIELD_BASE} ${FIELD_NORMAL} px-3 py-2 text-heading`}
                  />
                </label>
              </div>
            </div>

            {/* Price range: one track with two thumbs (from / to) over the
                0…ceiling scale. Hidden when every order costs the same (or there
                are none) — there is no range to pick. */}
            {priceCeilingMinor > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-heading">{t('filters.priceRange')}</span>
                  <span className="text-sm text-text">
                    {formatMoney(filter.minPriceMinor, priceCurrency)} –{' '}
                    {formatMoney(maxThumb, priceCurrency)}
                  </span>
                </div>
                <RangeSlider
                  min={0}
                  max={priceCeilingMinor}
                  step={PRICE_STEP_MINOR}
                  value={[filter.minPriceMinor, maxThumb]}
                  onInput={setPriceRange}
                  ariaLabel={[t('filters.minPrice'), t('filters.maxPrice')]}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  onChange((f) => ({
                    ...f,
                    paymentStatus: '',
                    shipmentStatus: '',
                    currency: '',
                    minPriceMinor: 0,
                    maxPriceMinor: null,
                    minDate: null,
                    maxDate: null,
                  }))
                }
                disabled={!modalFilterActive}
              >
                {t('filters.reset')}
              </Button>
              <Button variant="primary" onClick={() => setOpen(false)}>
                {t('filters.done')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

export default OrderFilterControl
