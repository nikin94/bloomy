import { Route, Routes } from 'react-router-dom'
import OrdersPage from './pages/OrdersPage/OrdersPage'
import NewOrderPage from './pages/NewOrderPage/NewOrderPage'
import OrderDetailPage from './pages/OrderDetailPage/OrderDetailPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<OrdersPage />} />
      <Route path="/orders/new" element={<NewOrderPage />} />
      <Route path="/orders/:id" element={<OrderDetailPage />} />
    </Routes>
  )
}

export default App
