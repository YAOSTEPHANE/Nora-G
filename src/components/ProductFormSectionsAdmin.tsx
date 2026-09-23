import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { BusinessDomain } from '../lib/businessDomain'
import { BUSINESS_DOMAINS } from '../lib/businessDomain'
import {
  createProductFormSection,
  deleteProductFormSection,
  ensureDefaultProductFormSections,
  listAllProductFormSections,
  slugKey,
  updateProductFormSection,
} from '../lib/productFormSections'
import type {
  ProductFormField,
  ProductFormFieldType,
  ProductFormSection,
} from '../db/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { Field, Input, Select, Textarea } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'

const FIELD_TYPES: { id: ProductFormFieldType; label: string }[] = [
  { id: 'text', label: 'Texte' },
  { id: 'number', label: 'Nombre' },
  { id: 'textarea', label: 'Texte long' },
  { id: 'select', label: 'Liste' },
  { id: 'boolean', label: 'Oui / Non' },
]

function blankField(): ProductFormField {
  return {
    id: crypto.randomUUID(),
    key: '',
    label: '',
    type: 'text',
    span: 1,
  }
}

type Props = {
  domain: BusinessDomain
}

export function ProductFormSectionsAdmin({ domain }: Props) {
  const toast = useToast()
  const domainLabel =
    BUSINESS_DOMAINS.find((d) => d.id === domain)?.label ?? domain

  const [seedTick, setSeedTick] = useState(0)
  const sections =
    useLiveQuery(
      async () => {
        await ensureDefaultProductFormSections(domain)
        return listAllProductFormSections(domain)
      },
      [domain, seedTick],
      [] as ProductFormSection[],
    ) ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftColumns, setDraftColumns] = useState<1 | 2 | 3>(2)
  const [draftFields, setDraftFields] = useState<ProductFormField[]>([])
  const [draftActive, setDraftActive] = useState(true)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)

  const editing = useMemo(
    () => sections.find((s) => s.id === editingId) ?? null,
    [sections, editingId],
  )

  const openEdit = useCallback((section: ProductFormSection) => {
    setCreating(false)
    setEditingId(section.id)
    setDraftTitle(section.title)
    setDraftDescription(section.description ?? '')
    setDraftColumns(section.columns)
    setDraftFields(section.fields.map((f) => ({ ...f })))
    setDraftActive(section.active)
  }, [])

  const openCreate = useCallback(() => {
    setCreating(true)
    setEditingId(null)
    setDraftTitle('')
    setDraftDescription('')
    setDraftColumns(2)
    setDraftFields([blankField()])
    setDraftActive(true)
  }, [])

  const closeEditor = useCallback(() => {
    setCreating(false)
    setEditingId(null)
  }, [])

  useEffect(() => {
    if (editingId && !editing) closeEditor()
  }, [editingId, editing, closeEditor])

  const patchField = (index: number, patch: Partial<ProductFormField>) => {
    setDraftFields((prev) =>
      prev.map((f, i) => {
        if (i !== index) return f
        const next = { ...f, ...patch }
        if (patch.label !== undefined && !f.key) {
          next.key = slugKey(patch.label)
        }
        return next
      }),
    )
  }

  const handleSave = async () => {
    const title = draftTitle.trim()
    if (!title) {
      toast.error('Titre manquant', 'Indiquez un titre de section.')
      return
    }
    const fields = draftFields
      .map((f) => ({
        ...f,
        label: f.label.trim(),
        key: (f.key.trim() || slugKey(f.label)).slice(0, 40),
        options:
          f.type === 'select'
            ? (f.options ?? [])
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
      }))
      .filter((f) => f.label)

    if (fields.length === 0) {
      toast.error('Champs manquants', 'Ajoutez au moins un champ.')
      return
    }

    const keys = new Set<string>()
    for (const f of fields) {
      if (keys.has(f.key)) {
        toast.error('Clé en double', `La clé « ${f.key} » est utilisée deux fois.`)
        return
      }
      keys.add(f.key)
      if (f.type === 'select' && (!f.options || f.options.length === 0)) {
        toast.error('Liste vide', `Ajoutez des options pour « ${f.label} ».`)
        return
      }
    }

    setBusy(true)
    try {
      if (creating) {
        const created = await createProductFormSection({
          domain,
          title,
          description: draftDescription,
          columns: draftColumns,
          fields,
        })
        if (!draftActive) {
          await updateProductFormSection(created.id, { active: false })
        }
        toast.success('Section créée', title)
        closeEditor()
      } else if (editingId) {
        await updateProductFormSection(editingId, {
          title,
          description: draftDescription,
          columns: draftColumns,
          fields,
          active: draftActive,
        })
        toast.success('Section enregistrée', title)
        closeEditor()
      }
      setSeedTick((n) => n + 1)
    } catch (e) {
      toast.error(
        'Enregistrement impossible',
        e instanceof Error ? e.message : 'Erreur locale',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (section: ProductFormSection) => {
    if (
      !window.confirm(
        `Supprimer la section « ${section.title} » ? Les valeurs déjà saisies sur les articles restent en base.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteProductFormSection(section.id)
      if (editingId === section.id) closeEditor()
      toast.success('Section supprimée', section.title)
      setSeedTick((n) => n + 1)
    } catch (e) {
      toast.error(
        'Suppression impossible',
        e instanceof Error ? e.message : 'Erreur locale',
      )
    } finally {
      setBusy(false)
    }
  }

  const showEditor = creating || editing != null

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight text-ink">
                Formulaire articles — {domainLabel}
              </h3>
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-muted">
                Créez des sections et des champs affichés à la création / édition
                d’un article pour cette activité. Les données sont stockées sur
                chaque produit.
              </p>
            </div>
            <Button variant="accent" size="sm" onClick={openCreate}>
              Nouvelle section
            </Button>
          </div>

          {sections.length === 0 ? (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13px] text-ink-muted">
              Aucune section pour ce domaine. Cliquez sur « Nouvelle section »
              ou changez d’activité pour charger les modèles par défaut.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-white">
              {sections.map((section) => (
                <li
                  key={section.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink">
                        {section.title}
                      </span>
                      {!section.active ? (
                        <Badge tone="neutral">Masquée</Badge>
                      ) : null}
                      {section.isDefault ? (
                        <Badge tone="info">Modèle</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {section.fields.length} champ
                      {section.fields.length > 1 ? 's' : ''} ·{' '}
                      {section.columns} colonne
                      {section.columns > 1 ? 's' : ''}
                      {section.description
                        ? ` · ${section.description}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(section)}
                    >
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void handleDelete(section)}
                    >
                      Supprimer
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showEditor ? (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[14px] font-semibold text-ink">
                {creating ? 'Nouvelle section' : `Modifier — ${editing?.title}`}
              </h4>
              <Button size="sm" variant="ghost" onClick={closeEditor}>
                Fermer
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Titre" required className="sm:col-span-2">
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Ex. Infos rayon"
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea
                  value={draftDescription}
                  onChange={(e) => setDraftDescription(e.target.value)}
                  rows={2}
                  placeholder="Aide affichée sous le titre"
                />
              </Field>
              <Field label="Colonnes">
                <Select
                  value={String(draftColumns)}
                  onChange={(e) =>
                    setDraftColumns(Number(e.target.value) as 1 | 2 | 3)
                  }
                >
                  <option value="1">1 colonne</option>
                  <option value="2">2 colonnes</option>
                  <option value="3">3 colonnes</option>
                </Select>
              </Field>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <Switch
                    checked={draftActive}
                    onChange={(e) => setDraftActive(e.target.checked)}
                  />
                  Section active (visible sur le formulaire)
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-ink">Champs</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setDraftFields((prev) => [...prev, blankField()])
                  }
                >
                  Ajouter un champ
                </Button>
              </div>

              {draftFields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid gap-2 rounded-2xl border border-border/70 bg-surface-2/40 p-3 sm:grid-cols-2 lg:grid-cols-6"
                >
                  <Field label="Libellé" required className="lg:col-span-2">
                    <Input
                      value={field.label}
                      onChange={(e) =>
                        patchField(index, { label: e.target.value })
                      }
                      placeholder="Ex. Emplacement"
                    />
                  </Field>
                  <Field label="Clé" hint="stockage interne">
                    <Input
                      value={field.key}
                      onChange={(e) =>
                        patchField(index, { key: e.target.value })
                      }
                      placeholder="auto"
                      className="font-mono-nums text-[12px]"
                    />
                  </Field>
                  <Field label="Type">
                    <Select
                      value={field.type}
                      onChange={(e) =>
                        patchField(index, {
                          type: e.target.value as ProductFormFieldType,
                        })
                      }
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Largeur">
                    <Select
                      value={String(field.span ?? 1)}
                      onChange={(e) =>
                        patchField(index, {
                          span: Number(e.target.value) as 1 | 2 | 3,
                        })
                      }
                    >
                      <option value="1">1 col.</option>
                      <option value="2">2 col.</option>
                      <option value="3">3 col.</option>
                    </Select>
                  </Field>
                  <div className="flex flex-wrap items-end gap-2 pb-1 lg:col-span-6">
                    <label className="flex items-center gap-2 text-[12px] text-ink">
                      <Switch
                        checked={!!field.required}
                        onChange={(e) =>
                          patchField(index, { required: e.target.checked })
                        }
                      />
                      Obligatoire
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraftFields((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      Retirer
                    </Button>
                  </div>
                  {field.type === 'select' ? (
                    <Field
                      label="Options (une par ligne)"
                      className="sm:col-span-2 lg:col-span-6"
                    >
                      <Textarea
                        value={(field.options ?? []).join('\n')}
                        onChange={(e) =>
                          patchField(index, {
                            options: e.target.value.split('\n'),
                          })
                        }
                        rows={3}
                        placeholder={'Option A\nOption B'}
                      />
                    </Field>
                  ) : null}
                  {field.type !== 'boolean' && field.type !== 'select' ? (
                    <Field
                      label="Placeholder"
                      className="sm:col-span-2 lg:col-span-3"
                    >
                      <Input
                        value={field.placeholder ?? ''}
                        onChange={(e) =>
                          patchField(index, { placeholder: e.target.value })
                        }
                      />
                    </Field>
                  ) : null}
                  <Field
                    label="Aide"
                    className={
                      field.type === 'boolean' || field.type === 'select'
                        ? 'sm:col-span-2 lg:col-span-6'
                        : 'sm:col-span-2 lg:col-span-3'
                    }
                  >
                    <Input
                      value={field.hint ?? ''}
                      onChange={(e) =>
                        patchField(index, { hint: e.target.value })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={closeEditor}>
                Annuler
              </Button>
              <Button
                variant="accent"
                loading={busy}
                onClick={() => void handleSave()}
              >
                Enregistrer la section
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
