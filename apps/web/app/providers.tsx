'use client'

import { useEffect } from 'react'

import { ToastProvider } from '../src/ui/Toast'
import { SitePathProvider } from './SitePathProvider'
import { SubscriptionProvider } from '../src/context/SubscriptionContext'
import { StaffSessionProvider } from '../src/context/StaffSessionContext'
import { SiteBrandingProvider } from '../src/context/SiteBrandingContext'
import { useOnlineStatus } from '../src/hooks/useOnlineStatus'
import { initClientSentry } from '../src/lib/sentry'
import { migrateLegacyStorage } from '../src/lib/migrateLegacyStorage'

function OnlineSubscription({ children }: { children: React.ReactNode }) {
  const online = useOnlineStatus()
  return (
    <SubscriptionProvider online={online}>
      <StaffSessionProvider>{children}</StaffSessionProvider>
    </SubscriptionProvider>
  )
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    migrateLegacyStorage()
    initClientSentry()
    // SW / caches d’une ancienne build (ou d’un autre projet sur :3000) servent des chunks
    // fantômes (ex. components/ui/custom-cursor.tsx) → ReactCurrentDispatcher / Lazy undefined.
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'development') return
    const clearStaleClient = async () => {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((reg) => reg.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    }
    void clearStaleClient()
  }, [])

  return (
    <ToastProvider>
      <SitePathProvider>
        <SiteBrandingProvider>
          <OnlineSubscription>{children}</OnlineSubscription>
        </SiteBrandingProvider>
      </SitePathProvider>
    </ToastProvider>
  )
}
