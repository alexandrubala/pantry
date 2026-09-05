import { BrowserRouter, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AiPage } from './pages/AiPage'
import { HomePage } from './pages/HomePage'
import { InventoryPage } from './pages/InventoryPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ScanPage } from './pages/ScanPage'
import { ShoppingPage } from './pages/ShoppingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="scan" element={<ScanPage />} />
          <Route path="shopping" element={<ShoppingPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
