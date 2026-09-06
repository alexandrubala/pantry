import { UNITS, type Unit } from '@pantry/shared'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AuthLayout } from './components/AuthLayout'
import { ProtectedApp } from './components/ProtectedApp'
import { AiPage } from './pages/AiPage'
import { InventoryPage } from './pages/InventoryPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { RegisterPage } from './pages/RegisterPage'
import { ScanPage } from './pages/ScanPage'
import { ShoppingPage } from './pages/ShoppingPage'

export const supportedUnits: readonly Unit[] = UNITS

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedApp />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate replace to="/inventory" />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="shopping" element={<ShoppingPage />} />
            <Route path="ai" element={<AiPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
