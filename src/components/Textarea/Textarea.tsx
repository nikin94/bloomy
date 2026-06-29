import { useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  // Floating label — same behaviour and rationale as Input's `label`, but the
  // resting position sits near the top (a textarea is multi-line, so a vertically
  // centred resting label would float in the middle of the box). Omit for the
  // plain field with the caller's `placeholder`.
  label?: string
}

// Resting label aligns with the first text line (`top-3`); floated it straddles
// the top border. See Input's FLOATING_LABEL for why the floated state lives only
// in the peer-* variants and why the input carries `placeholder=" "`.
const FLOATING_LABEL =
  'pointer-events-none absolute left-2 top-3 z-10 px-1 text-base text-placeholder ' +
  'motion-safe:transition-all motion-safe:duration-150 ' +
  'peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:bg-bg peer-focus:text-primary ' +
  'peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 ' +
  'peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:bg-bg ' +
  'peer-[:not(:placeholder-shown)]:text-text'

// The app's standard multi-line text field. Shares the same visual base as Input
// (border, focus ring, padding) and is vertically resizable; pass `label` for a
// floating label and `className` for per-usage sizing (e.g. min-h-16). All native
// textarea props pass through.
const Textarea = ({ className = '', label, id, placeholder, ...props }: TextareaProps) => {
  const reactId = useId()
  const textareaId = id ?? reactId

  if (label) {
    return (
      <div className={`relative ${className}`}>
        <textarea
          id={textareaId}
          placeholder=" "
          className={`peer ${FIELD_BASE} ${FIELD_NORMAL} h-full w-full resize-y px-3 py-2`}
          {...props}
        />
        <label htmlFor={textareaId} className={FLOATING_LABEL}>
          {label}
        </label>
      </div>
    )
  }

  return (
    <textarea
      id={id}
      placeholder={placeholder}
      className={`${FIELD_BASE} ${FIELD_NORMAL} resize-y px-3 py-2 ${className}`}
      {...props}
    />
  )
}

export default Textarea
