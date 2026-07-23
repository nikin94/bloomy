import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'
import './App.css'

// The app is a DATA router (createBrowserRouter) rather than the declarative
// <BrowserRouter>. Historical reason: the settings page once armed useBlocker
// (which only data routers support) to confirm leaving with unsaved changes;
// settings autosave (#193) removed that blocker, but the data router stays —
// it's the current API and keeps useBlocker available to any future screen.
// The route tree lives in ./routes (shared with the tests, which build a
// memory router from the same config); App just provides it.
const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App
