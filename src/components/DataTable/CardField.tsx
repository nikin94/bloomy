// A small "label above, value below" pair used by the mobile card for the
// customer, address and the paired payment/shipment statuses.
const CardField = ({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-xs font-medium uppercase tracking-wide text-text">{label}</span>
    <span className="break-words text-sm text-heading">{value}</span>
  </div>
)

export default CardField
