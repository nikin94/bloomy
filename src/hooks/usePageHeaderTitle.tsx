import { useMemo } from 'react'
import { useHeaderTitle } from '@/context/headerTitleContext'

// Publish this page's name into the MOBILE top bar as the standard title node:
// a truncating h1 with an optional small note beside it and an optional small
// subtitle line under it. This is the one shared shape every inner page uses —
// the order page (number + date), the edit page (number + "Редактирование"),
// the create form and the customer page — so the bar always reads the same and
// a new screen opts in with one line instead of hand-assembling the node.
//
// Built ON TOP of useHeaderTitle, which takes a raw ReactNode and demands the
// caller memoise it (a fresh element every render would loop the layout's
// setState). This hook removes that footgun: the inputs are PRIMITIVES, so the
// node is memoised here, keyed on them — a page can call it with inline
// expressions safely.
//
// The bar is md:hidden, so desktop is untouched: a page keeps its own
// in-content heading and hides it on phones (max-md:hidden) to avoid naming
// the screen twice. Pass null while the page's data is still unresolved (the
// slot stays quiet); the title clears automatically on unmount.
export function usePageHeaderTitle(
  title: string | null,
  options?: {
    // Small subdued line under the title (the order page's date, the edit
    // page's mode word).
    subtitle?: string
    // Small note ON the title line, after the text (the order page's
    // "не синхронизирован" badge for an unnumbered order).
    titleNote?: string
    // Star the title out in Sentry replays (customer PII — see
    // observability/sentry.ts). Labels/numbers stay readable, names don't.
    masked?: boolean
  },
): void {
  const { subtitle, titleNote, masked } = options ?? {}
  const node = useMemo(
    () =>
      title === null ? null : (
        <div className="flex min-w-0 flex-col">
          <h1
            data-sentry-mask={masked || undefined}
            className="m-0 min-w-0 truncate text-lg font-semibold leading-tight text-heading"
          >
            {title}
            {titleNote && <span className="ml-2 text-xs font-normal text-text">{titleNote}</span>}
          </h1>
          {subtitle && <span className="mt-0.5 text-xs leading-tight text-text">{subtitle}</span>}
        </div>
      ),
    [title, subtitle, titleNote, masked],
  )
  useHeaderTitle(node)
}
