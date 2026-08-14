import { Router } from 'express'
import { getSiteBranding } from '../lib/siteBranding.js'

/** Routes publiques liées à la plateforme (sans console admin). */
export const platformPublicRouter = Router()

/** Branding public (page d’accueil) — pas d’auth. */
platformPublicRouter.get('/site-branding', async (_req, res) => {
  try {
    res.json(await getSiteBranding())
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Impossible de charger le branding.'
    res.status(500).json({ error: message })
  }
})
