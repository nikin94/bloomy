import type { TFunction } from 'i18next'
import Select from '../Select/Select'
import Input from '../Input/Input'
import type { Customer } from '../../types/customer'

// Pick an existing customer from the address book, or enter a new one.
export type CustomerMode = 'existing' | 'new'

// The order form's customer section: a segmented slider toggling between an
// existing-customer picker and new-customer fields. Presentational — every bit
// of state (the mode, selection, new-customer fields, whether the slider should
// animate) lives in OrderForm and is passed in, so this stays a pure render of
// that state plus change callbacks. Extracted from OrderForm to keep the form's
// body readable; the customer-resolution logic stays in the parent.
const CustomerPicker = ({
  mode,
  customers,
  selectedCustomerId,
  newName,
  newPhone,
  animate,
  t,
  onSelectMode,
  onSelectCustomer,
  onChangeNewName,
  onChangeNewPhone,
}: {
  mode: CustomerMode
  customers: Customer[]
  selectedCustomerId: string
  newName: string
  newPhone: string
  // The slider pill only animates after the user interacts — the initial
  // fetch-driven switch to "existing" must not slide.
  animate: boolean
  t: TFunction<['order', 'common']>
  onSelectMode: (mode: CustomerMode) => void
  onSelectCustomer: (id: string) => void
  onChangeNewName: (value: string) => void
  onChangeNewPhone: (value: string) => void
}) => (
  <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
    <legend className="mb-1 p-0 text-sm text-text">{t('form.customer')}</legend>

    {/* Segmented slider toggle. Native radios stay as the source of truth
        (keyboard + form semantics) but are visually hidden; the sliding pill is
        positioned from `mode`. */}
    <div
      role="radiogroup"
      aria-label={t('form.customerType')}
      className="relative grid w-full max-w-xs grid-cols-2 rounded-full border border-border bg-primary-bg p-1 text-sm font-medium"
    >
      {/* Sliding pill behind the active segment. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-primary shadow-sm ${
          animate ? 'transition-transform duration-200 ease-out' : ''
        } ${mode === 'new' ? 'translate-x-full' : 'translate-x-0'}`}
      />
      <label
        className={`relative z-10 flex min-w-0 cursor-pointer items-center justify-center rounded-full px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
          mode === 'existing' ? 'text-white' : 'text-text hover:text-heading'
        } ${customers.length === 0 ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        <input
          type="radio"
          name="customerMode"
          className="sr-only"
          checked={mode === 'existing'}
          onChange={() => onSelectMode('existing')}
          disabled={customers.length === 0}
        />
        {/* truncate (with min-w-0 on the label) keeps a long label like
            "Существующий" inside its segment instead of overflowing. */}
        <span className="min-w-0 truncate">{t('form.existing')}</span>
      </label>
      <label
        className={`relative z-10 flex min-w-0 cursor-pointer items-center justify-center rounded-full px-2 py-1.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
          mode === 'new' ? 'text-white' : 'text-text hover:text-heading'
        }`}
      >
        <input
          type="radio"
          name="customerMode"
          className="sr-only"
          checked={mode === 'new'}
          onChange={() => onSelectMode('new')}
        />
        <span className="min-w-0 truncate">{t('form.new')}</span>
      </label>
    </div>

    {mode === 'existing' ? (
      customers.length === 0 ? (
        <p className="m-0 text-sm text-text">{t('form.noCustomers')}</p>
      ) : (
        <Select
          label={t('form.existingCustomer')}
          value={selectedCustomerId}
          onChange={(e) => onSelectCustomer(e.target.value)}
        >
          <option value="">{t('form.selectCustomer')}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.phone ? `${c.name} (${c.phone})` : c.name}
              {c.isDeleted ? t('form.deletedSuffix') : ''}
            </option>
          ))}
        </Select>
      )
    ) : (
      <div className="flex flex-col gap-3">
        <Input
          className="w-full"
          label={t('form.customerName')}
          value={newName}
          onChange={(e) => onChangeNewName(e.target.value)}
        />
        <Input
          className="w-full"
          label={t('form.phone')}
          value={newPhone}
          onChange={(e) => onChangeNewPhone(e.target.value)}
        />
      </div>
    )}
  </fieldset>
)

export default CustomerPicker
