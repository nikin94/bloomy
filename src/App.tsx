import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { routes } from './routes'
import './App.css'

// The app is a DATA router (createBrowserRouter) rather than the declarative
// <BrowserRouter>, so the settings page can arm useBlocker to confirm an in-app
// leave with unsaved changes. The route tree lives in ./routes (shared with the
// tests, which build a memory router from the same config); App just provides it.
const router = createBrowserRouter(routes)

function App() {
  return <RouterProvider router={router} />
}

export default App
