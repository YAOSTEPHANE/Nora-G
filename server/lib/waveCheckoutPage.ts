import QRCode from 'qrcode'

export type WaveCheckoutPageInput = {
  amountFcfa: number
  merchantLabel: string
  customerPhone?: string
  /** URL Wave officielle (pay.wave.com) — redirection immédiate si présente */
  launchUrl?: string | null
  demo: boolean
  transactionId: string
  acceptAction: string
  refuseAction: string
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export async function renderWaveCheckoutPage(
  input: WaveCheckoutPageInput,
): Promise<string> {
  const amount = Math.round(input.amountFcfa).toLocaleString('fr-CI')
  const launchUrl = input.launchUrl?.trim() || ''
  const qrTarget = launchUrl || `nora:wave-demo:${input.transactionId}`
  const qrDataUrl = await QRCode.toDataURL(qrTarget, {
    margin: 2,
    width: 280,
    color: { dark: '#1d4ed8', light: '#ffffff' },
  })

  const launchUrlJs = JSON.stringify(launchUrl)
  const redirectBlock = launchUrl
    ? `<script>
(function () {
  var url = ${launchUrlJs};
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (mobile) {
    window.location.replace(url);
  } else {
    window.location.replace(url);
  }
})();
</script>
<noscript>
  <meta http-equiv="refresh" content="0;url=${escapeHtml(launchUrl)}" />
</noscript>`
    : ''

  const demoBadge = input.demo
    ? '<span class="badge">Mode démo — configurez WAVE_API_KEY pour l’app Wave réelle</span>'
    : ''

  const instructions = launchUrl
    ? `<p class="lead">Ouverture de Wave pour valider le paiement de <strong>${amount} F CFA</strong>.</p>
       <p class="hint">Sur mobile, l’application Wave s’ouvre automatiquement. Sur ordinateur, scannez le QR code avec l’app Wave CI.</p>
       <p class="hint"><a class="link" href="${escapeHtml(launchUrl)}">Ouvrir la page de paiement Wave</a></p>`
    : `<p class="lead">Simulez le paiement Wave pour <strong>${amount} F CFA</strong>.</p>
       <p class="hint">En production, cette étape ouvre l’application Wave CI ou la page Wave avec QR à scanner.</p>`

  const phoneLine = input.customerPhone
    ? `<p class="phone">${escapeHtml(input.customerPhone)}</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Paiement Wave — ${escapeHtml(input.merchantLabel)}</title>
  ${redirectBlock}
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      margin: 0;
      min-height: 100svh;
      background: linear-gradient(160deg, #eff6ff 0%, #f8fafc 45%, #fff 100%);
      color: #18181b;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.25rem;
    }
    .card {
      width: min(100%, 420px);
      background: #fff;
      border: 1px solid #e4e4e7;
      border-radius: 20px;
      padding: 1.5rem;
      box-shadow: 0 18px 50px rgba(29, 78, 216, 0.08);
      text-align: center;
    }
    .logo { border-radius: 14px; margin-bottom: 1rem; }
    .badge {
      display: inline-block;
      background: #eff6ff;
      color: #1d4ed8;
      padding: .25rem .6rem;
      border-radius: 999px;
      font-size: .72rem;
      font-weight: 600;
      margin-bottom: .75rem;
    }
    h1 { font-size: 1.2rem; margin: 0 0 .35rem; }
    .phone { color: #71717a; font-size: .9rem; margin: 0 0 .5rem; }
    .amount { font-size: 1.75rem; font-weight: 800; color: #1d4ed8; margin: .75rem 0; }
    .lead, .hint { color: #52525b; font-size: .92rem; line-height: 1.55; margin: .5rem 0; }
    .hint { font-size: .85rem; }
    .link { color: #1d4ed8; font-weight: 600; text-decoration: none; }
    .link:hover { text-decoration: underline; }
    .qr-wrap {
      margin: 1rem auto;
      padding: .75rem;
      border-radius: 16px;
      background: #f8fafc;
      border: 1px dashed #bfdbfe;
      width: fit-content;
    }
    .qr-wrap img { display: block; border-radius: 8px; }
    .qr-caption { font-size: .78rem; color: #71717a; margin-top: .5rem; }
    button {
      width: 100%;
      padding: .9rem 1rem;
      border: 0;
      border-radius: 12px;
      font-weight: 700;
      cursor: pointer;
      margin-top: .5rem;
      font-size: .95rem;
    }
    .ok { background: #2563eb; color: #fff; }
    .ko { background: #f4f4f5; color: #18181b; }
    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid #dbeafe;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin .8s linear infinite;
      margin: 1rem auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/branding/wave-logo.png" alt="Wave" width="72" height="72" />
    ${demoBadge}
    <h1>${escapeHtml(input.merchantLabel)}</h1>
    ${phoneLine}
    <div class="amount">${amount} F CFA</div>
    ${instructions}
    ${launchUrl ? '<div class="spinner" aria-hidden="true"></div>' : ''}
    <div class="qr-wrap">
      <img src="${qrDataUrl}" alt="QR code paiement Wave" width="280" height="280" />
      <p class="qr-caption">Scannez avec l’application Wave CI</p>
    </div>
    ${
      input.demo
        ? `<form method="post" action="${escapeHtml(input.acceptAction)}">
             <button class="ok" type="submit">Simuler paiement réussi (démo)</button>
           </form>
           <form method="post" action="${escapeHtml(input.refuseAction)}">
             <button class="ko" type="submit">Annuler</button>
           </form>`
        : ''
    }
  </div>
</body>
</html>`
}

export function waveOpenPath(transactionId: string): string {
  return `/api/billing/wave/open/${encodeURIComponent(transactionId)}`
}

export function buildWaveOpenUrl(baseUrl: string, transactionId: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}${waveOpenPath(transactionId)}`
}
