import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { SessionLoading } from '../components/SessionLoading'
import { authClient } from '../lib/auth-client'
import { mapRegisterError } from '../lib/register-error'
import { readReturnTo, resolvePostLoginPath } from '../lib/auth-redirect'
import { validateRegisterInput } from '../lib/register-validation'

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const nameId = useId()
  const emailId = useId()
  const passwordId = useId()
  const confirmPasswordId = useId()
  const errorId = useId()
  const { data: session, isPending } = authClient.useSession()
  const postAuthPath = resolvePostLoginPath(readReturnTo(location.state))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false)
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isPending) {
    return <SessionLoading />
  }

  if (session?.user) {
    return <Navigate replace to={postAuthPath} />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)
    const validated = validateRegisterInput({ name, email, password, confirmPassword })
    if (!validated.ok) {
      setFieldError({ field: validated.field, message: validated.message })
      return
    }

    setFieldError(null)
    setIsSubmitting(true)

    try {
      const { data, error } = await authClient.signUp.email({
        name: validated.name,
        email: validated.email,
        password: validated.password,
      })

      if (error) {
        setFormError(mapRegisterError(error))
        return
      }

      if (!data) {
        setFormError(mapRegisterError(null))
        return
      }

      await navigate(postAuthPath, { replace: true })
    } catch (cause) {
      setFormError(mapRegisterError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  const alertMessage = fieldError?.message ?? formError

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
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Creează un cont</h1>
        <p className="mt-2 max-w-xs text-muted">Începe să ții evidența inventarului casei.</p>
      </header>

      <form className="mt-8 flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor={nameId}>
            Nume
          </label>
          <input
            id={nameId}
            name="name"
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldError?.field === 'name' ? true : undefined}
            aria-describedby={fieldError?.field === 'name' ? errorId : undefined}
            className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
            placeholder="Numele tău"
          />
        </div>

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
            aria-invalid={fieldError?.field === 'email' ? true : undefined}
            aria-describedby={fieldError?.field === 'email' ? errorId : undefined}
            className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
            placeholder="nume@email.com"
          />
        </div>

        <PasswordField
          id={passwordId}
          name="password"
          label="Parolă"
          showLabel="Afișează parola"
          hideLabel="Ascunde parola"
          value={password}
          visible={passwordVisible}
          disabled={isSubmitting}
          invalid={fieldError?.field === 'password'}
          describedBy={fieldError?.field === 'password' ? errorId : undefined}
          onChange={setPassword}
          onToggleVisible={() => setPasswordVisible((visible) => !visible)}
        />

        <PasswordField
          id={confirmPasswordId}
          name="confirmPassword"
          label="Confirmă parola"
          showLabel="Afișează confirmarea parolei"
          hideLabel="Ascunde confirmarea parolei"
          value={confirmPassword}
          visible={confirmPasswordVisible}
          disabled={isSubmitting}
          invalid={fieldError?.field === 'confirmPassword'}
          describedBy={fieldError?.field === 'confirmPassword' ? errorId : undefined}
          onChange={setConfirmPassword}
          onToggleVisible={() => setConfirmPasswordVisible((visible) => !visible)}
        />

        <div
          id={errorId}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="min-h-5 text-sm text-destructive"
        >
          {alertMessage}
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
          {isSubmitting ? 'Se creează contul...' : 'Creează cont'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Ai deja cont?{' '}
        <Link to="/login" state={location.state} className="font-medium text-accent">
          Conectează-te
        </Link>
      </p>
    </section>
  )
}

function PasswordField({
  id,
  name,
  label,
  showLabel,
  hideLabel,
  value,
  visible,
  disabled,
  invalid,
  describedBy,
  onChange,
  onToggleVisible,
}: {
  id: string
  name: string
  label: string
  showLabel: string
  hideLabel: string
  value: string
  visible: boolean
  disabled: boolean
  invalid: boolean
  describedBy: string | undefined
  onChange: (value: string) => void
  onToggleVisible: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated py-0 pr-12 pl-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center text-muted disabled:opacity-60"
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          disabled={disabled}
          onClick={onToggleVisible}
        >
          {visible ? (
            <EyeOff className="size-5" aria-hidden="true" />
          ) : (
            <Eye className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  )
}
