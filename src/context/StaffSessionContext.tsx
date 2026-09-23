'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { effectivePermissions } from '../auth/permissions'
import {
  clearStaffSession,
  getStaffSession,
  setStaffSession,
} from '../auth/session'
import type { StaffAuthMethod, StaffProfile } from '../auth/types'
import { ensureSeed } from '../db/db'
import { getAppSettings } from '../lib/appSettings'
import { ensureDefaultProductFormSections } from '../lib/productFormSections'

type StaffWithProfile = NonNullable<ReturnType<typeof getStaffSession>>

type StaffSessionContextValue = {
  staff: StaffWithProfile | null
  seedReady: boolean
  seedError: string | null
  showStaffLogin: boolean
  canSwitchStore: boolean
  setShowStaffLogin: (value: boolean) => void
  handleLogin: (profile: StaffProfile, authMethod: StaffAuthMethod) => void
  handleLogout: () => void
  clearStaff: () => void
  retrySeed: () => void
}

const StaffSessionContext = createContext<StaffSessionContextValue | null>(null)

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  // Session staff = localStorage : hydrater après mount pour éviter mismatch SSR.
  const [staff, setStaff] = useState<StaffWithProfile | null>(null)
  const [seedReady, setSeedReady] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedAttempt, setSeedAttempt] = useState(0)
  const [showStaffLogin, setShowStaffLogin] = useState(false)

  useEffect(() => {
    setStaff(getStaffSession())
  }, [])

  useEffect(() => {
    let cancelled = false
    void ensureSeed()
      .then(async () => {
        await ensureDefaultProductFormSections(getAppSettings().businessDomain)
      })
      .then(() => {
        if (!cancelled) {
          setSeedError(null)
          setSeedReady(true)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSeedError(
            error instanceof Error
              ? error.message
              : 'Impossible d’initialiser les données locales.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [seedAttempt])

  const handleLogin = useCallback(
    (profile: StaffProfile, authMethod: StaffAuthMethod) => {
      setStaffSession(profile.id, authMethod)
      setStaff(getStaffSession())
      setShowStaffLogin(false)
    },
    [],
  )

  const clearStaff = useCallback(() => {
    clearStaffSession()
    setStaff(null)
    setShowStaffLogin(false)
  }, [])

  const handleLogout = useCallback(() => {
    clearStaff()
  }, [clearStaff])

  const retrySeed = useCallback(() => {
    setSeedError(null)
    setSeedAttempt((attempt) => attempt + 1)
  }, [])

  const canSwitchStore = useMemo(() => {
    if (!staff) return false
    return effectivePermissions(staff.profile).canSwitchStore
  }, [staff])

  const value = useMemo(
    () => ({
      staff,
      seedReady,
      seedError,
      showStaffLogin,
      canSwitchStore,
      setShowStaffLogin,
      handleLogin,
      handleLogout,
      clearStaff,
      retrySeed,
    }),
    [
      staff,
      seedReady,
      seedError,
      showStaffLogin,
      canSwitchStore,
      handleLogin,
      handleLogout,
      clearStaff,
      retrySeed,
    ],
  )

  return (
    <StaffSessionContext.Provider value={value}>
      {children}
    </StaffSessionContext.Provider>
  )
}

export function useStaffSession(): StaffSessionContextValue {
  const ctx = useContext(StaffSessionContext)
  if (!ctx) {
    throw new Error('useStaffSession doit être utilisé dans StaffSessionProvider')
  }
  return ctx
}
