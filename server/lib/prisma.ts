import { PrismaClient } from '@prisma/client'

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/nora'
}

export const prisma = new PrismaClient()
