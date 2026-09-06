import type { RecipeMode, RecipeSummary } from '@pantry/core'
import { ChefHat, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { useHousehold } from '../household/HouseholdProvider'
import { formatQuantity } from '../lib/inventory-format'
import { EMPTY_INVENTORY_MESSAGE, mapPantryApiError } from '../lib/pantry-api-error'
import {
  cookRecipe,
  generateRecipe,
  getRecipe,
  getRecipes,
  type RecipeView,
} from '../lib/pantry-api'

const fieldClassName =
  'mt-1.5 h-touch min-h-touch w-full rounded-lg border border-border bg-surface px-3 text-text shadow-surface placeholder:text-muted disabled:opacity-60'

const MODE_OPTIONS: Array<{ value: RecipeMode; label: string }> = [
  { value: 'balanced', label: 'Echilibrat' },
  { value: 'low_calorie', label: 'Slab caloric' },
  { value: 'high_protein', label: 'High protein' },
]

function nutrientLabel(value: number | null, suffix: string): string {
  if (value == null) {
    return '—'
  }

  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(value)} ${suffix}`
}

export function AiPage() {
  const { household } = useHousehold()
  const servingsId = useId()
  const caloriesId = useId()
  const proteinId = useId()
  const timeId = useId()
  const preferenceId = useId()
  const householdId = household?.id ?? null

  const [servings, setServings] = useState(2)
  const [mode, setMode] = useState<RecipeMode>('balanced')
  const [maxCalories, setMaxCalories] = useState('')
  const [minProtein, setMinProtein] = useState('')
  const [maxTime, setMaxTime] = useState('')
  const [preference, setPreference] = useState('')
  const [generating, setGenerating] = useState(false)
  const [cooking, setCooking] = useState(false)
  const [confirmCook, setConfirmCook] = useState(false)
  const [recipe, setRecipe] = useState<RecipeView | null>(null)
  const [recent, setRecent] = useState<RecipeSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const reloadRecent = useCallback(async () => {
    const data = await getRecipes()
    setRecent(data.recipes)
  }, [])

  useEffect(() => {
    setRecipe(null)
    setRecent([])
    setActionError(null)
    setSuccess(null)
    setConfirmCook(false)
  }, [householdId])

  useEffect(() => {
    if (!householdId) {
      return
    }

    let cancelled = false

    async function load() {
      setStatus('loading')
      setLoadError(null)
      try {
        await reloadRecent()
        if (!cancelled) {
          setStatus('ready')
        }
      } catch (cause) {
        if (!cancelled) {
          setStatus('error')
          setLoadError(mapPantryApiError(cause))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [householdId, reloadRecent])

  async function handleGenerate(event: FormEvent) {
    event.preventDefault()
    if (generating) {
      return
    }

    setGenerating(true)
    setActionError(null)
    setSuccess(null)
    try {
      const result = await generateRecipe({
        servings,
        mode,
        ...(maxCalories ? { maxCaloriesPerServing: Number(maxCalories) } : {}),
        ...(minProtein ? { minProteinPerServing: Number(minProtein) } : {}),
        ...(maxTime ? { maxTimeMinutes: Number(maxTime) } : {}),
        ...(preference.trim() ? { preference: preference.trim() } : {}),
      })
      setRecipe(result.recipe)
      await reloadRecent()
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    } finally {
      setGenerating(false)
    }
  }

  async function handleOpenRecent(id: string) {
    setActionError(null)
    setSuccess(null)
    try {
      const result = await getRecipe(id)
      setRecipe(result.recipe)
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    }
  }

  async function handleCook() {
    if (!recipe || cooking) {
      return
    }

    setCooking(true)
    setActionError(null)
    try {
      await cookRecipe(recipe.id)
      setConfirmCook(false)
      setSuccess('Ingredientele au fost scăzute din inventar.')
      await reloadRecent()
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
      setConfirmCook(false)
    } finally {
      setCooking(false)
    }
  }

  const emptyInventory = actionError === EMPTY_INVENTORY_MESSAGE

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">Gătește cu Pantry</h1>
      <p className="mt-2 text-muted">Primește idei din ce ai deja în casă.</p>
      {household ? (
        <p className="mt-1 text-sm text-muted">Casa activă: {household.name}</p>
      ) : null}

      <form className="mt-6 space-y-4" onSubmit={handleGenerate}>
        <label className="block text-sm font-medium" htmlFor={servingsId}>
          Porții
          <input
            id={servingsId}
            className={fieldClassName}
            type="number"
            min={1}
            max={8}
            value={servings}
            disabled={generating}
            onChange={(event) => setServings(Number(event.target.value))}
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Mod</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {MODE_OPTIONS.map((option) => {
              const active = mode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={generating}
                  onClick={() => setMode(option.value)}
                  className={`h-touch min-h-touch rounded-lg border px-2 text-sm font-medium ${
                    active
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-surface text-text'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="block text-sm font-medium" htmlFor={caloriesId}>
          Max. kcal / porție
          <input
            id={caloriesId}
            className={fieldClassName}
            type="number"
            min={1}
            max={5000}
            inputMode="numeric"
            value={maxCalories}
            disabled={generating}
            onChange={(event) => setMaxCalories(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium" htmlFor={proteinId}>
          Min. proteine / porție
          <input
            id={proteinId}
            className={fieldClassName}
            type="number"
            min={1}
            max={250}
            inputMode="numeric"
            value={minProtein}
            disabled={generating}
            onChange={(event) => setMinProtein(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium" htmlFor={timeId}>
          Timp maxim
          <input
            id={timeId}
            className={fieldClassName}
            type="number"
            min={1}
            max={240}
            inputMode="numeric"
            value={maxTime}
            disabled={generating}
            onChange={(event) => setMaxTime(event.target.value)}
          />
        </label>

        <label className="block text-sm font-medium" htmlFor={preferenceId}>
          Ce ai poftă?
          <input
            id={preferenceId}
            className={fieldClassName}
            type="text"
            maxLength={200}
            placeholder="Ex: ceva rapid cu ouă"
            value={preference}
            disabled={generating}
            onChange={(event) => setPreference(event.target.value)}
          />
        </label>

        <button
          type="submit"
          disabled={generating}
          className="flex h-touch min-h-touch w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
        >
          {generating ? <LoaderCircle className="size-4 animate-spin" /> : <ChefHat className="size-4" />}
          Generează rețetă
        </button>
      </form>

      {generating ? (
        <p className="mt-4 text-sm text-muted" aria-live="polite">
          Pantry pregătește o idee din inventarul tău...
        </p>
      ) : null}

      {actionError ? (
        <div className="mt-4 rounded-lg border border-border bg-surface p-3 text-sm text-destructive">
          <p>{actionError}</p>
          {emptyInventory ? (
            <div className="mt-3 flex gap-2">
              <Link
                to="/inventory"
                className="inline-flex h-touch min-h-touch items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-foreground"
              >
                Inventar
              </Link>
              <Link
                to="/scan"
                className="inline-flex h-touch min-h-touch items-center rounded-lg border border-border px-3 text-sm font-medium"
              >
                Scan
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {success ? (
        <p className="mt-4 text-sm text-success" aria-live="polite">
          {success}{' '}
          <Link to="/inventory" className="font-medium text-accent underline">
            Vezi inventarul
          </Link>
        </p>
      ) : null}

      {recipe ? (
        <article className="mt-6 rounded-xl border border-border bg-surface p-4 shadow-surface">
          <h2 className="text-xl font-semibold tracking-tight">{recipe.title}</h2>
          {recipe.description ? <p className="mt-1 text-sm text-muted">{recipe.description}</p> : null}
          <p className="mt-2 text-sm text-muted">
            {recipe.servings} {recipe.servings === 1 ? 'porție' : 'porții'}
            {recipe.timeMinutes ? ` · ${recipe.timeMinutes} min` : ''}
          </p>

          <h3 className="mt-4 text-sm font-semibold">Ingrediente</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {recipe.ingredients.map((ingredient, index) => (
              <li key={`${ingredient.productId ?? ingredient.name}-${index}`}>
                {ingredient.name} · {formatQuantity(ingredient.quantity, ingredient.unit)}
              </li>
            ))}
          </ul>

          <h3 className="mt-4 text-sm font-semibold">Mod de preparare</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            {recipe.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          {recipe.notes ? <p className="mt-3 text-sm text-muted">{recipe.notes}</p> : null}

          <section className="mt-4 rounded-lg bg-background p-3">
            {recipe.nutrition.complete ? (
              <>
                <h3 className="text-sm font-semibold">Per porție</h3>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted">kcal</dt>
                    <dd>{nutrientLabel(recipe.nutrition.perServing.kcal, '')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">proteine</dt>
                    <dd>{nutrientLabel(recipe.nutrition.perServing.protein, 'g')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">carbohidrați</dt>
                    <dd>{nutrientLabel(recipe.nutrition.perServing.carbs, 'g')}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">grăsimi</dt>
                    <dd>{nutrientLabel(recipe.nutrition.perServing.fat, 'g')}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-warning">Valorile nutriționale sunt incomplete.</p>
                <p className="mt-1 text-sm text-muted">
                  {recipe.nutrition.calculableIngredients} din {recipe.nutrition.totalIngredients} ingrediente pot
                  fi calculate.
                </p>
                {recipe.constraintVerification === 'incomplete' ? (
                  <p className="mt-1 text-sm text-muted">
                    Ținta de calorii sau proteine nu a putut fi verificată complet.
                  </p>
                ) : null}
              </>
            )}
          </section>

          <button
            type="button"
            className="mt-4 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground shadow-surface disabled:opacity-60"
            onClick={() => setConfirmCook(true)}
            disabled={cooking}
          >
            Gătește și scade din stoc
          </button>
        </article>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Rețete recente</h2>
        {status === 'loading' ? (
          <p className="mt-2 text-sm text-muted">Se încarcă...</p>
        ) : null}
        {loadError ? <p className="mt-2 text-sm text-destructive">{loadError}</p> : null}
        {status === 'ready' && recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Încă nu ai rețete generate în această casă. Completează formularul de mai sus și apasă Generează rețetă.
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {recent.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="flex min-h-touch w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-left shadow-surface"
                onClick={() => void handleOpenRecent(entry.id)}
              >
                <span className="font-medium">{entry.title}</span>
                <span className="text-sm text-muted">
                  {entry.servings} {entry.servings === 1 ? 'porție' : 'porții'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {confirmCook && recipe ? (
        <InventorySheet title="Confirmă gătitul" onClose={() => setConfirmCook(false)}>
          <p className="text-sm text-muted">
            Pantry va scădea ingredientele folosite din inventar folosind loturile care expiră primele.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex h-touch min-h-touch flex-1 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium"
              onClick={() => setConfirmCook(false)}
              disabled={cooking}
            >
              Anulează
            </button>
            <button
              type="button"
              className="flex h-touch min-h-touch flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
              onClick={() => void handleCook()}
              disabled={cooking}
            >
              {cooking ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Gătește
            </button>
          </div>
        </InventorySheet>
      ) : null}
    </section>
  )
}
