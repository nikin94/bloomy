import { formatMoney } from '../../utils/format'
import type { Currency } from '../../types/order'

const Total = ({
  label,
  value,
  currency,
}: {
  label: string
  value: number
  currency: Currency
}) => (
  <div className="flex justify-between gap-8 text-text">
    <span>{label}</span>
    <span className="text-heading tabular-nums">{formatMoney(value, currency)}</span>
  </div>
)

export default Total
