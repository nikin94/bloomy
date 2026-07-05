import Select from '@/components/Select/Select'
import SelectOptions from '@/components/SelectOptions/SelectOptions'
import DetailRow from '@/components/DetailRow/DetailRow'

// A status row that's editable in place: same layout as DetailRow, but the value is
// a Select. Selecting an option calls onChange, which saves optimistically on
// the page (the write is fire-and-forget, so there's no in-flight disabled
// state). Used for both order statuses. `readOnly` (a trashed order) renders the
// resolved label as plain text instead — the same row layout as Field, so a
// deleted order reads as a static archive rather than an editable record.
const InlineStatusField = ({
  label,
  value,
  options,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  readOnly?: boolean
}) => (
  <DetailRow
    label={label}
    value={
      readOnly ? (
        (options.find((o) => o.value === value)?.label ?? value)
      ) : (
        <div className="w-full sm:max-w-[220px]">
          <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
            <SelectOptions options={options} />
          </Select>
        </div>
      )
    }
  />
)

export default InlineStatusField
