const STORAGE_KEY = 'nora-pos-quick-favorites'
const MAX_FAVORITES = 12

function readIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_FAVORITES)
  } catch {
    return []
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, MAX_FAVORITES)))
  } catch {
    /* ignore quota */
  }
}

export function getQuickSaleFavoriteIds(): string[] {
  return readIds()
}

export function isQuickSaleFavorite(productId: string): boolean {
  return readIds().includes(productId)
}

export function toggleQuickSaleFavorite(productId: string): string[] {
  const cur = readIds()
  const i = cur.indexOf(productId)
  let next: string[]
  if (i >= 0) {
    next = cur.filter((id) => id !== productId)
  } else {
    next = [productId, ...cur].slice(0, MAX_FAVORITES)
  }
  writeIds(next)
  return next
}

export function setQuickSaleFavoriteIds(ids: string[]) {
  writeIds(ids)
}
