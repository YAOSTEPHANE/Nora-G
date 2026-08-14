import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import {
  changeStaffPassword,
  countActiveStaffProfiles,
  createStaffProfile,
  deactivateStaffProfile,
  deleteStaffProfile,
  isCustomStaffProfile,
  listStaffProfiles,
  reactivateStaffProfile,
  roleLabel,
  subscribeStaffProfiles,
  updateStaffProfile,
} from '../auth/profiles'
import type { StaffProfile, UserRole } from '../auth/types'
import { db } from '../db/db'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { Field, Input, Select } from '../ui/Input'
import { Kpi } from '../ui/Kpi'
import { PageHeader, SectionHeader } from '../ui/PageHeader'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { MobileDataCard, ResponsiveData, TableScrollHint } from '../ui/ResponsiveData'
import { useToast } from '../ui/Toast'
import {
  IconCheck,
  IconClose,
  IconEye,
  IconEyeOff,
  IconShield,
  IconTrash,
} from '../ui/icons'

type Props = { currentProfileId: string }

type PermRow = {
  label: string
  caissier: boolean
  gerant: boolean
  admin: boolean
}

const PERMISSIONS: PermRow[] = [
  { label: 'Caisse (panier, espèces, carte, mobile money)', caissier: true, gerant: true, admin: true },
  { label: 'Articles — consultation', caissier: true, gerant: true, admin: true },
  { label: 'Articles — création, archivage, TVA, image, import CSV', caissier: false, gerant: true, admin: true },
  { label: 'Modification des prix (vente & revient)', caissier: false, gerant: true, admin: true },
  { label: 'Magasins — vue consolidée', caissier: true, gerant: true, admin: true },
  { label: 'Magasins — transferts de stock', caissier: false, gerant: true, admin: true },
  { label: 'Magasins — création de sites', caissier: false, gerant: false, admin: true },
  { label: 'Journal & réimpression des reçus', caissier: true, gerant: true, admin: true },
  { label: 'Commandes — consultation, export & reçu', caissier: true, gerant: true, admin: true },
  { label: 'Commandes — validation / rejet', caissier: false, gerant: true, admin: true },
  { label: 'Clôture journalière & fond de caisse', caissier: false, gerant: true, admin: true },
  { label: 'Remboursements vente (audit)', caissier: false, gerant: true, admin: true },
  { label: 'Annulation transaction (audit)', caissier: true, gerant: true, admin: true },
  { label: 'File cloud — pousser', caissier: true, gerant: true, admin: true },
  { label: 'Inventaire rapide', caissier: false, gerant: true, admin: true },
  { label: 'Stats', caissier: false, gerant: true, admin: true },
  { label: 'Équipe (matrice)', caissier: false, gerant: false, admin: true },
  { label: 'Connexions', caissier: false, gerant: false, admin: true },
]

function PermCell({ ok }: { ok: boolean }) {
  return (
    <Td align="center">
      {ok ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <IconCheck className="h-3 w-3" />
        </span>
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
          <IconClose className="h-3 w-3" />
        </span>
      )}
    </Td>
  )
}

export function PersonnelView({ currentProfileId }: Props) {
  const toast = useToast()
  const maxStaff = 0
  const [profiles, setProfiles] = useState(() => listStaffProfiles())
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<UserRole>('caissier')
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [createStoreId, setCreateStoreId] = useState('')
  const [currentSecret, setCurrentSecret] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showCurrentSecret, setShowCurrentSecret] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showCreatePin, setShowCreatePin] = useState(false)
  const [showCreatePassword, setShowCreatePassword] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('caissier')
  const [editStoreId, setEditStoreId] = useState('')
  const [editPin, setEditPin] = useState('')
  const stores = useLiveQuery(() => db.stores.orderBy('sortOrder').toArray(), [], []) ?? []
  const storeNameById = useMemo(
    () => new Map(stores.map((store) => [store.id, store.name])),
    [stores],
  )

  useEffect(() => {
    return subscribeStaffProfiles(() => {
      setProfiles(listStaffProfiles())
    })
  }, [])

  const activeCount = useMemo(() => countActiveStaffProfiles(), [profiles])
  const totalByRole = useMemo(() => {
    const rows = { caissier: 0, gerant: 0, admin: 0, cuisinier: 0 }
    for (const p of profiles) {
      if (p.active === false) continue
      rows[p.role] += 1
    }
    return rows
  }, [profiles])
  const currentProfile = useMemo(
    () => profiles.find((p) => p.id === currentProfileId) ?? null,
    [profiles, currentProfileId],
  )
  const atStaffLimit = maxStaff > 0 && activeCount >= maxStaff

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const created = createStaffProfile({
        displayName,
        role,
        storeId: createStoreId || undefined,
        pin,
        password,
        maxStaff: maxStaff > 0 ? maxStaff : undefined,
      })
      toast.success(
        'Utilisateur créé',
        `${created.displayName} · ${roleLabel(created.role)}`,
      )
      setDisplayName('')
      setRole('caissier')
      setCreateStoreId('')
      setPin('')
      setPassword('')
    } catch (error) {
      toast.error(
        'Création impossible',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentProfile) {
      toast.error('Profil actif introuvable')
      return
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      toast.error('Confirmation invalide', 'Les deux mots de passe diffèrent.')
      return
    }
    try {
      changeStaffPassword({
        profileId: currentProfile.id,
        currentSecret,
        nextPassword: newPassword,
      })
      setCurrentSecret('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Mot de passe mis à jour')
    } catch (error) {
      toast.error(
        'Changement impossible',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const startEdit = (p: StaffProfile) => {
    if (!isCustomStaffProfile(p.id)) {
      toast.warning(
        'Profil démo',
        'Les comptes de démonstration ne sont pas modifiables. Créez un nouvel utilisateur.',
      )
      return
    }
    setEditingId(p.id)
    setEditName(p.displayName)
    setEditRole(p.role)
    setEditStoreId(p.storeId ?? '')
    setEditPin('')
  }

  const saveEdit = () => {
    if (!editingId) return
    try {
      updateStaffProfile(editingId, {
        displayName: editName,
        role: editRole,
        storeId: editStoreId || null,
        ...(editPin.trim() ? { pin: editPin } : {}),
      })
      toast.success('Profil mis à jour')
      setEditingId(null)
    } catch (error) {
      toast.error(
        'Modification impossible',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const toggleActive = async (p: StaffProfile) => {
    if (!isCustomStaffProfile(p.id)) {
      toast.warning('Profil démo', 'Impossible de désactiver un compte de démonstration.')
      return
    }
    if (p.id === currentProfileId) {
      toast.error('Action refusée', 'Vous ne pouvez pas désactiver votre propre session.')
      return
    }
    const isActive = p.active !== false
    if (isActive) {
      const ok = window.confirm(
        `Désactiver « ${p.displayName} » ? Cette personne ne pourra plus se connecter à la caisse.`,
      )
      if (!ok) return
      try {
        deactivateStaffProfile(p.id)
        toast.success('Compte désactivé', p.displayName)
      } catch (error) {
        toast.error(
          'Impossible',
          error instanceof Error ? error.message : String(error),
        )
      }
      return
    }
    try {
      reactivateStaffProfile(p.id, maxStaff > 0 ? maxStaff : undefined)
      toast.success('Compte réactivé', p.displayName)
    } catch (error) {
      toast.error(
        'Réactivation impossible',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  const removeProfile = async (p: StaffProfile) => {
    if (!isCustomStaffProfile(p.id)) {
      toast.warning('Profil démo', 'Impossible de supprimer un compte de démonstration.')
      return
    }
    if (p.id === currentProfileId) {
      toast.error('Action refusée', 'Vous ne pouvez pas supprimer votre propre session.')
      return
    }
    const ok = window.confirm(
      `Supprimer définitivement « ${p.displayName} » ? Préférez la désactivation pour conserver l’historique.`,
    )
    if (!ok) return
    try {
      deleteStaffProfile(p.id)
      if (editingId === p.id) setEditingId(null)
      toast.success('Utilisateur supprimé', p.displayName)
    } catch (error) {
      toast.error(
        'Suppression impossible',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  return (
    <div className="module-page">
      <PageHeader
        icon={<IconShield />}
        eyebrow="Équipe"
        title="Équipe"
        subtitle="Profils, rôles et matrice des droits"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Caissiers actifs" value={String(totalByRole.caissier)} tone="neutral" />
        <Kpi label="Gérants actifs" value={String(totalByRole.gerant)} tone="violet" />
        <Kpi label="Administrateurs" value={String(totalByRole.admin)} tone="accent" />
        <Kpi
          label="Utilisateurs actifs"
          value={String(activeCount)}
          hint="Sans limite de quota"
          tone="amber"
        />
      </div>

      <Card>
        <CardContent>
          <h2 className="text-[14px] font-semibold text-zinc-900">
            Changer mon mot de passe
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Le PIN reste valide pour la connexion caisse. Le mot de passe est
            personnel au profil actif.
          </p>
          <form
            onSubmit={handlePasswordChange}
            className="mt-3 grid gap-3 md:grid-cols-3"
          >
            <Field label="Secret actuel (PIN ou mot de passe)" required>
              <div className="flex items-center gap-2">
                <Input
                  type={showCurrentSecret ? 'text' : 'password'}
                  value={currentSecret}
                  onChange={(e) => setCurrentSecret(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={
                    showCurrentSecret ? 'Masquer le secret' : 'Afficher le secret'
                  }
                  onClick={() => setShowCurrentSecret((v) => !v)}
                >
                  {showCurrentSecret ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
            </Field>
            <Field label="Nouveau mot de passe" required>
              <div className="flex items-center gap-2">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={4}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={
                    showNewPassword
                      ? 'Masquer le nouveau mot de passe'
                      : 'Afficher le nouveau mot de passe'
                  }
                  onClick={() => setShowNewPassword((v) => !v)}
                >
                  {showNewPassword ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
            </Field>
            <Field label="Confirmer" required>
              <div className="flex items-center gap-2">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={4}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={
                    showConfirmPassword
                      ? 'Masquer la confirmation'
                      : 'Afficher la confirmation'
                  }
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
            </Field>
            <div className="md:col-span-3">
              <Button type="submit" variant="secondary">
                Enregistrer le mot de passe
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="text-[14px] font-semibold text-zinc-900">
            Créer un utilisateur
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Connexion par PIN ou mot de passe (même champ).
            Aucune limite d’utilisateurs.
          </p>
          <form
            onSubmit={handleCreate}
            className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-5"
          >
            <Field label="Nom complet" required className="lg:col-span-2">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex: Mariam Traoré"
                required
                disabled={atStaffLimit}
              />
            </Field>
            <Field label="Rôle" required>
              <Select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={atStaffLimit}
              >
                <option value="caissier">Caissier</option>
                <option value="cuisinier">Cuisinier</option>
                <option value="gerant">Gérant</option>
                <option value="admin">Administrateur</option>
              </Select>
            </Field>
            <Field label="Magasin assigné">
              <Select
                value={createStoreId}
                onChange={(e) => setCreateStoreId(e.target.value)}
                disabled={atStaffLimit}
              >
                <option value="">Tous magasins</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIN (4-8 chiffres)" required>
              <div className="flex items-center gap-2">
                <Input
                  type={showCreatePin ? 'text' : 'password'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  inputMode="numeric"
                  placeholder="1234"
                  required
                  disabled={atStaffLimit}
                  className="font-mono-nums"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={showCreatePin ? 'Masquer le PIN' : 'Afficher le PIN'}
                  onClick={() => setShowCreatePin((v) => !v)}
                >
                  {showCreatePin ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
            </Field>
            <Field label="Mot de passe (optionnel)">
              <div className="flex items-center gap-2">
                <Input
                  type={showCreatePassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mot de passe"
                  disabled={atStaffLimit}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={
                    showCreatePassword
                      ? 'Masquer le mot de passe'
                      : 'Afficher le mot de passe'
                  }
                  onClick={() => setShowCreatePassword((v) => !v)}
                >
                  {showCreatePassword ? <IconEyeOff /> : <IconEye />}
                </Button>
              </div>
            </Field>
            <div className="md:col-span-2 lg:col-span-5">
              <Button type="submit" variant="accent" fullWidth className="sm:w-auto" disabled={atStaffLimit}>
                Créer l’utilisateur
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <SectionHeader
        title="Matrice des permissions"
        subtitle="Droits par rôle (les profils peuvent surcharger en démo)"
      />
      <TableScrollHint className="md:hidden" />
      <ResponsiveData
        table={
          <Table minWidth={520}>
            <THead>
              <Tr hover={false}>
                <Th sticky>Fonctionnalité</Th>
                <Th align="center">Caissier</Th>
                <Th align="center">Gérant</Th>
                <Th align="center">Admin</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr className="bg-zinc-50/50" hover={false}>
                <Td sticky className="font-medium text-zinc-900">
                  Plafond de remise par défaut
                </Td>
                <Td align="center" mono>
                  5 %
                </Td>
                <Td align="center" mono>
                  20 %
                </Td>
                <Td align="center" mono>
                  100 %
                </Td>
              </Tr>
              {PERMISSIONS.map((row) => (
                <Tr key={row.label}>
                  <Td sticky>{row.label}</Td>
                  <PermCell ok={row.caissier} />
                  <PermCell ok={row.gerant} />
                  <PermCell ok={row.admin} />
                </Tr>
              ))}
            </TBody>
          </Table>
        }
        cards={
          <ul className="grid gap-2">
            <MobileDataCard
              title="Plafond de remise par défaut"
              body={
                <div className="grid grid-cols-3 gap-2 text-center font-mono-nums">
                  <div>
                    <p className="text-[10px] uppercase text-ink-subtle">Caissier</p>
                    <p className="font-semibold text-ink">5 %</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-ink-subtle">Gérant</p>
                    <p className="font-semibold text-ink">20 %</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-ink-subtle">Admin</p>
                    <p className="font-semibold text-ink">100 %</p>
                  </div>
                </div>
              }
            />
            {PERMISSIONS.map((row) => (
              <MobileDataCard
                key={row.label}
                title={row.label}
                body={
                  <div className="grid grid-cols-3 gap-2 text-center text-[12px]">
                    <div>
                      <p className="text-[10px] uppercase text-ink-subtle">Caissier</p>
                      <p>{row.caissier ? 'Oui' : 'Non'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-ink-subtle">Gérant</p>
                      <p>{row.gerant ? 'Oui' : 'Non'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-ink-subtle">Admin</p>
                      <p>{row.admin ? 'Oui' : 'Non'}</p>
                    </div>
                  </div>
                }
              />
            ))}
          </ul>
        }
      />

      <SectionHeader
        title="Profils enregistrés"
        subtitle="Modifiez, désactivez ou supprimez les comptes créés sur cet appareil"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {profiles.map((p) => {
          const active = p.id === currentProfileId
          const isActiveAccount = p.active !== false
          const custom = isCustomStaffProfile(p.id)
          const isEditing = editingId === p.id
          return (
            <Card
              key={p.id}
              hover
              className={
                active
                  ? 'ring-2 ring-emerald-500/20'
                  : !isActiveAccount
                    ? 'opacity-70'
                    : ''
              }
            >
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        active
                          ? 'flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-[12px] font-bold text-white'
                          : 'flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-bold text-zinc-700'
                      }
                    >
                      {p.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-zinc-900">
                        {p.displayName}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {roleLabel(p.role)}
                        {!custom ? ' · démo' : ''}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Magasin :{' '}
                        {p.storeId
                          ? (storeNameById.get(p.storeId) ?? p.storeId)
                          : 'Tous'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {active ? (
                      <Badge tone="success">
                        <IconShield className="h-3 w-3" />
                        Session
                      </Badge>
                    ) : null}
                    {!isActiveAccount ? (
                      <Badge tone="neutral">Désactivé</Badge>
                    ) : null}
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <Field label="Nom">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </Field>
                    <Field label="Rôle">
                      <Select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as UserRole)}
                      >
                        <option value="caissier">Caissier</option>
                        <option value="cuisinier">Cuisinier</option>
                        <option value="gerant">Gérant</option>
                        <option value="admin">Administrateur</option>
                      </Select>
                    </Field>
                    <Field label="Magasin">
                      <Select
                        value={editStoreId}
                        onChange={(e) => setEditStoreId(e.target.value)}
                      >
                        <option value="">Tous magasins</option>
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Nouveau PIN (optionnel)">
                      <Input
                        value={editPin}
                        onChange={(e) => setEditPin(e.target.value)}
                        inputMode="numeric"
                        placeholder="Laisser vide pour conserver"
                        className="font-mono-nums"
                      />
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="accent" onClick={saveEdit}>
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-[12px] leading-relaxed text-zinc-600">
                      {p.role === 'admin'
                        ? 'Pilotage complet : personnel, intégrations, création de magasins, tous plafonds.'
                        : p.role === 'gerant'
                          ? 'Magasin au quotidien : catalogue, prix, stocks, transferts, clôture, analytique.'
                          : p.role === 'cuisinier'
                            ? 'Espace cuisine : tickets KDS, préparation, stocks d’ingrédients et pointage.'
                            : 'Vente et consultation : caisse, catalogue lecture, rapport du jour ; remises limitées.'}
                    </p>
                    {custom ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEdit(p)}
                        >
                          Modifier
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => void toggleActive(p)}
                        >
                          {isActiveAccount ? 'Désactiver' : 'Réactiver'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          iconLeft={<IconTrash />}
                          onClick={() => void removeProfile(p)}
                          disabled={p.id === currentProfileId}
                        >
                          Supprimer
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
