import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { ProductModifier } from '../db/types'
import { useDomainProducts } from '../hooks/useDomainProducts'
import { formatFCFA } from '../lib/money'
import { saleLocalYmd } from '../lib/salesStats'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel, FormSwitchRow } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Switch } from '../ui/Switch'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { IconCaisse } from '../ui/icons'

type Props = {
  canManage: boolean
}

export function CarteView({ canManage }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const [tab, setTab] = useState<'menu' | 'options'>('menu')
  const today = saleLocalYmd(Date.now())
  const { products: activeProducts } = useDomainProducts({ activeOnly: true })
  const menu =
    useLiveQuery(
      () =>
        db.menuDays
          .where('[storeId+dateYmd]')
          .equals([activeStoreId, today])
          .first(),
      [activeStoreId, today],
    ) ?? null
  const modifiers =
    useLiveQuery(() => db.productModifiers.toArray(), [], []) ?? []

  const selectedIds = new Set(menu?.productIds ?? [])

  const [note, setNote] = useState('')
  const [modProductId, setModProductId] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [optionLabel, setOptionLabel] = useState('')
  const [optionDelta, setOptionDelta] = useState('0')
  const [required, setRequired] = useState(false)

  const toggleProduct = async (productId: string) => {
    if (!canManage) return
    const current = menu?.productIds ?? []
    const next = current.includes(productId)
      ? current.filter((id) => id !== productId)
      : [...current, productId]
    if (menu) {
      await db.menuDays.update(menu.id, {
        productIds: next,
        note: note.trim() || menu.note,
        updatedAt: Date.now(),
      })
    } else {
      await db.menuDays.add({
        id: crypto.randomUUID(),
        storeId: activeStoreId,
        dateYmd: today,
        productIds: next,
        note: note.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
  }

  const saveNote = async () => {
    if (!canManage) return
    if (menu) {
      await db.menuDays.update(menu.id, {
        note: note.trim() || undefined,
        updatedAt: Date.now(),
      })
    } else {
      await db.menuDays.add({
        id: crypto.randomUUID(),
        storeId: activeStoreId,
        dateYmd: today,
        productIds: [],
        note: note.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    }
    toast.success('Note du jour enregistrée')
  }

  const addModifier = async () => {
    if (!canManage || !modProductId || !groupLabel.trim() || !optionLabel.trim()) {
      toast.error('Produit, groupe et option requis')
      return
    }
    const row: ProductModifier = {
      id: crypto.randomUUID(),
      productId: modProductId,
      groupLabel: groupLabel.trim(),
      options: [
        {
          label: optionLabel.trim(),
          priceDeltaTTC: Math.round(Number(optionDelta) || 0),
        },
      ],
      required,
      maxSelect: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.productModifiers.add(row)
    setGroupLabel('')
    setOptionLabel('')
    setOptionDelta('0')
    setRequired(false)
    toast.success('Option ajoutée')
  }

  const productName = (id: string) =>
    activeProducts.find((p) => p.id === id)?.name ?? 'Produit'

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconCaisse />}
        title="Carte & menu du jour"
        subtitle={`Aujourd’hui · ${today}`}
      />
      <Tabs
        variant="segmented"
        active={tab}
        onChange={setTab}
        items={[
          { id: 'menu', label: 'Menu du jour', count: selectedIds.size || undefined },
          { id: 'options', label: 'Options plats', count: modifiers.length || undefined },
        ]}
      />

      {tab === 'menu' ? (
        <div className="space-y-3">
          {canManage ? (
            <FormPanel
              eyebrow="Menu"
              title="Note du jour"
              description="Suggestion, plat du chef, mention du service."
              actions={
                <Button size="sm" onClick={() => void saveNote()}>
                  Enregistrer la note
                </Button>
              }
            >
              <Field label="Note du jour (suggestion, plat du chef…)">
                <Textarea
                  value={note || menu?.note || ''}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                />
              </Field>
            </FormPanel>
          ) : menu?.note ? (
            <p className="text-[13px] text-ink-muted">{menu.note}</p>
          ) : null}

          {activeProducts.length === 0 ? (
            <EmptyState title="Aucun article" description="Ajoutez des plats au catalogue." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeProducts.map((p) => {
                const on = selectedIds.has(p.id)
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => void toggleProduct(p.id)}
                      className={
                        on
                          ? 'w-full rounded-xl border-2 border-[#0033aa] bg-[#e8eefa] px-3 py-3 text-left'
                          : 'w-full rounded-xl border border-border/70 bg-white px-3 py-3 text-left'
                      }
                    >
                      <span className="block text-[13px] font-semibold">{p.name}</span>
                      <span className="text-[12px] text-ink-muted">
                        {formatFCFA(p.priceTTC)}
                      </span>
                      {on ? (
                        <Badge tone="accent" className="mt-1">
                          Au menu
                        </Badge>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {canManage ? (
            <FormPanel
              eyebrow="Options"
              title="Ajouter une option de plat"
              description="Groupe, libellé, supplément et obligation."
              actions={<Button onClick={() => void addModifier()}>Ajouter l’option</Button>}
            >
              <FormGrid>
                <Field label="Plat">
                  <Select
                    value={modProductId}
                    onChange={(e) => setModProductId(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Groupe (ex. Cuisson, Sauce)">
                  <Input value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} />
                </Field>
                <Field label="Option">
                  <Input value={optionLabel} onChange={(e) => setOptionLabel(e.target.value)} />
                </Field>
                <Field label="Supplément (FCFA)">
                  <Input
                    inputMode="numeric"
                    value={optionDelta}
                    onChange={(e) => setOptionDelta(e.target.value)}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <FormSwitchRow label="Obligatoire">
                    <Switch checked={required} onChange={(e) => setRequired(e.target.checked)} />
                  </FormSwitchRow>
                </div>
              </FormGrid>
            </FormPanel>
          ) : null}
          {modifiers.length === 0 ? (
            <EmptyState
              title="Aucune option"
              description="Ex. : bien cuit, sauce piment, accompagnement."
            />
          ) : (
            <ul className="space-y-2">
              {modifiers.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-border/70 bg-white px-3 py-2"
                >
                  <p className="text-[13px] font-semibold">
                    {productName(m.productId)} · {m.groupLabel}
                    {m.required ? (
                      <Badge tone="warning" className="ml-2">
                        Requis
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {m.options
                      .map(
                        (o) =>
                          `${o.label}${o.priceDeltaTTC ? ` (+${formatFCFA(o.priceDeltaTTC)})` : ''}`,
                      )
                      .join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
