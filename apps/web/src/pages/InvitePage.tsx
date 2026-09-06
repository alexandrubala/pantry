import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { SessionLoading } from '../components/SessionLoading'
import { authClient } from '../lib/auth-client'
import { isPantryApiError } from '../lib/api'
import { mapPantryApiError } from '../lib/pantry-api-error'
import { acceptInvite, getActiveHousehold, getInvitePreview } from '../lib/pantry-api'

type PreviewState =
  | { status: 'loading' }
  | { status: 'valid'; householdName: string }
  | { status: 'invalid' }

export function InvitePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useParams()
  const { data: session, isPending } = authClient.useSession()
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!token) {
        setPreview({ status: 'invalid' })
        return
      }

      try {
        const data = await getInvitePreview(token)
        if (!cancelled) {
          setPreview({ status: 'valid', householdName: data.householdName })
        }
      } catch {
        if (!cancelled) {
          setPreview({ status: 'invalid' })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  if (isPending || preview.status === 'loading') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background">
        <SessionLoading />
      </div>
    )
  }

  const returnState = { from: `${location.pathname}${location.search}` }

  async function handleAccept() {
    if (!token || isAccepting) {
      return
    }

    setAcceptError(null)
    setIsAccepting(true)
    try {
      await acceptInvite(token)
      await navigate('/inventory', { replace: true })
    } catch (cause) {
      setAcceptError(mapPantryApiError(cause))
      setIsAccepting(false)
    }
  }

  async function handleDefer() {
    try {
      const active = await getActiveHousehold()
      await navigate(active.household ? '/inventory' : '/onboarding', { replace: true })
    } catch (cause) {
      if (isPantryApiError(cause) && cause.status === 401) {
        await navigate('/login', { replace: true, state: returnState })
        return
      }
      await navigate('/onboarding', { replace: true })
    }
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <p className="text-sm font-medium tracking-wide text-accent">Pantry</p>
        <section className="flex flex-1 flex-col justify-center py-6 sm:py-10">
          <header className="flex flex-col items-center text-center">
            <img
              src="/favicon.svg"
              alt=""
              width={64}
              height={64}
              className="size-16 rounded-xl border border-border bg-surface shadow-surface"
            />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              {preview.status === 'invalid'
                ? 'Invitație indisponibilă'
                : session?.user
                  ? `Ai fost invitat în „${preview.householdName}”.`
                  : 'Ai primit o invitație în Pantry'}
            </h1>
            <p className="mt-2 max-w-xs text-muted">
              {preview.status === 'invalid'
                ? 'Linkul nu este valid sau nu mai poate fi folosit.'
                : session?.user
                  ? 'Acceptă invitația pentru a lucra pe aceeași casă.'
                  : preview.householdName
                    ? `Ai fost invitat în ${preview.householdName}.`
                    : 'Conectează-te sau creează un cont pentru a continua.'}
            </p>
          </header>

          {preview.status === 'invalid' ? (
            <Link
              to="/login"
              className="mt-8 flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 font-medium text-accent-foreground shadow-surface"
            >
              Mergi la autentificare
            </Link>
          ) : session?.user ? (
            <div className="mt-8 flex flex-col gap-3">
              {acceptError ? (
                <p className="text-center text-sm text-destructive" role="alert">
                  {acceptError}
                </p>
              ) : null}
              <button
                type="button"
                disabled={isAccepting}
                aria-busy={isAccepting}
                className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-foreground shadow-surface disabled:opacity-60"
                onClick={() => {
                  void handleAccept()
                }}
              >
                {isAccepting ? <LoaderCircle className="size-5 animate-spin" aria-hidden="true" /> : null}
                {isAccepting ? 'Se acceptă...' : `Intră în ${preview.householdName}`}
              </button>
              <button
                type="button"
                disabled={isAccepting}
                className="flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-text disabled:opacity-60"
                onClick={() => {
                  void handleDefer()
                }}
              >
                Nu acum
              </button>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-3">
              <Link
                to="/login"
                state={returnState}
                className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 font-medium text-accent-foreground shadow-surface"
              >
                Conectează-te
              </Link>
              <Link
                to="/register"
                state={returnState}
                className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 font-medium text-text"
              >
                Creează cont
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
