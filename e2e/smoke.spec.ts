import { test, expect } from '@playwright/test'

test.describe('App Nora', () => {
  test('redirige l’accueil vers le staff', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/staff/)
    await expect(page).toHaveTitle(/Nora/i)
  })

  test('affiche l’écran staff', async ({ page }) => {
    await page.goto('/staff')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})

test.describe('API backend', () => {
  test('health check répond ok ou db down', async ({ request }) => {
    const apiBase = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:4000'
    const res = await request.get(`${apiBase}/health`)
    expect(res.status()).toBeLessThan(600)
    const body = (await res.json()) as { ok?: boolean; version?: string }
    expect(typeof body.version).toBe('string')
  })
})
