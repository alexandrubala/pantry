import { DomainError, validateLocationName } from '@pantry/core'
import { LoaderCircle, Plus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useHousehold } from '../household/HouseholdProvider'
import {
  LOCATION_NAME_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'

export function InventoryPage() {
  const { household, locations, addLocation } = useHousehold()
  const nameId = useId()
  const errorId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setFormError(null)

    let locationName: string
    try {
      locationName = validateLocationName(name).name
    } catch (error) {
      setFormError(
        error instanceof DomainError ? LOCATION_NAME_INVALID_MESSAGE : mapPantryApiError(error),
      )
      return
    }

    setIsSubmitting(true)

    try {
      await addLocation(locationName)
      setName('')
      setOpen(false)
    } catch (cause) {
      setFormError(mapPantryApiError(cause))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Inventar</h1>
      {household ? <p className="mt-1 text-muted">{household.name}</p> : null}

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Locații</h2>
          <button
            type="button"
            className="flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-accent"
            onClick={() => {
              setOpen((current) => !current)
              setFormError(null)
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Adaugă locație
          </button>
        </div>

        {open ? (
          <form className="mt-3 rounded-xl border border-border bg-surface-elevated p-3" onSubmit={handleSubmit}>
            <label className="text-sm font-medium" htmlFor={nameId}>
              Numele locației
            </label>
            <input
              id={nameId}
              name="locationName"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={formError ? true : undefined}
              aria-describedby={formError ? errorId : undefined}
              className="mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60"
              placeholder="Beci"
            />
            <div
              id={errorId}
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              className="mt-2 min-h-5 text-sm text-destructive"
            >
              {formError}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="mt-1 flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
            >
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {isSubmitting ? 'Se adaugă...' : 'Salvează locația'}
            </button>
          </form>
        ) : null}

        <ul className="mt-3 flex flex-wrap gap-2">
          {locations.map((location) => (
            <li
              key={location.id}
              className="rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-sm"
            >
              {location.name}
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-muted">Inventarul tău este gol.</p>
      <p className="mt-2 text-sm text-muted">
        În următorul pas vei putea adăuga produse manual sau prin scanare.
      </p>
    </section>
  )
}
