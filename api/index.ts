/**
 * Entrypoint serverless Vercel (racine monorepo).
 * Expose l’app Express sous /api/* — requis car Root Directory = `.`.
 */
import { app } from '../server/app.js'

export default app
