/**
 * Migration one-shot : copie localStorage de l’ancien préfixe produit → `nora*`.
 * Les bases IndexedDB déjà mappées restent valides via le mapping org → databaseName.
 */
const MIGRATION_FLAG = 'nora-storage-migrated-v1'
const LEGACY_PREFIX = 'caisseci'

export function migrateLegacyStorage(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === '1') return

    const keys = Object.keys(localStorage)
    for (const key of keys) {
      if (!key.startsWith(LEGACY_PREFIX)) continue
      const next = key
        .replace(new RegExp(`^${LEGACY_PREFIX}:`), 'nora:')
        .replace(new RegExp(`^${LEGACY_PREFIX}-`), 'nora-')
        .replace(new RegExp(`^${LEGACY_PREFIX}$`), 'nora')
      if (next === key) continue
      if (localStorage.getItem(next) !== null) continue
      const value = localStorage.getItem(key)
      if (value === null) continue
      localStorage.setItem(next, value)
    }

    localStorage.setItem(MIGRATION_FLAG, '1')
  } catch {
    // private mode / quota
  }
}
