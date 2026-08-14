const STORAGE_KEY = 'nora-receipt-logo-url'

/** Ancien cache logo vitrine — conservé pour le vider. */
export function getCachedReceiptLogoUrl(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim()
    if (!raw) return null
    if (
      raw.startsWith('data:image/') ||
      raw.startsWith('https://') ||
      raw.startsWith('http://') ||
      raw.startsWith('/')
    ) {
      return raw
    }
    return null
  } catch {
    return null
  }
}

export function setCachedReceiptLogoUrl(url: string | null | undefined): void {
  try {
    const trimmed = url?.trim()
    if (!trimmed) {
      localStorage.removeItem(STORAGE_KEY)
      return
    }
    localStorage.setItem(STORAGE_KEY, trimmed)
  } catch {
    /* quota / private mode */
  }
}

/** Les tickets n’affichent plus le logo vitrine. */
export async function resolveReceiptLogoUrl(): Promise<string | null> {
  setCachedReceiptLogoUrl(null)
  return null
}
