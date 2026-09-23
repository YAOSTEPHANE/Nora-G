import { PrismaClient } from '@prisma/client'

/**
 * Sans DATABASE_URL : en local → Mongo local ; sur Vercel → URL factice à échec rapide
 * (évite le hang sur 127.0.0.1 / DNS_HOSTNAME_RESOLVED_PRIVATE).
 */
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  process.env.DATABASE_URL = process.env.VERCEL
    ? 'mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500'
    : 'mongodb://127.0.0.1:27017/nora'
}

export const prisma = new PrismaClient()
