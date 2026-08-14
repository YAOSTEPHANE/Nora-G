/** Identifiant d’exploitation affiché sur reçus et rapports (démo). */
export const SESSION_ID = '0035'

const KEY_TERMINAL_ID = 'nora-terminal-id'
const KEY_TERMINAL_LABEL = 'nora-terminal-label'

export function getOrCreateTerminalId(): string {
  try {
    const existing = localStorage.getItem(KEY_TERMINAL_ID)
    if (existing) return existing
    const created = `T-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    localStorage.setItem(KEY_TERMINAL_ID, created)
    return created
  } catch {
    return `T-${SESSION_ID}`
  }
}

export function getOrCreateTerminalLabel(): string {
  return getTerminalLabel()
}

export function getTerminalLabel(): string {
  try {
    const existing = localStorage.getItem(KEY_TERMINAL_LABEL)
    if (existing) return existing
    const label = `Terminal ${SESSION_ID}`
    localStorage.setItem(KEY_TERMINAL_LABEL, label)
    return label
  } catch {
    return `Terminal ${SESSION_ID}`
  }
}

export function setTerminalLabel(label: string): void {
  try {
    localStorage.setItem(KEY_TERMINAL_LABEL, label.trim() || `Terminal ${SESSION_ID}`)
  } catch {
    /* ignore */
  }
}

export function getTerminalId(): string {
  return getOrCreateTerminalId()
}
