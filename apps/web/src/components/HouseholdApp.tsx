import { Navigate, Outlet, useLocation } from 'react-router'
import { HouseholdProvider, useHousehold } from '../household/HouseholdProvider'
import { SessionLoading } from './SessionLoading'

function HouseholdGate() {
  const location = useLocation()
  const { status, household } = useHousehold()

  if (status === 'loading') {
    return (
      <SessionLoading className="flex min-h-dvh flex-col items-center justify-center bg-background" />
    )
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
        <p className="text-sm text-destructive">Nu am putut încărca casa.</p>
      </div>
    )
  }

  const hasHousehold = household !== null
  const isOnboarding = location.pathname === '/onboarding'

  if (!hasHousehold && !isOnboarding) {
    return <Navigate replace to="/onboarding" />
  }

  if (hasHousehold && isOnboarding) {
    return <Navigate replace to="/inventory" />
  }

  return <Outlet />
}

export function HouseholdApp() {
  return (
    <HouseholdProvider>
      <HouseholdGate />
    </HouseholdProvider>
  )
}
