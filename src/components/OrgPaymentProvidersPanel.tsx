import { useCallback, useEffect, useState } from 'react'
import {
  fetchOrgPaymentProviders,
  saveOrgPaymentProviders,
  type OrgPaymentProvidersStatus,
} from '../lib/subscription/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'

type Props = {
  licenseKey: string
}

export function OrgPaymentProvidersPanel({ licenseKey }: Props) {
  const toast = useToast()
  const [status, setStatus] = useState<OrgPaymentProvidersStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const [waveApiKey, setWaveApiKey] = useState('')
  const [waveWebhookSecret, setWaveWebhookSecret] = useState('')
  const [waveSigningSecret, setWaveSigningSecret] = useState('')
  const [waveDemoMode, setWaveDemoMode] = useState(false)
  const [clearWaveApiKey, setClearWaveApiKey] = useState(false)
  const [clearWaveWebhook, setClearWaveWebhook] = useState(false)
  const [clearWaveSigning, setClearWaveSigning] = useState(false)

  const [cinetpayApiKey, setCinetpayApiKey] = useState('')
  const [cinetpaySiteId, setCinetpaySiteId] = useState('')
  const [cinetpayDemoMode, setCinetpayDemoMode] = useState(false)
  const [clearCinetpayApiKey, setClearCinetpayApiKey] = useState(false)
  const [clearCinetpaySiteId, setClearCinetpaySiteId] = useState(false)

  const applyStatus = useCallback((next: OrgPaymentProvidersStatus) => {
    setStatus(next)
    setWaveDemoMode(next.wave.demoMode)
    setCinetpayDemoMode(next.orangeMoney.demoMode)
  }, [])

  const reload = useCallback(async () => {
    try {
      const next = await fetchOrgPaymentProviders(licenseKey)
      applyStatus(next)
    } catch (error) {
      toast.error(
        'Config paiement',
        error instanceof Error ? error.message : 'Chargement impossible',
      )
    }
  }, [applyStatus, licenseKey, toast])

  useEffect(() => {
    void reload()
  }, [reload])

  const handleSave = async () => {
    setBusy(true)
    try {
      const body: Parameters<typeof saveOrgPaymentProviders>[1] = {
        waveDemoMode,
        cinetpayDemoMode,
      }
      if (clearWaveApiKey) body.waveApiKey = null
      else if (waveApiKey.trim()) body.waveApiKey = waveApiKey.trim()
      if (clearWaveWebhook) body.waveWebhookSecret = null
      else if (waveWebhookSecret.trim()) {
        body.waveWebhookSecret = waveWebhookSecret.trim()
      }
      if (clearWaveSigning) body.waveSigningSecret = null
      else if (waveSigningSecret.trim()) {
        body.waveSigningSecret = waveSigningSecret.trim()
      }
      if (clearCinetpayApiKey) body.cinetpayApiKey = null
      else if (cinetpayApiKey.trim()) body.cinetpayApiKey = cinetpayApiKey.trim()
      if (clearCinetpaySiteId) body.cinetpaySiteId = null
      else if (cinetpaySiteId.trim()) body.cinetpaySiteId = cinetpaySiteId.trim()

      const next = await saveOrgPaymentProviders(licenseKey, body)
      applyStatus(next)
      setWaveApiKey('')
      setWaveWebhookSecret('')
      setWaveSigningSecret('')
      setCinetpayApiKey('')
      setCinetpaySiteId('')
      setClearWaveApiKey(false)
      setClearWaveWebhook(false)
      setClearWaveSigning(false)
      setClearCinetpayApiKey(false)
      setClearCinetpaySiteId(false)
      toast.success(
        'Paiements enregistrés',
        'Ces clés sont propres à votre boutique.',
      )
    } catch (error) {
      toast.error(
        'Enregistrement impossible',
        error instanceof Error ? error.message : 'Erreur',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h3 className="text-[14px] font-semibold text-zinc-900">
            Wave & Orange Money (votre boutique)
          </h3>
          <p className="mt-1 text-[12px] text-zinc-500">
            Chaque magasin a ses propres clés. Les clients paient sur{' '}
            <strong>votre</strong> compte Wave / CinetPay (Orange Money), pas
            celui de la plateforme.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold">Wave</p>
              <Badge tone={status?.wave.enabled ? 'success' : 'neutral'}>
                {status?.wave.enabled ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
            <Field label="Clé API Wave">
              <Input
                type="password"
                autoComplete="off"
                value={waveApiKey}
                disabled={busy || clearWaveApiKey}
                onChange={(e) => {
                  setWaveApiKey(e.target.value)
                  setClearWaveApiKey(false)
                }}
                placeholder={
                  status?.wave.apiKeyHint
                    ? `Conservée (${status.wave.apiKeyHint})`
                    : 'wave_ci_prod_…'
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={clearWaveApiKey}
                onChange={(e) => setClearWaveApiKey(e.target.checked)}
                disabled={busy}
              />
              Effacer la clé
            </label>
            <Field label="Secret webhook">
              <Input
                type="password"
                autoComplete="off"
                value={waveWebhookSecret}
                disabled={busy || clearWaveWebhook}
                onChange={(e) => {
                  setWaveWebhookSecret(e.target.value)
                  setClearWaveWebhook(false)
                }}
                placeholder={
                  status?.wave.webhookSecretSet
                    ? 'Conservé — laisser vide'
                    : 'wave_sn_WHS_…'
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={clearWaveWebhook}
                onChange={(e) => setClearWaveWebhook(e.target.checked)}
                disabled={busy}
              />
              Effacer le secret webhook
            </label>
            <Field label="Secret signature (optionnel)">
              <Input
                type="password"
                autoComplete="off"
                value={waveSigningSecret}
                disabled={busy || clearWaveSigning}
                onChange={(e) => {
                  setWaveSigningSecret(e.target.value)
                  setClearWaveSigning(false)
                }}
                placeholder={
                  status?.wave.signingSecretSet
                    ? 'Conservé — laisser vide'
                    : 'Optionnel'
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={clearWaveSigning}
                onChange={(e) => setClearWaveSigning(e.target.checked)}
                disabled={busy}
              />
              Effacer le secret signature
            </label>
            <label className="flex items-center justify-between gap-2 text-[12px]">
              <span>Mode démo Wave</span>
              <Switch
                checked={waveDemoMode}
                disabled={busy}
                onChange={(e) => setWaveDemoMode(e.target.checked)}
              />
            </label>
            {status?.webhookUrls.wave ? (
              <p className="break-all font-mono text-[10px] text-zinc-400">
                Webhook : {status.webhookUrls.wave}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[13px] font-semibold">Orange Money</p>
              <Badge tone={status?.orangeMoney.enabled ? 'success' : 'neutral'}>
                {status?.orangeMoney.enabled ? 'Actif' : 'Inactif'}
              </Badge>
            </div>
            <p className="text-[11px] text-zinc-500">
              Via CinetPay (canal ORANGE_MONEY).
            </p>
            <Field label="Clé API CinetPay">
              <Input
                type="password"
                autoComplete="off"
                value={cinetpayApiKey}
                disabled={busy || clearCinetpayApiKey}
                onChange={(e) => {
                  setCinetpayApiKey(e.target.value)
                  setClearCinetpayApiKey(false)
                }}
                placeholder={
                  status?.orangeMoney.apiKeyHint
                    ? `Conservée (${status.orangeMoney.apiKeyHint})`
                    : 'Clé API'
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={clearCinetpayApiKey}
                onChange={(e) => setClearCinetpayApiKey(e.target.checked)}
                disabled={busy}
              />
              Effacer la clé
            </label>
            <Field label="Site ID">
              <Input
                type="password"
                autoComplete="off"
                value={cinetpaySiteId}
                disabled={busy || clearCinetpaySiteId}
                onChange={(e) => {
                  setCinetpaySiteId(e.target.value)
                  setClearCinetpaySiteId(false)
                }}
                placeholder={
                  status?.orangeMoney.siteIdHint
                    ? `Conservé (${status.orangeMoney.siteIdHint})`
                    : 'Site ID'
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-[11px] text-zinc-600">
              <input
                type="checkbox"
                checked={clearCinetpaySiteId}
                onChange={(e) => setClearCinetpaySiteId(e.target.checked)}
                disabled={busy}
              />
              Effacer le Site ID
            </label>
            <label className="flex items-center justify-between gap-2 text-[12px]">
              <span>Mode démo CinetPay</span>
              <Switch
                checked={cinetpayDemoMode}
                disabled={busy}
                onChange={(e) => setCinetpayDemoMode(e.target.checked)}
              />
            </label>
            {status?.webhookUrls.cinetpay ? (
              <p className="break-all font-mono text-[10px] text-zinc-400">
                Notify : {status.webhookUrls.cinetpay}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {busy ? 'Enregistrement…' : 'Enregistrer mes clés'}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void reload()}
          >
            Actualiser
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
