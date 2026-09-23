import type { BusinessDomain } from './businessDomain'
import { db } from '../db/db'
import type {
  ProductFormField,
  ProductFormFieldType,
  ProductFormSection,
} from '../db/types'

function field(
  key: string,
  label: string,
  type: ProductFormFieldType,
  extra?: Partial<ProductFormField>,
): ProductFormField {
  return {
    id: crypto.randomUUID(),
    key,
    label,
    type,
    span: 1,
    ...extra,
  }
}

/** Sections métier proposées par défaut selon l’activité. */
export function defaultProductFormSectionsForDomain(
  domain: BusinessDomain,
): Omit<ProductFormSection, 'id' | 'createdAt' | 'updatedAt'>[] {
  const common = {
    domain,
    active: true,
    isDefault: true,
    columns: 2 as const,
  }

  switch (domain) {
    case 'pharmacy':
      return [
        {
          ...common,
          title: 'Infos pharmaceutiques',
          description: 'Identifiants et posologie pour le rayon pharmacie.',
          sortOrder: 100,
          fields: [
            field('cip', 'Code CIP / EAN', 'text', {
              placeholder: '34009…',
              hint: 'Optionnel',
            }),
            field('dosage', 'Dosage', 'text', { placeholder: 'Ex. 500 mg' }),
            field('forme', 'Forme galénique', 'select', {
              options: ['Comprimé', 'Sirop', 'Pommade', 'Gélule', 'Injectable', 'Autre'],
            }),
            field('dci', 'DCI / principe actif', 'text', { span: 2 }),
          ],
        },
      ]
    case 'beauty':
      return [
        {
          ...common,
          title: 'Prestation beauté',
          description: 'Durée et type de soin pour le planning.',
          sortOrder: 100,
          fields: [
            field('serviceDurationMin', 'Durée (min)', 'number', {
              placeholder: '30',
            }),
            field('serviceKind', 'Type de soin', 'select', {
              options: ['Coiffure', 'Soin visage', 'Onglerie', 'Maquillage', 'Autre'],
            }),
            field('skinType', 'Type de peau / cheveu', 'text'),
            field('notesSoin', 'Conseils / précautions', 'textarea', { span: 2 }),
          ],
        },
      ]
    case 'restaurant':
    case 'bakery':
      return [
        {
          ...common,
          title: domain === 'bakery' ? 'Fiche fabrication' : 'Fiche carte',
          description: 'Allergènes, temps et conservation.',
          sortOrder: 100,
          fields: [
            field('prepTimeMin', 'Temps de préparation (min)', 'number'),
            field('allergens', 'Allergènes', 'textarea', {
              span: 2,
              placeholder: 'Gluten, lactose…',
            }),
            field('conservation', 'Conservation', 'text', {
              placeholder: 'Ex. 48 h au frais',
            }),
            field('portion', 'Portion / poids', 'text'),
          ],
        },
      ]
    case 'it':
      return [
        {
          ...common,
          title: 'Fiche technique',
          description: 'Modèle, garantie et références IT.',
          sortOrder: 100,
          fields: [
            field('model', 'Modèle', 'text'),
            field('warrantyMonths', 'Garantie (mois)', 'number', {
              placeholder: '12',
            }),
            field('os', 'Système / compatibilité', 'text'),
            field('techNotes', 'Notes techniques', 'textarea', { span: 2 }),
          ],
        },
      ]
    case 'fashion':
      return [
        {
          ...common,
          title: 'Confection',
          description: 'Taille, matière et coloris.',
          sortOrder: 100,
          fields: [
            field('size', 'Taille', 'text', { placeholder: 'M / 40…' }),
            field('color', 'Couleur', 'text'),
            field('material', 'Matière', 'text'),
            field('gender', 'Genre', 'select', {
              options: ['Femme', 'Homme', 'Enfant', 'Mixte'],
            }),
          ],
        },
      ]
    case 'hardware':
      return [
        {
          ...common,
          title: 'Caractéristiques chantier',
          description: 'Norme, matière et usage.',
          sortOrder: 100,
          fields: [
            field('norm', 'Norme / certification', 'text'),
            field('materialHw', 'Matière', 'text'),
            field('usage', 'Usage recommandé', 'textarea', { span: 2 }),
          ],
        },
      ]
    case 'wholesale':
      return [
        {
          ...common,
          title: 'Conditionnement gros',
          description: 'Unités par carton et seuil de commande.',
          sortOrder: 100,
          fields: [
            field('unitsPerCarton', 'Unités / carton', 'number'),
            field('minOrderQty', 'Commande mini', 'number'),
            field('palletQty', 'Unités / palette', 'number'),
          ],
        },
      ]
    case 'hotel':
      return [
        {
          ...common,
          title: 'Service hôtel',
          description: 'Lieu et disponibilité room service / spa.',
          sortOrder: 100,
          fields: [
            field('serviceLocation', 'Lieu', 'select', {
              options: ['Chambre', 'Restaurant', 'Spa', 'Mini-bar', 'Autre'],
            }),
            field('availableHours', 'Horaires', 'text', {
              placeholder: 'Ex. 7h–22h',
            }),
          ],
        },
      ]
    case 'retail':
    default:
      return [
        {
          ...common,
          title: 'Infos rayon',
          description: 'Emplacement et compléments boutique.',
          sortOrder: 100,
          fields: [
            field('shelfLocation', 'Emplacement rayon', 'text', {
              placeholder: 'Ex. Allée B / Gondole 3',
            }),
            field('season', 'Saisonnalité', 'select', {
              options: ['Toute l’année', 'Saison sèche', 'Saison des pluies', 'Fêtes'],
            }),
            field('retailNotes', 'Notes internes', 'textarea', { span: 2 }),
          ],
        },
      ]
  }
}

export async function listProductFormSections(
  domain: BusinessDomain,
): Promise<ProductFormSection[]> {
  const rows = await db.productFormSections
    .where('domain')
    .equals(domain)
    .toArray()
  return rows
    .filter((s) => s.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'fr'))
}

export async function listAllProductFormSections(
  domain: BusinessDomain,
): Promise<ProductFormSection[]> {
  const rows = await db.productFormSections
    .where('domain')
    .equals(domain)
    .toArray()
  return rows.sort(
    (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'fr'),
  )
}

/** Crée les sections par défaut si le domaine n’en a encore aucune. */
export async function ensureDefaultProductFormSections(
  domain: BusinessDomain,
): Promise<number> {
  const existing = await db.productFormSections
    .where('domain')
    .equals(domain)
    .count()
  if (existing > 0) return 0
  const now = Date.now()
  const defs = defaultProductFormSectionsForDomain(domain)
  let added = 0
  for (const def of defs) {
    await db.productFormSections.add({
      ...def,
      id: crypto.randomUUID(),
      fields: def.fields.map((f) => ({ ...f, id: crypto.randomUUID() })),
      createdAt: now,
      updatedAt: now,
    })
    added += 1
  }
  return added
}

export async function createProductFormSection(input: {
  domain: BusinessDomain
  title: string
  description?: string
  columns?: 1 | 2 | 3
  fields?: ProductFormField[]
}): Promise<ProductFormSection> {
  const title = input.title.trim()
  if (!title) throw new Error('Indiquez un titre de section.')
  const siblings = await db.productFormSections
    .where('domain')
    .equals(input.domain)
    .toArray()
  const maxOrder = siblings.reduce((m, s) => Math.max(m, s.sortOrder), 0)
  const now = Date.now()
  const section: ProductFormSection = {
    id: crypto.randomUUID(),
    domain: input.domain,
    title,
    description: input.description?.trim() || undefined,
    sortOrder: maxOrder + 10,
    columns: input.columns ?? 2,
    fields: (input.fields ?? []).map((f) => ({
      ...f,
      id: f.id || crypto.randomUUID(),
      key: f.key.trim() || slugKey(f.label),
    })),
    active: true,
    isDefault: false,
    createdAt: now,
    updatedAt: now,
  }
  await db.productFormSections.add(section)
  return section
}

export async function updateProductFormSection(
  id: string,
  patch: Partial<
    Pick<
      ProductFormSection,
      | 'title'
      | 'description'
      | 'columns'
      | 'fields'
      | 'sortOrder'
      | 'active'
    >
  >,
): Promise<ProductFormSection> {
  const row = await db.productFormSections.get(id)
  if (!row) throw new Error('Section introuvable.')
  const next: ProductFormSection = {
    ...row,
    ...patch,
    title: patch.title?.trim() || row.title,
    description:
      patch.description !== undefined
        ? patch.description.trim() || undefined
        : row.description,
    fields: patch.fields
      ? patch.fields.map((f) => ({
          ...f,
          id: f.id || crypto.randomUUID(),
          key: f.key.trim() || slugKey(f.label),
        }))
      : row.fields,
    updatedAt: Date.now(),
  }
  await db.productFormSections.put(next)
  return next
}

export async function deleteProductFormSection(id: string): Promise<void> {
  await db.productFormSections.delete(id)
}

export function slugKey(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || `field_${Date.now().toString(36)}`
}

export function emptyCustomFieldValues(
  sections: ProductFormSection[],
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const section of sections) {
    for (const f of section.fields) {
      out[f.key] = f.type === 'boolean' ? false : null
    }
  }
  return out
}

export function mergeCustomFieldValues(
  sections: ProductFormSection[],
  existing?: Record<string, string | number | boolean | null> | null,
): Record<string, string | number | boolean | null> {
  const base = emptyCustomFieldValues(sections)
  if (!existing) return base
  for (const key of Object.keys(base)) {
    if (existing[key] !== undefined) base[key] = existing[key]!
  }
  // conserver clés orphelines (sections supprimées)
  for (const [key, value] of Object.entries(existing)) {
    if (!(key in base)) base[key] = value
  }
  return base
}

export function validateCustomFields(
  sections: ProductFormSection[],
  values: Record<string, string | number | boolean | null>,
): string | null {
  for (const section of sections) {
    for (const f of section.fields) {
      const v = values[f.key]
      if (!f.required) continue
      if (f.type === 'boolean') continue
      if (v == null || String(v).trim() === '') {
        return `Champ obligatoire : ${f.label} (${section.title}).`
      }
    }
  }
  return null
}

export function sanitizeCustomFieldsForSave(
  sections: ProductFormSection[],
  values: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | undefined {
  const out: Record<string, string | number | boolean | null> = {}
  let has = false
  for (const section of sections) {
    for (const f of section.fields) {
      const raw = values[f.key]
      if (f.type === 'boolean') {
        out[f.key] = Boolean(raw)
        has = true
        continue
      }
      if (raw == null || String(raw).trim() === '') {
        out[f.key] = null
        continue
      }
      if (f.type === 'number') {
        const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
        out[f.key] = Number.isFinite(n) ? n : null
      } else {
        out[f.key] = String(raw).trim()
      }
      has = true
    }
  }
  return has ? out : undefined
}
