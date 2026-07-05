// Shared visual base for the app's text-like form controls (Input, Textarea,
// Select). Keeps the rounded border, background, text colour and focus ring
// identical across all of them and in ONE place, instead of repeating the same
// utility string per control.
//
// Border/outline colour is applied separately (FIELD_NORMAL vs FIELD_INVALID)
// so exactly one border-* utility is ever present on an element — this avoids
// order-dependent specificity wins between a base border colour and an override.
//
// Width and padding are intentionally NOT baked in: each control sets its own
// (Select needs pr-9 for its chevron; inputs take a per-usage width), and the
// consumer's className is merged last so its width wins cleanly.
export const FIELD_BASE =
  'rounded-md border bg-bg text-heading placeholder:text-placeholder focus-visible:outline-2 focus-visible:outline-offset-[-1px]'

export const FIELD_NORMAL = 'border-border focus-visible:outline-primary'

export const FIELD_INVALID = 'border-danger focus-visible:outline-danger'

// Shared keyboard focus ring for interactive elements. Kept in one place so the
// same primary-coloured ring is applied consistently everywhere.
// FOCUS_RING uses offset-2 by default; FOCUS_RING_INSET pulls the ring inward
// (offset-[-2px]) for elements whose outward ring would otherwise be clipped by
// an overflow parent, e.g. table rows / cards.
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const FOCUS_RING_INSET =
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary'
