import { DomainError, DEFAULT_HOUSEHOLD_NAME, validateHouseholdName } from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { AccountMenu } from '../components/AccountMenu'
import { useHousehold } from '../household/HouseholdProvider'
import {
  HOUSEHOLD_NAME_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'

export function OnboardingPage() {
  const navigate = useNavigate()
  const nameId = useId()
  const errorId = useId()
  const { createHousehold } = useHousehold()
  const [name, setName] = useState(DEFAULT_HOUSEHOLD_NAME)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)

    let householdName: string
    try {
      householdName = validateHouseholdName(name)
    } catch (error) {
      setFormError(
        error instanceof DomainError ? HOUSEHOLD_NAME_INVALID_MESSAGE : mapPantryApiError(error),
      )
      return
    }

    setIsSubmitting(true)

    try {
      await createHousehold(householdName)
      await navigate('/inventory', { replace: true })
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh overflow-x-clip bg-background">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))]">
        <header className="flex items-center justify-between">
          <p className="text-sm font-medium tracking-wide text-accent">Pantry</p>
          <AccountMenu />
        </header>

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
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">Configurează casa</h1>
            <p className="mt-2 max-w-xs text-muted">
              Creează casa în care vei organiza produsele și stocurile.
            </p>
          </header>

          <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor={nameId}>
                Numele casei
              </label>
              <input
                id={nameId}
                name="householdName"
                type="text"
                autoComplete="organization"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSubmitting}
                aria-invalid={formError ? true : undefined}
                aria-describedby={formError ? errorId : undefined}
                className="h-touch min-h-touch w-full rounded-lg border border-border bg-surface-elevated px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
              />
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
              {isSubmitting ? 'Se creează casa...' : 'Creează casa'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
