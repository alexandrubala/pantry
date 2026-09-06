import { UNITS, type Unit } from '@pantry/shared'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AppShell } from './components/AppShell'
import { AuthLayout } from './components/AuthLayout'
import { HouseholdApp } from './components/HouseholdApp'
import { ProtectedApp } from './components/ProtectedApp'
import { AiPage } from './pages/AiPage'
import { InventoryPage } from './pages/InventoryPage'
import { HouseholdPage } from './pages/HouseholdPage'
import { InvitePage } from './pages/InvitePage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { RegisterPage } from './pages/RegisterPage'
import { ScanPage } from './pages/ScanPage'
import { SettingsPage } from './pages/SettingsPage'
import { ShoppingPage } from './pages/ShoppingPage'

export const supportedUnits: readonly Unit[] = UNITS

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="invite/:token" element={<InvitePage />} />
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedApp />}>
          <Route element={<HouseholdApp />}>
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route element={<AppShell />}>
              <Route index element={<Navigate replace to="/inventory" />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="scan" element={<ScanPage />} />
              <Route path="shopping" element={<ShoppingPage />} />
              <Route path="ai" element={<AiPage />} />
              <Route path="household" element={<HouseholdPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
