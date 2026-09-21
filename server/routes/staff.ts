import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError, z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireActiveOrg, requireOrg } from '../lib/orgAuth.js'
import {
  assertStaffQuota,
  assertSubscriptionActive,
} from '../lib/quotaEnforcement.js'
import {
  hashStaffPassword,
  hashStaffPin,
  validateStaffPin,
  verifyStaffPin,
  verifyStaffPassword,
} from '../lib/staffCredentials.js'
import { logEvent } from '../lib/structuredLog.js'

export const staffRouter = Router()

const staffRoleSchema = z.enum(['admin', 'gerant', 'caissier', 'cuisinier'])

function serializeStaff(row: {
  profileId: string
  displayName: string
  initials: string
  role: string
  storeId: string | null
  active: boolean
  updatedAt: Date
  permissionOverrides?: unknown
  customRoleId?: string | null
}) {
  return {
    id: row.profileId,
    displayName: row.displayName,
    initials: row.initials,
    role: row.role,
    storeId: row.storeId,
    active: row.active,
    updatedAt: row.updatedAt.toISOString(),
    permissionOverrides:
      row.permissionOverrides &&
      typeof row.permissionOverrides === 'object' &&
      !Array.isArray(row.permissionOverrides)
        ? row.permissionOverrides
        : undefined,
    customRoleId: row.customRoleId ?? undefined,
  }
}

staffRouter.get('/org/staff', async (req, res) => {
  const org = await requireOrg(req, res)
  if (!org) return

  let rows = await prisma.staffMember.findMany({
    where: { organizationId: org.id, revokedAt: null },
    orderBy: { displayName: 'asc' },
  })

  if (rows.length === 0) {
    const { ensureOwnerStaffMember } = await import('../lib/ensureOwnerStaff.js')
    await ensureOwnerStaffMember(org)
    rows = await prisma.staffMember.findMany({
      where: { organizationId: org.id, revokedAt: null },
      orderBy: { displayName: 'asc' },
    })
  }

  res.json({
    staff: rows.map(serializeStaff),
    maxStaff: (await import('../lib/quotaEnforcement.js')).planLimits(org).maxStaff,
  })
})

staffRouter.post('/org/staff', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org) return

    const body = z
      .object({
        profileId: z.string().min(3).optional(),
        displayName: z.string().min(3),
        role: staffRoleSchema,
        storeId: z.string().optional(),
        pin: z.string(),
        password: z.string().optional(),
        permissionOverrides: z.record(z.unknown()).nullable().optional(),
        customRoleId: z.string().nullable().optional(),
      })
      .parse(req.body)

    const pinError = validateStaffPin(body.pin)
    if (pinError) {
      res.status(400).json({ error: pinError })
      return
    }

    const quotaError = await assertStaffQuota(org, 1)
    if (quotaError) {
      res.status(403).json({ error: quotaError })
      return
    }

    const profileId = body.profileId ?? `profile-${crypto.randomUUID()}`
    const initials = body.displayName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'NN'

    const created = await prisma.staffMember.create({
      data: {
        organizationId: org.id,
        profileId,
        displayName: body.displayName.trim(),
        initials,
        role: body.role,
        storeId: body.storeId?.trim() || null,
        pinHash: hashStaffPin(body.pin.trim()),
        passwordHash: body.password?.trim()
          ? hashStaffPassword(body.password.trim())
          : null,
        active: true,
        permissionOverrides:
          body.permissionOverrides === undefined
            ? undefined
            : body.permissionOverrides === null
              ? null
              : (body.permissionOverrides as Prisma.InputJsonValue),
        customRoleId: body.customRoleId?.trim() || null,
      },
    })

    logEvent('info', 'staff.created', {
      organizationId: org.id,
      profileId: created.profileId,
    })

    res.status(201).json(serializeStaff(created))
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Données invalides.', issues: err.issues })
      return
    }
    console.error('[staff/create]', err)
    res.status(500).json({ error: 'Impossible de créer l’utilisateur.' })
  }
})

staffRouter.patch('/org/staff/:profileId', async (req, res) => {
  try {
    const org = await requireActiveOrg(req, res)
    if (!org) return

    const profileId = req.params.profileId
    const existing = await prisma.staffMember.findFirst({
      where: { organizationId: org.id, profileId, revokedAt: null },
    })
    if (!existing) {
      res.status(404).json({ error: 'Utilisateur introuvable.' })
      return
    }

    const body = z
      .object({
        displayName: z.string().min(3).optional(),
        role: staffRoleSchema.optional(),
        storeId: z.string().nullable().optional(),
        pin: z.string().optional(),
        password: z.string().nullable().optional(),
        active: z.boolean().optional(),
        permissionOverrides: z.record(z.unknown()).nullable().optional(),
        customRoleId: z.string().nullable().optional(),
      })
      .parse(req.body)

    if (body.active === true && !existing.active) {
      const quotaError = await assertStaffQuota(org, 1)
      if (quotaError) {
        res.status(403).json({ error: quotaError })
        return
      }
    }

    if (body.pin) {
      const pinError = validateStaffPin(body.pin)
      if (pinError) {
        res.status(400).json({ error: pinError })
        return
      }
    }

    const updated = await prisma.staffMember.update({
      where: { id: existing.id },
      data: {
        displayName: body.displayName?.trim(),
        role: body.role,
        storeId: body.storeId === undefined ? undefined : body.storeId?.trim() || null,
        pinHash: body.pin ? hashStaffPin(body.pin.trim()) : undefined,
        passwordHash:
          body.password === undefined
            ? undefined
            : body.password
              ? hashStaffPassword(body.password.trim())
              : null,
        active: body.active,
        permissionOverrides:
          body.permissionOverrides === undefined
            ? undefined
            : body.permissionOverrides === null
              ? null
              : (body.permissionOverrides as Prisma.InputJsonValue),
        customRoleId:
          body.customRoleId === undefined
            ? undefined
            : body.customRoleId?.trim() || null,
      },
    })

    res.json(serializeStaff(updated))
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Données invalides.' })
      return
    }
    console.error('[staff/patch]', err)
    res.status(500).json({ error: 'Impossible de mettre à jour l’utilisateur.' })
  }
})

staffRouter.delete('/org/staff/:profileId', async (req, res) => {
  const org = await requireActiveOrg(req, res)
  if (!org) return

  const profileId = req.params.profileId
  const existing = await prisma.staffMember.findFirst({
    where: { organizationId: org.id, profileId, revokedAt: null },
  })
  if (!existing) {
    res.status(404).json({ error: 'Utilisateur introuvable.' })
    return
  }

  await prisma.staffMember.update({
    where: { id: existing.id },
    data: { active: false, revokedAt: new Date() },
  })

  res.json({ ok: true })
})

staffRouter.post('/org/staff/verify', async (req, res) => {
  try {
    const org = await requireOrg(req, res)
    if (!org) return

    const blocked = assertSubscriptionActive(org)
    if (blocked) {
      res.status(402).json({ error: blocked })
      return
    }

    const body = z
      .object({
        profileId: z.string(),
        secret: z.string().min(1),
      })
      .parse(req.body)

    const member = await prisma.staffMember.findFirst({
      where: {
        organizationId: org.id,
        profileId: body.profileId,
        active: true,
        revokedAt: null,
      },
    })
    if (!member) {
      res.status(404).json({ error: 'Utilisateur introuvable.' })
      return
    }

    const secret = body.secret.trim()
    const ok =
      verifyStaffPin(secret, member.pinHash) ||
      (member.passwordHash ? verifyStaffPassword(secret, member.passwordHash) : false)

    if (!ok) {
      res.status(401).json({ ok: false, error: 'PIN ou mot de passe incorrect.' })
      return
    }

    res.json({
      ok: true,
      profile: serializeStaff(member),
    })
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Données invalides.' })
      return
    }
    res.status(500).json({ error: 'Vérification impossible.' })
  }
})
