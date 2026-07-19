// Shared screen-gutter tokens, so every signed-in screen carries the SAME
// padding instead of each page hand-picking its own (they had drifted across
// p-4/p-6 variants). The reference is the orders list: its phone cards sit in
// a p-2 gutter (8px — the owner's halved phone gutter) and its desktop table
// cells pad px-4 (16px), so a page body using these tokens lines its content
// up with the list's edge on both widths.
//
// A pair of CONSTANTS (matching the fieldStyles/tableStyles convention), not a
// wrapper component: the screens have three different scroll models — the
// DataTable lists scroll internally and take no page padding at all, the order
// form scrolls its body over a pinned footer, and the read-only pages scroll a
// plain padded div — so a component with a baked-in overflow/scroll shape would
// need to be parameterised past the point of usefulness. The consumer applies
// the token to whichever element actually owns its scrolling.

// Full body padding for a page's scrollable content area.
export const SCREEN_PADDING = 'p-2 md:p-4'

// Horizontal-only variant for full-width bars that manage their own vertical
// rhythm (banners, the form's pinned footer) but must share the content gutter.
export const SCREEN_GUTTER_X = 'px-2 md:px-4'
