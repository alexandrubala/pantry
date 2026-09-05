import { NavLink } from 'react-router'
import { navItems } from '../navigation'

function navClassName(isActive: boolean) {
  const base =
    'flex h-full min-h-touch w-full min-w-0 flex-col items-center justify-end gap-0.5 rounded-md px-0.5 text-[0.6875rem] leading-tight tracking-tight'

  return `${base} ${isActive ? 'font-medium text-accent' : 'text-muted'}`
}

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="mx-auto grid w-full max-w-lg grid-cols-5 items-end px-1 pt-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const prominent = item.prominent === true

          return (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => navClassName(isActive)}
              >
                {prominent ? (
                  <span className="-mt-3 flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-elevated">
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                ) : (
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                )}
                <span className="w-full truncate pb-1 text-center">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
