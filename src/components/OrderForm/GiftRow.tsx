import type { TFunction } from 'i18next'
import Button from '@/components/Button/Button'
import Autocomplete from '@/components/Autocomplete/Autocomplete'

// The order's single gift line. A gift is a plant given for free, so the row is
// just a name input (same autocomplete as the plant rows) — quantity is fixed
// at 1 and the price at 0, so neither is asked. Marked with a gift glyph in the
// position slot so it reads apart from the numbered plant lines above it.
// `alreadySent` surfaces a non-blocking warning that this customer has received
// the same gift before (the whole point: don't repeat a gift) — it never stops
// the save, because repeating on purpose stays allowed.
const GiftRow = ({
  name,
  alreadySent,
  autoFocus,
  suggestions,
  t,
  onChange,
  onRemove,
}: {
  name: string
  alreadySent: boolean
  // Focus the name input on mount — set when the row is added via the
  // "+ Add gift" button, so the user can type right away.
  autoFocus: boolean
  // Same plant-name suggestions as the plant rows: a gift IS a plant.
  suggestions: string[]
  // Passed from the parent (single i18next subscription), as PlantItemRow does.
  t: TFunction<['order', 'common']>
  onChange: (name: string) => void
  onRemove: () => void
}) => (
  <div className="flex flex-col gap-1">
    <div className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="w-5 shrink-0 text-right text-sm">
        🎁
      </span>
      <Autocomplete
        className="min-w-0 flex-1"
        label={t('form.giftName')}
        suggestions={suggestions}
        autoFocus={autoFocus}
        value={name}
        onChange={onChange}
      />
      <Button
        variant="secondary"
        size="icon"
        onClick={onRemove}
        aria-label={t('form.removeGift')}
        className="shrink-0"
      >
        ✕
      </Button>
    </div>
    {alreadySent && (
      // danger is the design system's only attention colour (no warning token);
      // the trash banner sets the precedent of using it for non-error notices.
      <p role="status" className="m-0 pl-7 text-sm text-danger">
        {t('form.giftAlreadySent')}
      </p>
    )}
  </div>
)

export default GiftRow
