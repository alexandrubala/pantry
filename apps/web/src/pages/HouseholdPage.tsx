import { LoaderCircle, MoreHorizontal, UserRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { InventorySheet } from '../components/inventory/InventorySheet'
import { useHousehold } from '../household/HouseholdProvider'
import { isPantryApiError } from '../lib/api'
import { canUseWebShare, inviteSharePayload, inviteUrl } from '../lib/invite-share'
import { mapPantryApiError } from '../lib/pantry-api-error'
import {
  createHouseholdInvite,
  getHouseholdInvites,
  getHouseholdMembers,
  leaveHousehold,
  removeHouseholdMember,
  revokeHouseholdInvite,
  type HouseholdInviteView,
  type HouseholdMemberView,
} from '../lib/pantry-api'

function roleLabel(role: HouseholdMemberView['role']) {
  return role === 'owner' ? 'Proprietar' : 'Membru'
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatInviteDate(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return value
  }

  return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium' }).format(new Date(parsed))
}

export function HouseholdPage() {
  const navigate = useNavigate()
  const { household, reload } = useHousehold()
  const [members, setMembers] = useState<HouseholdMemberView[]>([])
  const [invites, setInvites] = useState<HouseholdInviteView[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [createdInvite, setCreatedInvite] = useState<{ token: string } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<HouseholdMemberView | null>(null)
  const [leaveOpen, setLeaveOpen] = useState(false)
  const [shareSupported] = useState(() => canUseWebShare())

  const isOwner = household?.role === 'owner'
  const householdId = household?.id ?? null

  const load = useCallback(async () => {
    const membersResponse = await getHouseholdMembers()
    setMembers(membersResponse.members)
    if (isOwner) {
      const invitesResponse = await getHouseholdInvites()
      setInvites(invitesResponse.invites.filter((invite) => invite.status === 'pending'))
    } else {
      setInvites([])
    }
  }, [isOwner])

  useEffect(() => {
    if (!householdId) {
      return
    }

    let cancelled = false

    async function refresh() {
      setStatus('loading')
      setLoadError(null)
      try {
        await load()
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

    void refresh()
    return () => {
      cancelled = true
    }
  }, [householdId, load])

  async function handleCreateInvite() {
    if (inviteBusy) {
      return
    }

    setActionError(null)
    setCopied(false)
    setInviteBusy(true)
    try {
      const created = await createHouseholdInvite()
      setCreatedInvite({ token: created.invite.token })
      await load()
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleCopy(token: string) {
    const url = inviteUrl(window.location.origin, token)
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  async function handleShare(token: string) {
    if (!household || !shareSupported) {
      return
    }

    const url = inviteUrl(window.location.origin, token)
    try {
      await navigator.share(inviteSharePayload(household.name, url))
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setActionError(mapPantryApiError(error))
    }
  }

  async function handleRevoke(inviteId: string) {
    setActionError(null)
    try {
      await revokeHouseholdInvite(inviteId)
      await load()
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    }
  }

  async function handleRemove() {
    if (!removeTarget) {
      return
    }

    setActionError(null)
    try {
      await removeHouseholdMember(removeTarget.userId)
      setRemoveTarget(null)
      await load()
    } catch (cause) {
      setActionError(mapPantryApiError(cause))
    }
  }

  async function handleLeave() {
    setActionError(null)
    try {
      await leaveHousehold()
      await reload()
      await navigate('/onboarding', { replace: true })
    } catch (cause) {
      if (isPantryApiError(cause) && cause.code === 'OWNER_CANNOT_LEAVE') {
        setLeaveOpen(false)
      }
      setActionError(mapPantryApiError(cause))
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{household?.name ?? 'Casa'}</h1>
      <p className="mt-1 text-sm text-muted">Membri și acces</p>

      {status === 'loading' ? (
        <div className="mt-8 flex justify-center">
          <LoaderCircle className="size-6 animate-spin text-muted" aria-hidden="true" />
        </div>
      ) : null}
      {status === 'error' ? <p className="mt-6 text-sm text-destructive">{loadError}</p> : null}

      {status === 'ready' ? (
        <>
          {isOwner ? (
            <button
              type="button"
              disabled={inviteBusy}
              className="mt-6 flex h-touch min-h-touch w-full items-center justify-center rounded-lg bg-accent px-4 font-medium text-accent-foreground shadow-surface disabled:opacity-60"
              onClick={() => {
                void handleCreateInvite()
              }}
            >
              {inviteBusy ? 'Se creează invitația...' : 'Invită persoană'}
            </button>
          ) : null}

          <section className="mt-8">
            <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Membri</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-elevated p-3"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-accent">
                    {initials(member.name) || <UserRound className="size-5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {member.name}
                      {member.isCurrentUser ? <span className="ml-1 text-sm font-normal text-muted">Tu</span> : null}
                    </p>
                    <p className="truncate text-sm text-muted">{member.email}</p>
                    <p className="mt-0.5 text-sm text-muted">{roleLabel(member.role)}</p>
                  </div>
                  {isOwner && member.role === 'member' ? (
                    <button
                      type="button"
                      className="flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted"
                      aria-label={`Elimină pe ${member.name}`}
                      onClick={() => setRemoveTarget(member)}
                    >
                      <MoreHorizontal className="size-5" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {isOwner && invites.length > 0 ? (
            <section className="mt-8">
              <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Invitații active</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {invites.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated p-3"
                  >
                    <div>
                      <p className="text-sm text-text">Creată {formatInviteDate(invite.createdAt)}</p>
                      <p className="text-sm text-muted">Expiră {formatInviteDate(invite.expiresAt)}</p>
                    </div>
                    <button
                      type="button"
                      className="text-sm font-medium text-destructive"
                      onClick={() => {
                        void handleRevoke(invite.id)
                      }}
                    >
                      Anulează
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {isOwner ? (
            <p className="mt-8 text-sm text-muted">Transferul proprietății va fi disponibil ulterior.</p>
          ) : (
            <button
              type="button"
              className="mt-8 flex h-touch min-h-touch w-full items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-destructive"
              onClick={() => setLeaveOpen(true)}
            >
              Părăsește casa
            </button>
          )}

          {actionError ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          ) : null}
        </>
      ) : null}

      {createdInvite && household ? (
        <InventorySheet title={`Invită în ${household.name}`} onClose={() => setCreatedInvite(null)}>
          <p className="text-sm text-muted">
            Oricine primește acest link și are un cont Pantry îl poate folosi pentru a intra în household.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {shareSupported ? (
              <button
                type="button"
                className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-accent px-4 font-medium text-accent-foreground"
                onClick={() => {
                  void handleShare(createdInvite.token)
                }}
              >
                Distribuie
              </button>
            ) : null}
            <button
              type="button"
              className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 font-medium text-text"
              onClick={() => {
                void handleCopy(createdInvite.token)
              }}
            >
              Copiază link
            </button>
          </div>
          {copied ? <p className="mt-3 text-sm text-success">Link copiat</p> : null}
          <p className="mt-3 text-sm text-muted">Linkul expiră în 7 zile.</p>
        </InventorySheet>
      ) : null}

      {removeTarget ? (
        <InventorySheet title="Elimină din casă" onClose={() => setRemoveTarget(null)}>
          <p className="text-sm text-muted">
            {removeTarget.name} nu va mai avea acces la inventarul și lista acestei case.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-destructive px-4 font-medium text-accent-foreground"
              onClick={() => {
                void handleRemove()
              }}
            >
              Elimină din casă
            </button>
            <button
              type="button"
              className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 font-medium text-text"
              onClick={() => setRemoveTarget(null)}
            >
              Anulează
            </button>
          </div>
        </InventorySheet>
      ) : null}

      {leaveOpen ? (
        <InventorySheet title="Părăsește casa" onClose={() => setLeaveOpen(false)}>
          <p className="text-sm text-muted">
            Nu vei mai avea acces la inventarul și lista acestei case. Contul tău Pantry rămâne.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="flex h-touch min-h-touch items-center justify-center rounded-lg bg-destructive px-4 font-medium text-accent-foreground"
              onClick={() => {
                void handleLeave()
              }}
            >
              Părăsește casa
            </button>
            <button
              type="button"
              className="flex h-touch min-h-touch items-center justify-center rounded-lg border border-border px-4 font-medium text-text"
              onClick={() => setLeaveOpen(false)}
            >
              Anulează
            </button>
          </div>
        </InventorySheet>
      ) : null}
    </section>
  )
}
