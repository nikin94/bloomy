import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { MemoryRouterProps } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { QueryWrapper } from '@/test/queryWrapper'
import { AuthContext } from '@/context/authContext'
import AppLayout from '@/components/AppLayout/AppLayout'

// The signed-in test user, matching the `ownerId: 'owner-1'` the factories bake
// into their fixtures — so a page rendered with this helper reads the fixture
// data as its own.
export const TEST_USER = {
  uid: 'owner-1',
  displayName: 'Tester',
  email: 't@example.com',
} as User

// Mount a page inside AppLayout + router + auth + query client, exactly as in
// the app. Extracted because every list-page test re-assembled this stack by
// hand: the global header lives in AppLayout (above the page in the route tree)
// and pages publish their search/filter controls into it via the header-actions
// slot, so testing those controls REQUIRES the layout around the page.
//
// The caller's vi.mock calls still apply to everything this helper imports
// (AppLayout → Sidebar → firebase/auth etc.): vitest intercepts by resolved
// module path, not by which file does the importing — so each test keeps
// mocking exactly as before, and this helper stays mock-free.
export const renderPageInLayout = (
  page: ReactNode,
  {
    user = TEST_USER,
    // Seed the history when a test needs an entry with router STATE (e.g. the
    // stats tab's clicked-month date filter riding into the orders list).
    initialEntries,
  }: { user?: User; initialEntries?: MemoryRouterProps['initialEntries'] } = {},
) =>
  render(
    <QueryWrapper>
      <AuthContext.Provider value={{ user, loading: false, sessionLost: false }}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="*" element={page} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryWrapper>,
  )
