import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router'
import type { ActiveHousehold, HouseholdSummary, LocationRecord } from '@pantry/core'
import { isPantryApiError } from '../lib/api'
import {
  createHousehold as createHouseholdRequest,
  createLocation as createLocationRequest,
  getActiveHousehold,
  getHouseholds,
  getLocations,
  setActiveHousehold,
} from '../lib/pantry-api'

type HouseholdStatus = 'loading' | 'ready' | 'error'

type HouseholdContextValue = {
  status: HouseholdStatus
  household: ActiveHousehold | null
  households: HouseholdSummary[]
  locations: LocationRecord[]
  error: string | null
  reload: () => Promise<void>
  createHousehold: (name: string) => Promise<void>
  addLocation: (name: string) => Promise<void>
  switchHousehold: (householdId: string) => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<HouseholdStatus>('loading')
  const [household, setHousehold] = useState<ActiveHousehold | null>(null)
  const [households, setHouseholds] = useState<HouseholdSummary[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const active = await getActiveHousehold()
    const list = await getHouseholds()
    setHousehold(active.household)
    setHouseholds(list.households)

    if (!active.household) {
      setLocations([])
      return
    }

    const currentLocations = await getLocations()
    setLocations(currentLocations.locations)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setStatus('loading')
      setError(null)
      try {
        await reload()
        if (!cancelled) {
          setStatus('ready')
        }
      } catch (cause) {
        if (cancelled) {
          return
        }

        if (isPantryApiError(cause) && cause.status === 401) {
          await navigate('/login', { replace: true })
          return
        }

        setStatus('error')
        setError('Nu am putut încărca casa.')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [navigate, reload])

  const createHousehold = useCallback(
    async (name: string) => {
      await createHouseholdRequest(name)
      await reload()
    },
    [reload],
  )

  const addLocation = useCallback(
    async (name: string) => {
      const created = await createLocationRequest(name)
      setLocations((current) =>
        [...current, created.location].sort((left, right) => {
          if (left.sortOrder !== right.sortOrder) {
            return left.sortOrder - right.sortOrder
          }
          return left.name.localeCompare(right.name, 'ro')
        }),
      )
    },
    [],
  )

  const switchHousehold = useCallback(
    async (householdId: string) => {
      await setActiveHousehold(householdId)
      await reload()
    },
    [reload],
  )

  const value = useMemo<HouseholdContextValue>(
    () => ({
      status,
      household,
      households,
      locations,
      error,
      reload,
      createHousehold,
      addLocation,
      switchHousehold,
    }),
    [
      addLocation,
      createHousehold,
      error,
      household,
      households,
      locations,
      reload,
      status,
      switchHousehold,
    ],
  )

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
}

export function useHousehold(): HouseholdContextValue {
  const value = useContext(HouseholdContext)
  if (!value) {
    throw new Error('useHousehold requires HouseholdProvider')
  }

  return value
}
