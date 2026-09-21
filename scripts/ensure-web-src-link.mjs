/**
 * Crée le lien apps/web/src → ../../src (évite externalDir / double React).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const linkPath = path.join(repoRoot, 'apps', 'web', 'src')
const targetPath = path.join(repoRoot, 'src')

function isEmptyDir(dir) {
  try {
    return fs.readdirSync(dir).length === 0
  } catch {
    return false
  }
}

function removeLinkIfAny() {
  try {
    const st = fs.lstatSync(linkPath)
    if (st.isSymbolicLink()) {
      fs.unlinkSync(linkPath)
      return
    }
    if (st.isDirectory()) {
      // Dossier vide (souvent un accident Windows) : à remplacer par la junction.
      if (isEmptyDir(linkPath)) {
        fs.rmdirSync(linkPath)
        return
      }
      // Ne pas supprimer un vrai dossier source (copie locale non vide).
      return
    }
  } catch {
    // absent
  }
}

function linkPointsToSrc() {
  try {
    const st = fs.lstatSync(linkPath)
    // Junction Windows : isSymbolicLink() est souvent false ; realpath doit pointer vers root/src.
    if (st.isDirectory()) {
      const resolved = fs.realpathSync(linkPath)
      if (resolved === fs.realpathSync(targetPath)) return true
      // Copie locale : OK si le contexte de navigation est présent
      return fs.existsSync(path.join(linkPath, 'lib', 'sitePathContext.tsx'))
    }
    if (st.isSymbolicLink()) {
      const resolved = fs.realpathSync(linkPath)
      return resolved === fs.realpathSync(targetPath)
    }
  } catch {
    return false
  }
  return false
}

if (linkPointsToSrc()) {
  console.log('[ensure-web-src-link] apps/web/src OK')
  process.exit(0)
}

removeLinkIfAny()

if (process.platform === 'win32') {
  // Junction Windows (après removeLinkIfAny : absent ou déjà OK)
  if (fs.existsSync(linkPath)) {
    if (linkPointsToSrc()) {
      console.log('[ensure-web-src-link] apps/web/src déjà présent (win)')
      process.exit(0)
    }
    console.error(
      '[ensure-web-src-link] apps/web/src existe mais ne pointe pas vers ../../src — supprimer manuellement puis relancer.',
    )
    process.exit(1)
  }
  const r = spawnSync(
    'cmd',
    ['/c', 'mklink', '/J', linkPath, targetPath],
    { encoding: 'utf8' },
  )
  if (r.status !== 0) {
    console.error(r.stdout || r.stderr || 'mklink failed')
    process.exit(1)
  }
  console.log('[ensure-web-src-link]', r.stdout.trim())
} else {
  const rel = path.relative(path.dirname(linkPath), targetPath)
  fs.symlinkSync(rel, linkPath, 'dir')
  console.log('[ensure-web-src-link] symlink créé →', rel)
}
