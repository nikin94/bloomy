// A small "label above, value below" pair used by the mobile card for the
// customer, address and the paired payment/order statuses.
const CardField = ({
  label,
  value,
  className = '',
  masked = false,
}: {
  label: string
  value: string
  className?: string
  // Customer-PII value (name/address): stamp Sentry Replay's mask selector on
  // the VALUE only, so the label stays readable in a replay. Driven by the
  // same column `masked` flag the desktop table cells use.
  masked?: boolean
}) => (
  <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
    <span className="text-xs font-medium uppercase tracking-wide text-text">{label}</span>
    <span data-sentry-mask={masked || undefined} className="break-words text-sm text-heading">
      {value}
    </span>
  </div>
)

export default CardField
