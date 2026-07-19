import type { TFunction } from 'i18next'
import Input from '@/components/Input/Input'
import Button from '@/components/Button/Button'
import Autocomplete from '@/components/Autocomplete/Autocomplete'
import type { ItemInput } from './items'

// One editable plant line, prefixed with its 1-based position. Four controls
// (name, quantity, price, delete) don't fit a phone width in a single row, so on
// narrow screens the number+name take their own line and quantity/price/delete
// share the line below; from `sm` up they all sit in one row. Widths are fluid
// at every size — the two groups distribute the row via flex proportions and the
// inputs carry `min-w-0` so they shrink with the container instead of locking to
// a fixed width. Extracted from OrderForm so the loop body is its own component.
const PlantItemRow = ({
  position,
  item,
  priceMissing,
  canRemove,
  autoFocus,
  suggestions,
  t,
  onChange,
  onRemove,
}: {
  position: number
  item: ItemInput
  priceMissing: boolean
  canRemove: boolean
  // Passed from the parent (single i18next subscription) so each plant row
  // doesn't open its own useTranslation.
  t: TFunction<['order', 'common']>
  // Focus the name input on mount — set only for a row just added via the
  // "+ Add plant" button, so the user can type the name right away.
  autoFocus: boolean
  // Known plant names from prior orders, offered as autocomplete suggestions on
  // the name input so re-typing an existing plant reuses one spelling.
  suggestions: string[]
  onChange: (patch: Partial<ItemInput>) => void
  onRemove: () => void
}) => {
  return (
    // gap-3.5 (not gap-2) between the two lines on a phone: the qty/price
    // floating labels sit ON TOP of their inputs' borders, poking ~8px up into
    // the gap — with gap-2 the pills visually touched the name input. From
    // `sm` up everything is one line, so the plain gap-2 returns.
    <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:gap-2">
      <div className="flex min-w-0 items-center gap-2 sm:flex-[4]">
        <span aria-hidden="true" className="w-5 shrink-0 text-right text-sm text-text">
          {position}.
        </span>
        <Autocomplete
          className="min-w-0 flex-1"
          label={t('form.plantName')}
          suggestions={suggestions}
          autoFocus={autoFocus}
          value={item.name}
          onChange={(name) => onChange({ name })}
        />
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:flex-[3]">
        <Input
          className="min-w-0 flex-[2]"
          numeric="integer"
          label={t('form.quantity')}
          value={item.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
        <Input
          className="min-w-0 flex-[3]"
          numeric="decimal"
          label={t('form.price')}
          invalid={priceMissing}
          value={item.price}
          onChange={(e) => onChange({ price: e.target.value })}
        />
        <Button
          variant="secondary"
          size="icon"
          onClick={onRemove}
          disabled={!canRemove}
          aria-label={t('form.removePlant')}
          className="shrink-0"
        >
          ✕
        </Button>
      </div>
    </div>
  )
}

export default PlantItemRow
