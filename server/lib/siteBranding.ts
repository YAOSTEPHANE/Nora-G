import { prisma } from './prisma.js'

const CONFIG_KEY = 'default'

export type SiteBrandingPublic = {
  logoUrl: string | null
  brandName: string | null
  updatedAt: string | null
}

export async function getSiteBranding(): Promise<SiteBrandingPublic> {
  const row = await prisma.platformSiteBranding.findUnique({
    where: { key: CONFIG_KEY },
  })
  if (!row) {
    return { logoUrl: null, brandName: null, updatedAt: null }
  }
  return {
    logoUrl: row.logoUrl?.trim() || null,
    brandName: row.brandName?.trim() || null,
    updatedAt: row.updatedAt.toISOString(),
  }
}
