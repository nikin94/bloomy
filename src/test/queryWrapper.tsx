import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// A fresh QueryClient per test render: retries OFF (a mocked reject should surface
// at once, not after a backoff) and `networkMode: 'always'` (jsdom reports offline,
// which would otherwise pause every query). One client per mount — held in state so
// it stays stable across re-renders but never leaks cache between test cases.
const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: 'always', refetchOnReconnect: false },
      mutations: { networkMode: 'always' },
    },
  })

// Wrap a page/component under test so its useQuery hooks have a client. Compose it
// as the OUTERMOST wrapper in a test's render (above the auth/router providers).
//
// The <Suspense> boundary mirrors the app's route-level one (AppLayout): pages that
// use the suspense query hooks throw a promise on first render, and a page rendered
// directly (without AppLayout) needs a boundary to catch it. Every page test awaits
// its content via findBy*, so this transparent fallback resolves before any
// assertion runs — existing tests keep passing unchanged.
export const QueryWrapper = ({ children }: { children: ReactNode }) => {
  const [client] = useState(createTestQueryClient)
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<div data-testid="suspense-fallback" />}>{children}</Suspense>
    </QueryClientProvider>
  )
}
