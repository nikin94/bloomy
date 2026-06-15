import type { TextareaHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_NORMAL } from '../../styles/fieldStyles'

// The app's standard multi-line text field. Shares the same visual base as Input
// (border, focus ring, padding) and is vertically resizable; pass `className` for
// per-usage sizing (e.g. min-h-16). All native textarea props pass through.
const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea
    className={`${FIELD_BASE} ${FIELD_NORMAL} resize-y px-3 py-2 ${className}`}
    {...props}
  />
)

export default Textarea
