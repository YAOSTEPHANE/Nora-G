const KEY = 'nora-last-cloud-sync-at'

export function getLastSyncTimestamp(): number | null {
  try {
    const s = localStorage.getItem(KEY)
    if (!s) return null
    const n = Number.parseInt(s, 10)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setLastSyncTimestamp(t: number): void {
  try {
    localStorage.setItem(KEY, String(t))
  } catch {
    /* quota / mode privé */
  }
}

export function formatLastSyncRelative(ts: number | null): string {
  if (ts == null) return 'Jamais synchronisé'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'À l’instant'
  if (diff < 3600_000) return `Il y a ${Math.floor(diff / 60_000)} min`
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
