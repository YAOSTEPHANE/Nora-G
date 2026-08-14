/* Provider et hook partagent le même contexte typé. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { NavViewId } from '../navigation'
import { ROUTES } from '../lib/siteRoutes'
import { refreshSubscription } from '../lib/subscription/api'
import { pullCloudData } from '../lib/cloudPull'
import {
  clearOrganizationCredentials,
  getCachedSubscription,
  getOrganizationCredentials,
  setCachedSubscription,
  setOrganizationCredentials,
} from '../lib/subscription/store'
import type { OrganizationCredentials, PlanId, SubscriptionSnapshot } from '../lib/subscription/types'

type SubscriptionContextValue = {
  ready: boolean
  organization: OrganizationCredentials | null
  subscription: SubscriptionSnapshot | null
  usable: boolean
  online: boolean
  completeOnboarding: (snap: SubscriptionSnapshot) => void
  refresh: () => Promise<void>
  disconnect: () => void
  canAccessView: (view: NavViewId) => boolean
  hasPlan: (planId: PlanId) => boolean
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({
  online,
  children,
}: {
  online: boolean
  children: ReactNode
}) {
  // Ne pas lire localStorage dans useState : SSR et 1er paint client doivent
  // matcher (sinon hydration mismatch sur /staff, /connexion, etc.).
  const [ready, setReady] = useState(false)
  const [organization, setOrganization] = useState<OrganizationCredentials | null>(
    null,
  )
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(
    null,
  )

  const applySnapshot = useCallback((snap: SubscriptionSnapshot) => {
    const unlocked = { ...snap, usable: true, planId: 'business' as const }
    setSubscription(unlocked)
    setCachedSubscription(unlocked)
    const creds = {
      licenseKey: snap.licenseKey,
      sessionToken: snap.sessionToken,
      organizationId: snap.organizationId,
      name: snap.name,
      storeCode: snap.storeCode,
    }
    setOrganization(creds)
    setOrganizationCredentials(creds)
  }, [])

  const refresh = useCallback(async () => {
    const creds = getOrganizationCredentials()
    if (!creds) return
    try {
      const snap = await refreshSubscription(creds.licenseKey)
      applySnapshot(snap)
    } catch {
      const cached = getCachedSubscription()
      if (cached) setSubscription({ ...cached, usable: true })
    }
  }, [applySnapshot])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      const creds = getOrganizationCredentials()
      const cached = getCachedSubscription()
      if (!cancelled) {
        setOrganization(creds)
        setSubscription(cached ? { ...cached, usable: true } : null)
        setReady(true)
      }

      if (!creds || !online) return

      try {
        const snap = await refreshSubscription(creds.licenseKey)
        if (!cancelled) applySnapshot(snap)
        if (!cancelled) void pullCloudData().catch(() => undefined)
      } catch {
        const cachedSnap = getCachedSubscription()
        if (!cancelled && cachedSnap) {
          setSubscription({ ...cachedSnap, usable: true })
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [applySnapshot, online])

  useEffect(() => {
    if (!online || !organization) return
    const id = window.setInterval(() => {
      void refresh()
    }, 15 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [online, organization, refresh])

  const completeOnboarding = useCallback(
    (snap: SubscriptionSnapshot) => {
      applySnapshot(snap)
      // Recharge l'application afin que Dexie ouvre la base isolée de l'organisation.
      window.location.assign(ROUTES.staff)
    },
    [applySnapshot],
  )

  const disconnect = useCallback(() => {
    clearOrganizationCredentials()
    setOrganization(null)
    setSubscription(null)
  }, [])

  const usable = Boolean(organization)

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      ready,
      organization,
      subscription,
      usable,
      online,
      completeOnboarding,
      refresh,
      disconnect,
      canAccessView: () => true,
      hasPlan: () => true,
    }),
    [
      ready,
      organization,
      subscription,
      usable,
      online,
      completeOnboarding,
      refresh,
      disconnect,
    ],
  )

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) {
    throw new Error('useSubscription doit être utilisé dans SubscriptionProvider')
  }
  return ctx
}
