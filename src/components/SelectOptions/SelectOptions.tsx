// Renders a list of {value,label} options for a native <select>. Extracted because
// the same `.map(o => <option key value>label</option>)` appeared across every
// order-domain picker (delivery/payment/currency/status). The parent owns the
// <Select> wrapper; this only fills its option children.
const SelectOptions = ({ options }: { options: { value: string; label: string }[] }) => (
  <>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </>
)

export default SelectOptions
