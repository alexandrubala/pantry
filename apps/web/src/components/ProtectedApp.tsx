import { Navigate, Outlet, useLocation } from 'react-router'
import { authClient } from '../lib/auth-client'
import { SessionLoading } from './SessionLoading'

export function ProtectedApp() {
  const location = useLocation()
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <SessionLoading className="flex min-h-dvh flex-col items-center justify-center bg-background" />
    )
  }

  if (!session?.user) {
    return (
      <Navigate
        replace
        to="/login"
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <Outlet />
}
