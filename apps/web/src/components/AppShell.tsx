import { Outlet } from 'react-router'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <main className="flex-1 px-4 pt-6 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
