import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { profileSecretMatches } from '../auth/permissions'
import {
  DEFAULT_OWNER_PIN,
  ensureOwnerAdminProfile,
  listActiveStaffProfiles,
  roleLabel,
  subscribeStaffProfiles,
} from '../auth/profiles'
import type { StaffAuthMethod, StaffProfile } from '../auth/types'
import { BRAND_NAME } from '../brand'
import { BrandLogo } from './BrandLogo'
import { useSubscription } from '../context/SubscriptionContext'
import { db } from '../db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '../ui/Button'
import { cn } from '../ui/cn'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input } from '../ui/Input'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCaisse,
  IconEye,
  IconEyeOff,
  IconOffline,
  IconShield,
  IconStore,
} from '../ui/icons'

type Props = {
  onSuccess: (profile: StaffProfile, authMethod: StaffAuthMethod) => void
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 30_000

const HIGHLIGHTS = [
  { icon: IconCaisse, label: 'Caisse' },
  { icon: IconOffline, label: 'Hors ligne' },
  { icon: IconStore, label: 'Magasins' },
] as const

export function LoginScreen({ onSuccess }: Props) {
  const { organization } = useSubscription()
  const [profiles, setProfiles] = useState<StaffProfile[]>(() =>
    listActiveStaffProfiles(),
  )
  const [selected, setSelected] = useState<StaffProfile | null>(null)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [bootstrappedOwner, setBootstrappedOwner] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const [stepKey, setStepKey] = useState(0)
  const [cardReady, setCardReady] = useState(false)
  const stores =
    useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const storeNameById = new Map(stores.map((store) => [store.id, store.name]))

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
      const next = listActiveStaffProfiles()
      setProfiles(next)
      setSelected((prev) =>
        prev ? (next.find((p) => p.id === prev.id) ?? null) : prev,
      )
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

  const timeLabel = useMemo(
    () =>
      now.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [now],
  )
  const dateLabel = useMemo(
    () =>
      now.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now],
  )

  const handleSelect = (p: StaffProfile) => {
    setSelected(p)
    setSecret('')
    setError(null)
    setShowSecret(false)
    setStepKey((k) => k + 1)
  }

  const handleBack = () => {
    setSelected(null)
    setSecret('')
    setError(null)
    setShowSecret(false)
    setStepKey((k) => k + 1)
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!selected) return
    if (lockRemainingSec > 0) {
      setError(`Trop d’essais. Patientez ${lockRemainingSec}s.`)
      setShakeKey((k) => k + 1)
      return
    }
    const s = secret.trim()
    if (!profileSecretMatches(selected, s)) {
      const nextFails = failedAttempts + 1
      setFailedAttempts(nextFails)
      setShakeKey((k) => k + 1)
      if (nextFails >= MAX_FAILED_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS)
        setFailedAttempts(0)
        setError('Trop d’essais. Compte verrouillé 30 secondes.')
      } else {
        setError(
          `Code incorrect (${MAX_FAILED_ATTEMPTS - nextFails} essai(s) restant(s))`,
        )
      }
      return
    }
    setFailedAttempts(0)
    setLockedUntil(0)
    const authMethod: StaffAuthMethod =
      selected.password !== undefined && s === selected.password
        ? 'password'
        : 'pin'
    onSuccess(selected, authMethod)
  }

  return (
    <div className="login-shell">
      <div className="login-aurora" aria-hidden />
      <div className="login-brand-orb login-brand-orb--a" aria-hidden />
      <div className="login-brand-orb login-brand-orb--b" aria-hidden />
      <div className="login-brand-orb login-brand-orb--c" aria-hidden />
      <div className="login-brand-grid" aria-hidden />
      <div className="login-sheen" aria-hidden />
      <div className="login-particles" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="login-particle"
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </div>

      <aside className="login-brand login-brand--left">
        <div className="login-reveal login-reveal--1 flex items-center gap-3">
          <BrandLogo size="md" ring="dark" className="login-logo-glow" />
          <span className="select-none font-display text-[1.85rem] font-semibold tracking-[-0.04em] text-white">
            {BRAND_NAME}
          </span>
        </div>
        <div className="login-reveal login-reveal--2 max-w-sm">
          <p className="login-eyebrow text-[11px] font-semibold uppercase tracking-[0.22em] text-[#9bb8ff]">
            Point de vente
          </p>
          <h2 className="mt-3 font-display text-[1.85rem] font-semibold leading-[1.12] tracking-[-0.038em] text-white xl:text-[2.15rem]">
            <span className="login-headline-line">Bonjour.</span>
            <br />
            <span className="login-headline-line login-headline-line--delay">
              On ouvre la journée.
            </span>
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed text-white/70">
            Identifiez-vous pour encaisser, suivre le stock et piloter le
            magasin.
          </p>
        </div>
        <p className="login-reveal login-reveal--3 text-[11px] text-white/45">
          <span className="capitalize">{dateLabel}</span>
        </p>
      </aside>

      <main className="login-main">
        <div className="relative z-[1] w-full">
          <div
            className={cn(
              'login-card',
              cardReady && 'login-card--in',
              shakeKey > 0 && error && 'login-card--shake',
            )}
            data-shake-parity={shakeKey % 2}
          >
            <div className="login-card-glow" aria-hidden />
            <p className="mb-5 flex items-center gap-2.5 font-display text-2xl font-semibold tracking-[-0.04em] text-[#0033aa] lg:hidden">
              <BrandLogo size="sm" ring="subtle" />
              {BRAND_NAME}
            </p>
            <div className="mb-6">
              <span className="login-badge inline-flex items-center gap-1.5 rounded-full border border-[#0033aa]/15 bg-[#e8eefa] px-3 py-1 text-[11px] font-semibold text-[#0033aa]">
                <IconShield className="h-3 w-3" />
                Accès équipe
              </span>
              <h1 className="mt-3 font-display text-[1.55rem] font-semibold tracking-[-0.03em] text-[#10182b]">
                {selected ? 'Votre code' : 'Qui êtes-vous ?'}
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#5a657c]">
                {selected
                  ? `Entrez votre PIN${selected.password ? ' ou mot de passe' : ''} pour démarrer.`
                  : 'Touchez votre nom pour continuer.'}
              </p>
              {bootstrappedOwner && !selected ? (
                <p className="login-hint mt-3 rounded-xl border border-amber-200/80 bg-amber-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-amber-950">
                  Première connexion : code{' '}
                  <span className="font-mono font-semibold">
                    {DEFAULT_OWNER_PIN}
                  </span>
                  . Vous pourrez le changer ensuite.
                </p>
              ) : null}
            </div>

            <div key={stepKey} className="login-step">
              {!selected ? (
                <div className="space-y-2">
                  {profiles.length === 0 ? (
                    <EmptyState
                      title="Personne n’est encore inscrit"
                      description="Un administrateur doit d’abord créer un membre de l’équipe."
                    />
                  ) : (
                    profiles.map((p, index) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelect(p)}
                        className="login-profile group"
                        style={
                          {
                            '--stagger': index,
                          } as CSSProperties
                        }
                      >
                        <span className="login-avatar">{p.initials}</span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[14px] font-semibold text-[#10182b]">
                            {p.displayName}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-[#6a7690]">
                            {roleLabel(p.role)}
                            {p.storeId
                              ? ` · ${storeNameById.get(p.storeId) ?? p.storeId}`
                              : ''}
                          </span>
                        </span>
                        <IconArrowRight className="h-4 w-4 shrink-0 text-[#9aa6bc] transition duration-300 group-hover:translate-x-1 group-hover:text-[#0033aa]" />
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="login-selected flex items-center justify-between gap-3 rounded-2xl border border-[#0033aa]/10 bg-[#f4f6fb] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="login-avatar login-avatar--solid login-avatar--pulse">
                        {selected.initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[#10182b]">
                          {selected.displayName}
                        </p>
                        <p className="truncate text-[11px] text-[#6a7690]">
                          {roleLabel(selected.role)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<IconArrowLeft />}
                      onClick={handleBack}
                    >
                      Changer
                    </Button>
                  </div>

                  <Field
                    label="Code d’accès"
                    error={error ?? undefined}
                    required
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        autoComplete="current-password"
                        inputMode="numeric"
                        value={secret}
                        onChange={(e) => {
                          setSecret(e.target.value)
                          setError(null)
                        }}
                        placeholder="••••"
                        autoFocus
                        disabled={lockRemainingSec > 0}
                        className="font-mono-nums text-base tracking-[0.35em]"
                        invalid={!!error}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn('shrink-0')}
                        aria-label={
                          showSecret
                            ? 'Masquer le secret'
                            : 'Afficher le secret'
                        }
                        onClick={() => setShowSecret((v) => !v)}
                      >
                        {showSecret ? <IconEyeOff /> : <IconEye />}
                      </Button>
                    </div>
                  </Field>

                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    size="lg"
                    className="login-submit"
                    disabled={lockRemainingSec > 0}
                  >
                    {lockRemainingSec > 0
                      ? `Patientez ${lockRemainingSec}s`
                      : 'Démarrer'}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

      <aside className="login-brand login-brand--right">
        <span className="login-reveal login-reveal--1 login-clock font-mono-nums text-right text-[13px] font-semibold tabular-nums text-white/80">
          {timeLabel}
        </span>
        <div className="login-reveal login-reveal--2 flex max-w-sm flex-col items-end">
          <ul className="flex flex-wrap justify-end gap-2">
            {HIGHLIGHTS.map(({ icon: Icon, label }, index) => (
              <li
                key={label}
                className="login-chip"
                style={{ '--stagger': index } as CSSProperties}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-right text-[13px] leading-relaxed text-white/65">
            Tout reste sur cet appareil, même sans internet.
          </p>
        </div>
        <p className="login-reveal login-reveal--3 text-right text-[11px] text-white/45">
          {BRAND_NAME}
        </p>
      </aside>
    </div>
  )
}
