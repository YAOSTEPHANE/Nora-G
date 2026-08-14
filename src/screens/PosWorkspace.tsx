'use client'

import { LoginScreen } from '../components/LoginScreen'
import { OfflineBanner } from '../components/OfflineBanner'
import { ActiveStoreProvider } from '../context/ActiveStoreContext'
import { useStaffSession } from '../context/StaffSessionContext'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { ROUTES, useSitePath } from '../lib/siteRoutes'
import { Shell } from '../Shell'
import { SubscriptionLoadingGate } from './SubscriptionLoadingGate'

/**
 * Espace caisse : login PIN staff puis Shell.
 * Plus de tunnel SaaS (email / mot de passe organisation).
 */
export function PosWorkspace({ mode: _mode }: { mode: 'storefront' | 'staff' }) {
  const online = useOnlineStatus()
  const {
    staff,
    seedReady,
    seedError,
    canSwitchStore,
    handleLogin,
    handleLogout,
    retrySeed,
  } = useStaffSession()
  const [, navigate] = useSitePath()

  return (
    <SubscriptionLoadingGate>
      <ActiveStoreProvider canSwitchStore={canSwitchStore}>
        {!staff ? (
          <div className="flex h-svh min-h-0 flex-col overflow-hidden">
            {!online ? <OfflineBanner /> : null}
            <div className="flex min-h-0 flex-1 flex-col">
              <LoginScreen onSuccess={handleLogin} />
            </div>
          </div>
        ) : !seedReady ? (
          <div className="flex min-h-svh flex-col bg-zinc-50">
            {!online ? <OfflineBanner /> : null}
            <div className="flex flex-1 flex-col items-center justify-center gap-4">
              {seedError ? (
                <>
                  <p className="max-w-md text-center text-sm font-semibold text-rose-700">
                    Initialisation impossible : {seedError}
                  </p>
                  <button
                    type="button"
                    onClick={retrySeed}
                    className="ui-btn ui-btn-primary"
                  >
                    Réessayer
                  </button>
                </>
              ) : (
                <>
                  <div className="h-12 w-12 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
                  <p className="text-sm font-semibold text-zinc-700">
                    Chargement de la caisse…
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  handleLogout()
                  navigate(ROUTES.staff)
                }}
                className="ui-btn ui-btn-ghost"
              >
                Changer de profil
              </button>
            </div>
          </div>
        ) : (
          <Shell
            staff={staff.profile}
            online={online}
            onLogout={() => {
              handleLogout()
              navigate(ROUTES.staff)
            }}
          />
        )}
      </ActiveStoreProvider>
    </SubscriptionLoadingGate>
  )
}

export function StaffScreen() {
  return <PosWorkspace mode="staff" />
}
