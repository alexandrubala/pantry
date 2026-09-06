import { CircleUser, LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { authClient } from '../lib/auth-client'

export function AccountMenu() {
  const navigate = useNavigate()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const { data: session } = authClient.useSession()
  const user = session?.user

  useEffect(() => {
    if (!open) {
      return
    }

    panelRef.current?.focus()

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    if (isSigningOut) {
      return
    }

    setIsSigningOut(true)

    try {
      const { error } = await authClient.signOut()
      if (error) {
        setIsSigningOut(false)
        return
      }

      setOpen(false)
      await navigate('/login', { replace: true })
    } catch {
      setIsSigningOut(false)
    }
  }

  if (!user) {
    return null
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted"
        aria-label="Cont"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <CircleUser className="size-6" aria-hidden="true" />
      </button>

      {open ? (
        <div
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label="Cont"
          tabIndex={-1}
          className="absolute top-[calc(100%-0.25rem)] right-0 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface-elevated p-3 shadow-elevated"
        >
          <p className="truncate text-sm font-medium text-text">{user.name}</p>
          <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
          <button
            type="button"
            className="mt-3 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text disabled:opacity-60"
            disabled={isSigningOut}
            aria-busy={isSigningOut}
            onClick={() => {
              void handleSignOut()
            }}
          >
            {isSigningOut ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="size-4" aria-hidden="true" />
            )}
            Deconectează-te
          </button>
        </div>
      ) : null}
    </div>
  )
}
