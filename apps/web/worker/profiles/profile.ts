export type ProfileIdentity = {
  id: string
  name: string
}

export type Profile = {
  id: string
  displayName: string
  avatarUrl: string | null
  locale: string
}

type ProfileRow = {
  id: string
  display_name: string
  avatar_url: string | null
  locale: string
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? null,
    locale: row.locale,
  }
}

/**
 * Idempotent profile guarantee for a Better Auth user already resolved server-side.
 * Never call this with a client-supplied user id.
 */
export async function ensureProfile(db: D1Database, user: ProfileIdentity): Promise<Profile> {
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO profiles (id, display_name, avatar_url, locale, created_at, updated_at)
       VALUES (?1, ?2, NULL, 'ro', ?3, ?3)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(user.id, user.name, now)
    .run()

  const row = await db
    .prepare(`SELECT id, display_name, avatar_url, locale FROM profiles WHERE id = ?1`)
    .bind(user.id)
    .first<ProfileRow>()

  if (!row) {
    throw new Error('profile missing after ensure')
  }

  return toProfile(row)
}
