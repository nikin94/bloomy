import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage/LoginPage'
import OrdersPage from './pages/OrdersPage/OrdersPage'
import NewOrderPage from './pages/NewOrderPage/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage/OrderDetailPage'
import './App.css'

function App() {
  return (
    <Routes>
      {/* Public login screen. */}
      <Route path="/" element={<LoginPage />} />

      {/* Owner-scoped pages: require a signed-in user. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<NewOrderPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
      </Route>
    </Routes>
  )
}

export default App
