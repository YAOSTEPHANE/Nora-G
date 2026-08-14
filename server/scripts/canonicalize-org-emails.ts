/**
 * Canonicalise les e-mails Organisation (Gmail) et résout les doublons
 * avant d’appliquer l’index unique sur `email`.
 *
 * Usage: npx tsx server/scripts/canonicalize-org-emails.ts
 */
import 'dotenv/config'
import { prisma } from '../lib/prisma.js'
import { normalizeOwnerEmail } from '../lib/ownerAuth.js'

type OrgRow = {
  id: string
  email: string
  createdAt: Date
  status: string
}

function preferKeep(a: OrgRow, b: OrgRow): OrgRow {
  const rank = (o: OrgRow) => {
    if (o.status === 'active') return 0
    if (o.status === 'trialing') return 1
    if (o.status === 'past_due') return 2
    return 3
  }
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra < rb ? a : b
  return a.createdAt <= b.createdAt ? a : b
}

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, email: true, createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  })

  const groups = new Map<string, OrgRow[]>()
  for (const org of orgs) {
    const canonical = normalizeOwnerEmail(org.email)
    const list = groups.get(canonical) ?? []
    list.push(org)
    groups.set(canonical, list)
  }

  let updated = 0
  let quarantined = 0

  for (const [canonical, members] of groups) {
    const keeper = members.reduce(preferKeep)
    for (const org of members) {
      if (org.id === keeper.id) {
        if (org.email !== canonical) {
          await prisma.organization.update({
            where: { id: org.id },
            data: { email: canonical },
          })
          updated += 1
        }
        continue
      }

      // Doublon : e-mail unique hors Gmail pour libérer la contrainte
      const quarantineEmail = `dup.${org.id}@nora.invalid`
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          email: quarantineEmail,
          status: org.status === 'active' || org.status === 'trialing' ? 'expired' : org.status,
        },
      })
      quarantined += 1
    }
  }

  console.log(
    `[canonicalize-org-emails] orgs=${orgs.length} misÀJour=${updated} doublonsMisDeCôté=${quarantined}`,
  )
}

main()
  .catch((err) => {
    console.error('[canonicalize-org-emails]', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
