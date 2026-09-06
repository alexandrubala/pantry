import { Outlet } from 'react-router'
import { AccountMenu } from './AccountMenu'
import { BottomNav } from './BottomNav'

export function AppShell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top,0px))]">
          <p className="text-sm font-medium tracking-wide text-accent">Pantry</p>
          <AccountMenu />
        </header>
        <main className="flex-1 px-4 pt-4 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))]">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
