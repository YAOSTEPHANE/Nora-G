import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { profileSecretMatches } from '../auth/permissions'
import {
  DEFAULT_OWNER_PIN,
  ensureOwnerAdminProfile,
  listActiveStaffProfiles,
  subscribeStaffProfiles,
} from '../auth/profiles'
import type { StaffAuthMethod, StaffProfile } from '../auth/types'
import { BrandLogo } from './BrandLogo'
import { useSubscription } from '../context/SubscriptionContext'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { IconDelete, IconEye, IconEyeOff } from '../ui/icons'

type Props = {
  onSuccess: (profile: StaffProfile, authMethod: StaffAuthMethod) => void
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 30_000
const PIN_LEN = 4
const PIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

export function LoginScreen({ onSuccess }: Props) {
  const { organization } = useSubscription()
  const [profiles, setProfiles] = useState<StaffProfile[]>(() =>
    listActiveStaffProfiles(),
  )
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [bootstrappedOwner, setBootstrappedOwner] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [cardReady, setCardReady] = useState(false)
  const [mode, setMode] = useState<'pin' | 'password'>('pin')

  useEffect(() => {
    if (listActiveStaffProfiles().length > 0) return
    const created = ensureOwnerAdminProfile(
      organization?.name ?? 'Administrateur',
    )
    if (created) {
      setBootstrappedOwner(true)
      setProfiles(listActiveStaffProfiles())
    }
  }, [organization?.name])

  useEffect(() => {
    return subscribeStaffProfiles(() => {
      setProfiles(listActiveStaffProfiles())
    })
  }, [])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setCardReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  const lockRemainingSec = useMemo(() => {
    if (lockedUntil <= now.getTime()) return 0
    return Math.ceil((lockedUntil - now.getTime()) / 1000)
  }, [lockedUntil, now])

  const orgLabel = organization?.name?.trim() || null
  const locked = lockRemainingSec > 0 || profiles.length === 0

  const attemptAuth = (rawSecret: string) => {
    if (lockRemainingSec > 0) {
      setError(`Trop d’essais. Patientez ${lockRemainingSec}s.`)
      setShakeKey((k) => k + 1)
      return
    }
    if (profiles.length === 0) {
      setError('Aucun profil disponible.')
      setShakeKey((k) => k + 1)
      return
    }

    const s = rawSecret.trim()
    if (!s) return

    const matched = profiles.find((p) => profileSecretMatches(p, s))
    if (!matched) {
      const nextFails = failedAttempts + 1
      setFailedAttempts(nextFails)
      setShakeKey((k) => k + 1)
      setSecret('')
      if (nextFails >= MAX_FAILED_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS)
        setFailedAttempts(0)
        setError('Compte verrouillé 30 secondes.')
      } else {
        setError(
          `Code incorrect · ${MAX_FAILED_ATTEMPTS - nextFails} restant(s)`,
        )
      }
      return
    }

    setFailedAttempts(0)
    setLockedUntil(0)
    setError(null)
    const authMethod: StaffAuthMethod =
      matched.password !== undefined && s === matched.password
        ? 'password'
        : 'pin'
    onSuccess(matched, authMethod)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    attemptAuth(secret)
  }

  const pushDigit = (digit: string) => {
    if (locked) return
    setError(null)
    setSecret((prev) => {
      if (prev.length >= 8) return prev
      const next = prev + digit
      if (next.length >= PIN_LEN) {
        window.setTimeout(() => attemptAuth(next), 50)
      }
      return next
    })
  }

  const clearDigit = () => {
    if (locked) return
    setSecret((prev) => prev.slice(0, -1))
    setError(null)
  }

  useEffect(() => {
    if (mode !== 'pin' || locked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        e.preventDefault()
        clearDigit()
        return
      }
      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        pushDigit(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, locked, failedAttempts, profiles, secret])

  const switchMode = (next: 'pin' | 'password') => {
    setMode(next)
    setSecret('')
    setError(null)
    setShowSecret(false)
  }

  return (
    <div className="login-shell">
      <div className="login-aurora" aria-hidden />
      <div className="login-brand-orb login-brand-orb--a" aria-hidden />
      <div className="login-brand-orb login-brand-orb--b" aria-hidden />
      <div className="login-brand-orb login-brand-orb--c" aria-hidden />
      <div className="login-brand-grid" aria-hidden />

      <main className="login-main">
        <div className="relative z-1 w-full">
          <div
            className={cn(
              'login-card',
              cardReady && 'login-card--in',
              shakeKey > 0 && error && 'login-card--shake',
            )}
            data-shake-parity={shakeKey % 2}
          >
            <header className="login-card-head">
              <BrandLogo size="md" ring="subtle" className="login-logo-glow" />
              {orgLabel ? (
                <p className="login-card-org">{orgLabel}</p>
              ) : null}
              <h1 className="login-card-title">Ouvrir la caisse</h1>
              <p className="login-card-sub">
                {mode === 'pin'
                  ? 'Saisissez votre code PIN'
                  : 'Saisissez votre mot de passe'}
              </p>
            </header>

            {bootstrappedOwner ? (
              <p className="login-hint">
                Première connexion — code{' '}
                <span className="font-mono font-semibold tracking-wider">
                  {DEFAULT_OWNER_PIN}
                </span>
              </p>
            ) : null}

            <div className="login-mode-tabs" role="tablist" aria-label="Type d’accès">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'pin'}
                className={cn(
                  'login-mode-tab',
                  mode === 'pin' && 'login-mode-tab--on',
                )}
                onClick={() => switchMode('pin')}
              >
                PIN
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'password'}
                className={cn(
                  'login-mode-tab',
                  mode === 'password' && 'login-mode-tab--on',
                )}
                onClick={() => switchMode('password')}
              >
                Mot de passe
              </button>
            </div>

            {mode === 'pin' ? (
              <div className="login-pin-flow">
                <div
                  className={cn('login-pin-dots', error && 'login-pin-dots--err')}
                  aria-live="polite"
                  aria-label={`PIN : ${secret.length} chiffre(s)`}
                >
                  {Array.from({ length: PIN_LEN }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'login-pin-dot',
                        i < secret.length && 'login-pin-dot--on',
                      )}
                    />
                  ))}
                </div>

                {error ? (
                  <p className="login-error" role="alert">
                    {error}
                  </p>
                ) : lockRemainingSec > 0 ? (
                  <p className="login-status">Patientez {lockRemainingSec}s</p>
                ) : (
                  <p className="login-status">Touchez les chiffres</p>
                )}

                <div className="login-pad" aria-label="Clavier PIN">
                  {PIN_KEYS.map((key, idx) => {
                    if (key === '') {
                      return <span key={`empty-${idx}`} />
                    }
                    if (key === 'del') {
                      return (
                        <button
                          key="del"
                          type="button"
                          className="login-pad-key login-pad-key--mute"
                          aria-label="Effacer"
                          disabled={locked}
                          onClick={clearDigit}
                        >
                          <IconDelete className="h-5 w-5" />
                        </button>
                      )
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        className="login-pad-key"
                        disabled={locked}
                        onClick={() => pushDigit(key)}
                      >
                        {key}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="login-pass-flow">
                <label className="login-pass-field">
                  <span className="login-pass-label">Mot de passe</span>
                  <div className="login-pass-row">
                    <input
                      type={showSecret ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={secret}
                      onChange={(e) => {
                        setSecret(e.target.value)
                        setError(null)
                      }}
                      placeholder="••••••••"
                      autoFocus
                      disabled={locked}
                      className={cn(
                        'login-pass-input',
                        error && 'login-pass-input--err',
                      )}
                    />
                    <button
                      type="button"
                      className="login-pass-eye"
                      aria-label={showSecret ? 'Masquer' : 'Afficher'}
                      onClick={() => setShowSecret((v) => !v)}
                    >
                      {showSecret ? (
                        <IconEyeOff className="h-4 w-4" />
                      ) : (
                        <IconEye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {error ? (
                    <span className="login-error login-error--left" role="alert">
                      {error}
                    </span>
                  ) : null}
                </label>

                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  size="lg"
                  className="login-submit"
                  disabled={locked || !secret.trim()}
                >
                  {lockRemainingSec > 0
                    ? `Patientez ${lockRemainingSec}s`
                    : 'Démarrer'}
                </Button>
              </form>
            )}

            <p className="login-card-foot">Session locale sur cet appareil</p>
          </div>
        </div>
      </main>
    </div>
  )
}
