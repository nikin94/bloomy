// Shared cell styling for the desktop list tables (orders, trash, customers) so
// all three read identically AND adapt to width the same way.
//
// The tables use the browser's auto layout at `w-full`: when the summed column
// content is wider than the viewport the table would overflow and show a
// horizontal scrollbar. The fix is per-column: SHORT columns (№, date, total,
// statuses, phone) stay on one line and truncate past a cap, while FLEXIBLE text
// columns (customer, address, note, the plant list) WRAP — an auto table shrinks
// exactly the wrappable columns to fit, so a narrow desktop reflows instead of
// scrolling sideways. `align-top` keeps every cell aligned when a neighbour wraps
// to several lines.
export const TABLE_CELL_BASE = 'border-b border-border px-4 py-2.5 align-top'

// One-line cell: capped width, clipped with an ellipsis.
export const TABLE_CELL_NOWRAP = 'max-w-[320px] overflow-hidden text-ellipsis whitespace-nowrap'

// Wrapping cell: no width cap, long/unbroken text breaks onto more lines so the
// column can give up width instead of forcing the table wider.
export const TABLE_CELL_WRAP = 'break-words'
