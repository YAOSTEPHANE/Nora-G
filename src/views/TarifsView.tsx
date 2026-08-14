import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { useActiveStore } from '../context/ActiveStoreContext'
import { db } from '../db/db'
import type { PriceList, PriceListItem } from '../db/types'
import { formatFCFA } from '../lib/money'
import { productIsActive } from '../lib/productFilters'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { FormGrid, FormPanel } from '../ui/Form'
import { EmptyState } from '../ui/EmptyState'
import { Field, Input, Select } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { useToast } from '../ui/Toast'
import { IconTag } from '../ui/icons'

type Props = {
  canManage: boolean
}

export function TarifsView({ canManage }: Props) {
  const toast = useToast()
  const { activeStoreId } = useActiveStore()
  const lists =
    useLiveQuery(
      () => db.priceLists.where('storeId').equals(activeStoreId).toArray(),
      [activeStoreId],
      [],
    ) ?? []
  const products =
    useLiveQuery(() => db.products.toArray(), [], []) ?? []
  const [listId, setListId] = useState('')
  const items: PriceListItem[] =
    useLiveQuery(
      async () => {
        if (!listId) return [] as PriceListItem[]
        return await db.priceListItems
          .where('priceListId')
          .equals(listId)
          .toArray()
      },
      [listId],
      [] as PriceListItem[],
    ) ?? []

  const [name, setName] = useState('')
  const [code, setCode] = useState('PRO')
  const [discountPct, setDiscountPct] = useState('10')
  const [productId, setProductId] = useState('')
  const [price, setPrice] = useState('')

  const activeProducts = useMemo(
    () => products.filter(productIsActive),
    [products],
  )
  const activeList = lists.find((l) => l.id === listId)

  const createList = async () => {
    if (!canManage || !name.trim()) return
    const row: PriceList = {
      id: crypto.randomUUID(),
      storeId: activeStoreId,
      name: name.trim(),
      code: code.trim().toUpperCase() || 'PRO',
      active: true,
      discountPct: Math.max(0, Math.min(100, Number(discountPct) || 0)),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.priceLists.add(row)
    setListId(row.id)
    setName('')
    toast.success('Grille créée', row.code)
  }

  const addItem = async () => {
    if (!canManage || !listId || !productId) return
    const product = activeProducts.find((p) => p.id === productId)
    if (!product) return
    const priceTTC = Math.round(Number(price))
    if (!Number.isFinite(priceTTC) || priceTTC < 0) {
      toast.error('Prix invalide')
      return
    }
    const existing = items.find((i) => i.productId === productId)
    if (existing) {
      await db.priceListItems.update(existing.id, {
        priceTTC,
        updatedAt: Date.now(),
      })
    } else {
      await db.priceListItems.add({
        id: crypto.randomUUID(),
        priceListId: listId,
        productId,
        productName: product.name,
        priceTTC,
        updatedAt: Date.now(),
      })
    }
    setPrice('')
    toast.success('Tarif enregistré')
  }

  return (
    <div className="module-page space-y-4">
      <PageHeader
        icon={<IconTag />}
        title="Tarifs pro"
        subtitle="Grilles multi-prix (particulier / pro / revendeur)"
      />
      {canManage ? (
        <FormPanel
          eyebrow="Grille"
          title="Créer une grille tarifaire"
          description="Nom, code et remise par défaut."
          actions={<Button onClick={() => void createList()}>Créer grille</Button>}
        >
          <FormGrid columns={3}>
            <Field label="Nom">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field label="Remise % défaut">
              <Input
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
              />
            </Field>
          </FormGrid>
        </FormPanel>
      ) : null}

      <Field label="Grille active">
        <Select value={listId} onChange={(e) => setListId(e.target.value)}>
          <option value="">— Choisir —</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.code})
            </option>
          ))}
        </Select>
      </Field>

      {activeList ? (
        <div className="space-y-3">
          <Badge tone="info">
            {activeList.name} · remise défaut {activeList.discountPct}%
          </Badge>
          {canManage ? (
            <FormPanel
              eyebrow="Prix"
              title="Ajouter un tarif spécifique"
              description="Surcharge un article dans la grille active."
              actions={
                <Button variant="accent" onClick={() => void addItem()}>
                  Ajouter / maj
                </Button>
              }
            >
              <FormGrid>
                <Field label="Article">
                  <Select
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  >
                    <option value="">—</option>
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prix TTC">
                  <Input value={price} onChange={(e) => setPrice(e.target.value)} />
                </Field>
              </FormGrid>
            </FormPanel>
          ) : null}
          {items.length === 0 ? (
            <EmptyState
              title="Aucun prix spécifique"
              description="Sinon la remise % de la grille s’applique."
            />
          ) : (
            <ul className="space-y-1">
              {items.map((i) => (
                <li
                  key={i.id}
                  className="flex justify-between rounded-lg border border-border/60 bg-white px-3 py-2 text-[12px]"
                >
                  <span>{i.productName}</span>
                  <span className="font-mono-nums font-semibold">
                    {formatFCFA(i.priceTTC)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
