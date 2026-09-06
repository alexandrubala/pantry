import { validateHouseholdName, validateLocationName, type LocationRecord } from '@pantry/core'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useHousehold } from '../household/HouseholdProvider'
import {
  HOUSEHOLD_NAME_INVALID_MESSAGE,
  LOCATION_NAME_INVALID_MESSAGE,
  mapPantryApiError,
} from '../lib/pantry-api-error'
import { createLocation, deactivateLocation, renameHousehold, renameLocation } from '../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface'

export function SettingsPage() {
  const { household, locations, reload } = useHousehold()
  const isOwner = household?.role === 'owner'

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Setări</h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold tracking-tight">Casa</h2>
        {household ? (
          <HouseholdNameForm
            name={household.name}
            canEdit={isOwner}
            onSaved={reload}
          />
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Locații</h2>
        <LocationSettings locations={locations} onChanged={reload} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Cont / acces</h2>
        <Link
          to="/household"
          className="mt-3 flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
        >
          Membri și acces
        </Link>
      </section>
    </section>
  )
}

function HouseholdNameForm({
  name,
  canEdit,
  onSaved,
}: {
  name: string
  canEdit: boolean
  onSaved: () => Promise<void>
}) {
  const nameId = useId()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setValue(name)
  }, [name])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || busy) {
      return
    }
    setError(null)
    try {
      validateHouseholdName(value)
    } catch {
      setError(HOUSEHOLD_NAME_INVALID_MESSAGE)
      return
    }
    setBusy(true)
    try {
      await renameHousehold(value)
      await onSaved()
    } catch (cause) {
      setError(mapPantryApiError(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mt-3" onSubmit={(event) => void handleSubmit(event)}>
      <label className="text-sm font-medium" htmlFor={nameId}>
        Numele casei
      </label>
      <input
        id={nameId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={!canEdit || busy}
        className={fieldClassName}
      />
      {!canEdit ? <p className="mt-1 text-sm text-muted">Doar proprietarul poate redenumi casa.</p> : null}
      <div role="alert" className="min-h-5 text-sm text-destructive">
        {error}
      </div>
      {canEdit ? (
        <button
          type="submit"
          disabled={busy}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          Salvează
        </button>
      ) : null}
    </form>
  )
}

function LocationSettings({
  locations,
  onChanged,
}: {
  locations: LocationRecord[]
  onChanged: () => Promise<void>
}) {
  const addId = useId()
  const [addName, setAddName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      validateLocationName(addName)
    } catch {
      setError(LOCATION_NAME_INVALID_MESSAGE)
      return
    }
    setBusyId('add')
    try {
      await createLocation(addName)
      setAddName('')
      await onChanged()
    } catch (cause) {
      setError(mapPantryApiError(cause))
    } finally {
      setBusyId(null)
    }
  }

  async function handleRename(location: LocationRecord) {
    setError(null)
    try {
      validateLocationName(editingName)
    } catch {
      setError(LOCATION_NAME_INVALID_MESSAGE)
      return
    }
    setBusyId(location.id)
    try {
      await renameLocation(location.id, editingName)
      setEditingId(null)
      await onChanged()
    } catch (cause) {
      setError(mapPantryApiError(cause))
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeactivate(location: LocationRecord) {
    setError(null)
    setBusyId(location.id)
    try {
      await deactivateLocation(location.id)
      await onChanged()
    } catch (cause) {
      setError(mapPantryApiError(cause))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mt-3">
      <ul className="space-y-2">
        {locations.map((location) => (
          <li key={location.id} className="rounded-xl border border-border px-3 py-2">
            {editingId === location.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className={fieldClassName}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === location.id}
                    className="flex h-touch min-h-touch flex-1 items-center justify-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
                    onClick={() => void handleRename(location)}
                  >
                    Salvează
                  </button>
                  <button
                    type="button"
                    className="flex h-touch min-h-touch flex-1 items-center justify-center rounded-lg border border-border px-3 text-sm"
                    onClick={() => setEditingId(null)}
                  >
                    Anulează
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{location.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-accent"
                    onClick={() => {
                      setEditingId(location.id)
                      setEditingName(location.name)
                    }}
                  >
                    Redenumește
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-destructive"
                    onClick={() => void handleDeactivate(location)}
                  >
                    Elimină
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="mt-4" onSubmit={(event) => void handleAdd(event)}>
        <label className="text-sm font-medium" htmlFor={addId}>
          Locație nouă
        </label>
        <input
          id={addId}
          value={addName}
          onChange={(event) => setAddName(event.target.value)}
          className={fieldClassName}
          placeholder="Beci"
        />
        <button
          type="submit"
          disabled={busyId === 'add'}
          className="mt-3 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
        >
          Adaugă locație
        </button>
      </form>
      <div role="alert" className="mt-2 min-h-5 text-sm text-destructive">
        {error}
      </div>
    </div>
  )
}
