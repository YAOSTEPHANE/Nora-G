import { profileById } from './profiles'
import type { StaffAuthMethod, StaffProfile, StaffSession } from './types'

const KEY = 'nora-staff-session'

function readRaw(): StaffSession | null {
  if (typeof window === 'undefined') return null
  try {
    const s = sessionStorage.getItem(KEY)
    if (!s) return null
    const o = JSON.parse(s) as unknown
    if (
      typeof o !== 'object' ||
      o === null ||
      typeof (o as StaffSession).profileId !== 'string' ||
      typeof (o as StaffSession).loggedAt !== 'number'
    ) {
      return null
    }
    const raw = o as StaffSession
    const authMethod =
      raw.authMethod === 'pin' || raw.authMethod === 'password'
        ? raw.authMethod
        : undefined
    return { profileId: raw.profileId, loggedAt: raw.loggedAt, authMethod }
  } catch {
    return null
  }
}

export function getStaffSession(): (StaffSession & { profile: StaffProfile }) | null {
  const raw = readRaw()
  if (!raw) return null
  const profile = profileById(raw.profileId)
  if (!profile) {
    clearStaffSession()
    return null
  }
  return { ...raw, profile }
}

export function setStaffSession(
  profileId: string,
  authMethod?: StaffAuthMethod,
): void {
  const payload: StaffSession = {
    profileId,
    loggedAt: Date.now(),
    ...(authMethod ? { authMethod } : {}),
  }
  sessionStorage.setItem(KEY, JSON.stringify(payload))
}

export function clearStaffSession(): void {
  sessionStorage.removeItem(KEY)
}
