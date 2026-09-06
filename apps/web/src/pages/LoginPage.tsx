import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { SessionLoading } from '../components/SessionLoading'
import { authClient } from '../lib/auth-client'
import { readReturnTo, resolvePostLoginPath } from '../lib/auth-redirect'
import { mapLoginError } from '../lib/login-error'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const emailId = useId()
  const passwordId = useId()
  const errorId = useId()
  const { data: session, isPending } = authClient.useSession()
  const postLoginPath = resolvePostLoginPath(readReturnTo(location.state))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isPending) {
    return <SessionLoading />
  }

  if (session?.user) {
    return <Navigate replace to={postLoginPath} />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      const { data, error } = await authClient.signIn.email({
        email: email.trim(),
        password,
      })

      if (error) {
        setFormError(mapLoginError(error))
        return
      }

      if (!data) {
        setFormError(mapLoginError(null))
        return
      }

      await navigate(postLoginPath, { replace: true })
    } catch (cause) {
      setFormError(mapLoginError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  const describedBy = formError ? errorId : undefined

  return (
    <section className="flex flex-1 flex-col justify-center py-6 sm:py-10">
      <header className="flex flex-col items-center text-center">
        <img
          src="/favicon.svg"
          alt=""
          width={64}
          height={64}
          className="size-16 rounded-xl border border-border bg-surface shadow-surface"
        />
        <p className="mt-4 text-sm font-medium tracking-wide text-accent">Pantry</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Conectează-te</h1>
        <p className="mt-2 max-w-xs text-muted">Accesează inventarul casei tale.</p>
      </header>

      <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={formError ? true : undefined}
            aria-describedby={describedBy}
            className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
            placeholder="nume@email.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={passwordId}>
            Parolă
          </label>
          <div className="relative">
            <input
              id={passwordId}
              name="password"
              type={passwordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={formError ? true : undefined}
              aria-describedby={describedBy}
              className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated py-0 pr-12 pl-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center text-muted disabled:opacity-60"
              aria-label={passwordVisible ? 'Ascunde parola' : 'Afișează parola'}
              aria-pressed={passwordVisible}
              disabled={isSubmitting}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              {passwordVisible ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="min-h-5 text-sm text-destructive"
        >
          {formError}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="mt-1 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 font-medium text-accent-foreground shadow-surface disabled:opacity-60"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
          ) : null}
          {isSubmitting ? 'Se conectează...' : 'Conectează-te'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Nu ai cont?{' '}
        <Link to="/register" state={location.state} className="font-medium text-accent">
          Creează unul
        </Link>
      </p>
    </section>
  )
}
