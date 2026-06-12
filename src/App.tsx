import { Navigate, Route, Routes } from 'react-router-dom'
import OrdersPage from './pages/OrdersPage/OrdersPage'
import NewOrderPage from './pages/NewOrderPage/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage/OrderDetailPage'
import './App.css'

function App() {
  return (
    <Routes>
      {/* Root is reserved for the upcoming Google sign-in screen.
          Until then it redirects to the orders list. */}
      <Route path="/" element={<Navigate to="/orders" replace />} />
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/new" element={<NewOrderPage />} />
      <Route path="/orders/:id" element={<OrderDetailPage />} />
    </Routes>
  )
}

export default App
