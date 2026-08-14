# Documentation technique — Nora

Guide pour développeurs, intégrateurs et DevOps.

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Navigateur (PWA)                                           │
│  React 19 + Vite + Dexie (IndexedDB)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Site public │  │ Caisse staff │  │ Boutique client  │  │
│  │ /, /tarifs  │  │ /staff       │  │ /boutique/MAG-XX │  │
│  └─────────────┘  └──────────────┘  └──────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP /api/*
┌───────────────────────────▼─────────────────────────────────┐
│  Express (Node.js) — server/server.ts                         │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌───────────────┐ │
│  │ billing  │ │ storefront│ │ mobileMoney│ │ sync/webhooks │ │
│  └────┬─────┘ └────┬─────┘ └─────┬──────┘ └───────┬───────┘ │
└───────┼────────────┼─────────────┼────────────────┼─────────┘
        │            │             │                │
        ▼            ▼             ▼                ▼
   MongoDB      CinetPay       Stripe          Partenaires
   (Prisma)     (MM CI)        (carte)         (webhooks)
```

### Principes

- **Offline-first** : la caisse fonctionne sans réseau ; Dexie stocke ventes, produits, stocks localement.
- **Licence cloud** : l’abonnement est vérifié via l’API ; cache local 7 jours (`OFFLINE_GRACE_HOURS = 168`).
- **Monolithe déployable** : en production, Express sert `dist/` (SPA) + API sur le même port.

---

## 2. Stack technique

| Couche | Technologies |
|--------|--------------|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 4 |
| Stockage local | Dexie 4 (IndexedDB), localStorage (config intégrations) |
| PWA | vite-plugin-pwa, service worker Workbox |
| Backend | Express 4, tsx (dev), Node ESM |
| ORM / DB | Prisma 6, MongoDB |
| Paiements | Stripe, CinetPay |
| Validation | Zod |

---

## 3. Structure du projet

```
Nora/
├── prisma/schema.prisma      # Schéma MongoDB
├── server/
│   ├── server.ts             # Point d’entrée Express
│   ├── routes/
│   │   ├── billing.ts        # Abonnement, register, login, Stripe
│   │   ├── mobileMoney.ts    # CinetPay checkout & notify
│   │   ├── storefront.ts     # Boutique en ligne API
│   │   ├── sync.ts           # Réception lots sync cloud
│   │   └── webhooks.ts       # Webhooks commandes / SMS
│   └── lib/
│       ├── subscriptionPlans.ts
│       ├── ownerAuth.ts      # Hash scrypt Gmail gérant
│       ├── cinetpay.ts, stripe.ts, sms.ts
│       └── prisma.ts
├── src/
│   ├── App.tsx               # Routage SPA (marketing, caisse, abonnement)
│   ├── Shell.tsx             # Orchestrateur modules caisse + layout responsive
│   ├── navigation.ts         # Modules, rôles, menus
│   ├── views/                # Écrans métiers (voir §4 bis)
│   ├── components/           # UI réutilisable (Sidebar, Topbar, ProductGrid…)
│   ├── ui/                   # Design system (PageHeader, Tabs, Table, Button…)
│   ├── context/              # Subscription, ActiveStore
│   ├── db/                   # Dexie schema & types
│   ├── lib/                  # API client, subscription, routes, csvProducts
│   └── auth/                 # Session staff, permissions
├── public/                   # Assets statiques, branding, marketing
└── docs/                     # Documentation
```

---

## 4. Routage frontend

Défini dans `src/lib/siteRoutes.ts` et `src/App.tsx`.

| Chemin | Composant | Condition |
|--------|-----------|-----------|
| `/boutique/:code` | `PublicStorefrontPage` | Toujours public |
| `/inscription`, `/connexion` | `OrganizationSetup` | Sans organisation |
| `/`, `/tarifs` | `MarketingSiteView` | Sans organisation |
| `/abonnement` | `SubscriptionManagementPage` | Organisation connectée |
| `/staff` | `LoginScreen` → `Shell` | Organisation + staff PIN |

La navigation interne caisse utilise un état `NavViewId` dans `Shell.tsx` (pas de React Router).

### 4 bis. Vues métier (`src/views/`)

| Fichier | Module | Plan min. |
|---------|--------|-----------|
| `CatalogueView.tsx` | Catalogue | starter |
| `StocksView.tsx` | Stocks | starter |
| `TicketsFacturesView.tsx` | Tickets & factures | starter |
| `JournalReportView.tsx` | Rapport journalier | starter |
| `DashboardView.tsx` | Tableau de bord | starter |
| `KitchenView.tsx` | Cuisine KDS | pro |
| `TablesManagementView.tsx` | Tables | pro |
| `OnlineOrdersValidationView.tsx` | Commandes en ligne | pro |
| `PromotionsView.tsx` | Promotions | pro |
| `LoyaltyProgramView.tsx` | Fidélité | pro |
| `ComptabiliteView.tsx` | Comptabilité | pro |
| `AnalytiqueView.tsx` | Analytique | pro |
| `MultiStoreView.tsx` | Multi-magasins | business |
| `CrmView.tsx` | CRM | business |
| `RhManagementView.tsx` | RH | business |
| `IntegrationsView.tsx` | Intégrations | business |
| `PersonnelView.tsx` | Personnel | starter |
| `PointageView.tsx` | Pointage | starter |
| `ParametresView.tsx` | Paramètres | starter |
| `SubscriptionView.tsx` | Abonnement (dans Shell) | — |
| `MarketingSiteView.tsx` | Site `/` | public |
| `PublicStorefrontPage.tsx` | Boutique `/boutique/:code` | public |

Chargement lazy des vues lourdes depuis `Shell.tsx` pour réduire le bundle initial.

---

## 5. Interface responsive

Stack : **Tailwind CSS 4** + utilitaires dans `src/index.css`.

| Fichier | Rôle |
|---------|------|
| `index.html` | `viewport-fit=cover` (safe-area iOS) |
| `index.css` | `app-main-pad`, `pb-safe`, `tabs-scroll-x`, `fixed-safe-bottom` |
| `Shell.tsx` | `max-w-[1680px]`, panier mobile, padding safe-area caisse |
| `Topbar.tsx` | `safe-area-inset-top`, sous-titre `hidden sm:block` |
| `Sidebar.tsx` | Drawer mobile avec safe-area |
| `PageHeader.tsx` | Titres `text-xl sm:text-2xl`, actions `flex-wrap` |
| `Tabs.tsx` | `tabs-scroll-x` sur onglets segmentés |
| `Table.tsx` | Colonnes `hideBelow: 'sm' \| 'md' \| 'lg'` |
| `JournalReportView.tsx` | Tableau desktop + cartes `<md` pour ventes |
| `TicketsFacturesView.tsx` | Cartes mobile pour historique |

Breakpoints Tailwind habituels : `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px.

---

## 6. Authentification

### Gérant (organisation)

- **Inscription** : `POST /api/billing/register` — Gmail obligatoire, mot de passe hashé (scrypt).
- **Connexion** : `POST /api/billing/login` — retourne un snapshot abonnement.
- **Credentials** : stockés en `localStorage` via `SubscriptionContext`.
- **Header API** : `x-license-key` pour les appels authentifiés.

Fichiers : `server/lib/ownerAuth.ts`, `src/lib/subscription/ownerAuth.ts`.

### Staff (caisse)

- Profils locaux Dexie avec **PIN** à 4 chiffres.
- Session : `src/auth/session.ts` (`Nora-staff-session`).
- Rôles : `caissier`, `gerant`, `admin` — permissions dans `src/auth/permissions.ts`.

---

## 7. Abonnement

### Plans (`server/lib/subscriptionPlans.ts`)

| ID | Prix FCFA | Magasins | Staff |
|----|-----------|----------|-------|
| `starter` | 9 900 | 1 | 3 |
| `pro` | 24 900 | 3 | 10 |
| `business` | 49 900 | 20 | 50 |

- `TRIAL_DAYS = 30` (1 mois d’essai)
- Statuts : `trialing`, `active`, `past_due`, `canceled`, `expired`

### Feature gating

`src/lib/subscription/plans.ts` — `VIEW_MIN_PLAN` associe chaque module à un plan minimum.

`SubscriptionContext` bloque l’accès aux vues non incluses dans le plan actif.

### Paiements

| Canal | Fichiers | Webhook |
|-------|----------|---------|
| Stripe (carte) | `server/lib/stripe.ts` | `POST /api/billing/webhook` |
| CinetPay (MM) | `server/lib/cinetpay.ts` | `POST /api/billing/cinetpay/notify` |
| Wave (MM CI) | `server/lib/wave.ts` | `POST /api/billing/wave/webhook` |

Opérateurs CI : Orange Money, Wave, MTN MoMo, Moov.

---

## 8. API REST

Base : `/api` (proxy Vite → `:4000` en dev ; même origine en prod monolithe).

Construction des URLs côté client : `src/lib/apiUrl.ts` (`apiUrl()`, `isCloudApiConfigured()`).
Si le frontend est hébergé séparément, définir `VITE_API_BASE_URL` au build.

### Billing

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/billing/plans` | Liste des plans + `trialDays` |
| POST | `/billing/register` | Créer organisation |
| POST | `/billing/login` | Connexion gérant |
| POST | `/billing/attach` | Rejoindre magasin par code |
| POST | `/billing/logout` | Révoquer la session Bearer |
| GET | `/billing/status` | État abonnement (Bearer ou `x-license-key`) |
| PATCH | `/billing/settings` | SMS, téléphone facturation |
| GET | `/billing/payments/history` | Historique paiements |
| POST | `/billing/checkout` | Session Stripe Checkout |
| POST | `/billing/portal` | Portail client Stripe |
| GET | `/billing/payment-providers` | Config Wave/CinetPay boutique (org) |
| PUT | `/billing/payment-providers` | Enregistrer clés paiement boutique |

### Mobile money & Wave

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/billing/mobile-money/channels` | Opérateurs disponibles |
| POST | `/billing/mobile-money/checkout` | Initier paiement abonnement |
| GET | `/billing/mobile-money/verify/:id` | Vérifier statut transaction |
| GET | `/billing/mobile-money/demo` | Page simulation CinetPay (dev) |
| GET | `/billing/wave/open/:transactionId` | Redirection checkout Wave |
| GET | `/billing/wave/demo` | Page simulation Wave (dev) |
| POST | `/billing/wave/webhook` | Webhook Wave (abonnement + boutique) |
| POST | `/billing/cinetpay/notify` | Notification CinetPay |

### Boutique en ligne

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/billing/storefront/:storeCode` | Infos magasin public |
| GET | `/billing/storefront/:storeCode/menu` | Catalogue publié |
| POST | `/billing/storefront/:storeCode/orders` | Passer commande |
| POST | `/billing/storefront/publish` | Publier menu (abonnement actif requis) |
| GET | `/billing/storefront/orders/inbox` | Boîte commandes gérant |
| PATCH | `/billing/storefront/orders/:id` | Mettre à jour statut |

### Organisation, staff, fiscal

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/org/backup` | Export sauvegarde organisation |
| GET/PUT | `/org/integrations` | Config intégrations cloud |
| GET/POST/PATCH/DELETE | `/org/staff` | Gestion personnel (abonnement actif pour écriture) |
| POST | `/org/staff/verify` | Vérification PIN caissier |
| GET/PATCH | `/org/fiscal/settings` | Paramètres fiscaux |
| GET | `/org/fiscal/fec` | Export FEC |

### Admin plateforme (`x-platform-admin-secret`)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/platform-admin/status` | État de la console |
| POST | `/platform-admin/auth` | Authentification opérateur |
| GET | `/platform-admin/stats` | Statistiques SaaS |
| GET/PATCH | `/platform-admin/organizations` | Gestion organisations |
| POST | `/platform-admin/reminders` | Déclencher rappels SMS |
| GET/PUT | `/platform-admin/payment-providers` | Clés Wave/CinetPay **plateforme** |

### Sync, uploads & webhooks

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/Nora/sync` | Réception lot sync ventes/stocks (abonnement actif) |
| GET | `/Nora/sync/pull` | Téléchargement deltas cloud (abonnement actif) |
| GET | `/uploads/status` | État stockage Blob |
| POST | `/uploads/product-image` | Upload photo produit |
| POST | `/webhooks/orders` | Commandes partenaires |
| POST | `/webhooks/Nora` | Webhook historique |
| POST | `/webhooks/sms` | Accusés SMS |

### Santé

| Méthode | Route |
|---------|-------|
| GET | `/health` |

---

## 9. Base de données (Prisma / MongoDB)

Schéma : `prisma/schema.prisma`.

### Modèles principaux

| Modèle | Rôle |
|--------|------|
| `Organization` | Compte entreprise, plan, licence, code magasin, clés paiement boutique |
| `PlatformPaymentConfig` | Singleton — clés Wave/CinetPay **plateforme** (abonnements SaaS) |
| `MobileMoneyPayment` | Transactions abonnement (Wave direct, CinetPay, démo) |
| `StorefrontOrder` | Commandes boutique en ligne |
| `StaffMember` | Personnel caisse synchronisé |
| `OrgIntegration` | Config intégrations par organisation |
| `SubscriptionReminderLog` | SMS rappels J-3 / J-1 |
| `SyncBatch` / `SyncItem` | Lots synchronisation cloud |
| `WebhookEvent` | Événements entrants |

### Commandes Prisma

```bash
npm run prisma:generate   # Générer le client
npm run prisma:push       # Pousser le schéma vers MongoDB
npm run db:up             # MongoDB local (Docker Compose)
```

---

## 10. Données locales (Dexie)

Fichier principal : `src/db/db.ts`.

Tables IndexedDB :

- Produits, catégories, stocks
- Ventes, lignes de vente
- Commandes en ligne
- Tables, réservations
- Personnel, pointages
- File de synchronisation (`syncQueue`)
- Journaux d’audit

Le seed initial est chargé par `ensureSeed()` au démarrage.

---

## 11. Synchronisation cloud

Client : `src/lib/sync.ts` (push) et `src/lib/cloudPull.ts` (pull).

| Opération | Route | Helper client |
|-----------|-------|---------------|
| Push file locale | `POST /api/Nora/sync` | `cloudSyncPushUrl()` |
| Pull deltas | `GET /api/Nora/sync/pull?since=<ts>` | `apiUrl('/Nora/sync/pull')` |

**Configuration :**

- **Dev fullstack** (`npm run dev:full`) : aucune variable requise — proxy Vite `/api` → `:4000`.
- **Prod monolithe Render** : idem, chemins relatifs `/api`.
- **Frontend séparé** : `VITE_API_BASE_URL=https://votre-api.onrender.com` au build.
- **Legacy** : `VITE_CLOUD_SYNC_URL` (URL complète push) — déconseillé, conservé pour compatibilité.

Payload push :

```json
{
  "batchId": "uuid",
  "sentAt": 1234567890,
  "items": [
    { "kind": "sale", "createdAt": "...", "payload": { } }
  ]
}
```

Sans API joignable, la file reste en local (aucune perte de données).

---

## 12. PWA et mode offline

- Manifest : `vite.config.ts` → `VitePWA`
- Service worker : cache assets, fallback `index.html`
- `useOnlineStatus` : détection réseau + bandeau
- Mode kiosk : `npm run dev:offline` / `npm run build:offline`

---

## 13. Intégrations matérielles (démo)

Configuration : `src/lib/integrationsConfig.ts` (localStorage).

Clés :

- `Nora-device-order-terminals`
- `Nora-device-receipt-printers`
- `Nora-device-kds-screens`
- `Nora-device-cash-drawer`
- `Nora-device-payment-terminals`

Logique checkout : `src/lib/checkoutPayment.ts`, `src/components/CartPanel.tsx`.

---

## 14. Variables d’environnement

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `DATABASE_URL` | Prod | URI MongoDB |
| `PORT` | Non | Port serveur (défaut 4000) |
| `APP_URL` | Prod paiements | URL publique HTTPS (retours Stripe/Wave) |
| `VITE_API_BASE_URL` | Split frontend/API | URL backend sans `/api` (build Vite) |
| `VITE_CLOUD_SYNC_URL` | Non | Legacy — URL complète push sync |
| `SESSION_TTL_DAYS` | Non | Durée sessions Bearer (défaut 30) |
| `WEBHOOK_TOKEN` | Prod webhooks | Secret en-tête `x-webhook-token` |
| `STRIPE_SECRET_KEY` | Optionnel | Clé secrète Stripe |
| `STRIPE_WEBHOOK_SECRET` | Optionnel | Signature webhooks Stripe |
| `STRIPE_CURRENCY` | Non | Défaut `xof` |
| `CINETPAY_API_KEY` | Optionnel | API CinetPay (repli env) |
| `CINETPAY_SITE_ID` | Optionnel | Site CinetPay (repli env) |
| `CINETPAY_DEMO_MODE` | Non | `true` = simulation locale |
| `WAVE_API_KEY` | Optionnel | API Business Wave CI (repli env) |
| `WAVE_WEBHOOK_SECRET` | Optionnel | Secret webhook Wave |
| `WAVE_SIGNING_SECRET` | Optionnel | Signature requêtes Wave |
| `WAVE_DEMO_MODE` | Non | Simulation sans clé Wave |
| `BLOB_READ_WRITE_TOKEN` | Optionnel | Vercel Blob — photos catalogue |
| `PLATFORM_ADMIN_SECRET` | Optionnel | Console `/admin` |
| `SMS_PROVIDER_URL` | Optionnel | Endpoint envoi SMS |
| `SMS_PROVIDER_TOKEN` | Optionnel | Token SMS |
| `VITE_SMS_WEBHOOK_URL` | Non | Override URL webhook SMS client |
| `SUBSCRIPTION_REMINDER_INTERVAL_HOURS` | Non | Planificateur rappels (défaut 6) |

---

## 15. Développement

```bash
# Installation
npm install
cp .env.example .env

# MongoDB + schéma
npm run db:up
npm run prisma:generate
npm run prisma:push

# Dev fullstack
npm run dev:full
# → API http://localhost:4000
# → App http://localhost:5173 (proxy /api)
```

### Dépannage dev

| Erreur | Cause | Action |
|--------|-------|--------|
| `EADDRINUSE :::4000` | API déjà lancée | `netstat -ano \| findstr :4000` puis `taskkill /PID <pid> /F` |
| Vite sur 5174/5175 | Ports 5173 occupés | Utiliser l’URL affichée dans le terminal |
| Module Prisma manquant | Client non généré | `npm run prisma:generate` |

### Scripts utiles

| Script | Usage |
|--------|-------|
| `npm run lint` | ESLint |
| `npm run build` | tsc + vite build + compile serveur |
| `npm start` | Production (`server-dist/server.js`) |
| `npm run dev:kiosk` | API + frontend offline |

---

## 16. Déploiement

### Option A — Render fullstack (recommandé)

Un seul service web sert l’API Express **et** le build Vite (`dist/`).

```bash
npm run build
NODE_ENV=production npm start
```

Blueprint : `render.yaml`. Health check : `GET /health`.
Aucune variable `VITE_API_BASE_URL` requise.

**Inclus :** scheduler rappels abonnement, webhooks raw body, fichiers statiques.

### Option B — Frontend Vercel + API séparée

| Composant | Hébergement | Configuration |
|-----------|-------------|---------------|
| SPA React | Vercel (`vercel.json`) | `VITE_API_BASE_URL` au build |
| API Express | Render / Railway / VPS | `APP_URL` = URL du frontend |

`vercel.json` réécrit `/api/*` vers `api/index.ts` (serverless Express).
**Limitations Vercel :** pas de scheduler intégré (cron externe pour rappels SMS) ; cold starts MongoDB.

### Checklist production

1. `DATABASE_URL` MongoDB Atlas configuré
2. `APP_URL` en HTTPS (obligatoire Stripe / Wave / CinetPay)
3. Webhooks : Stripe → `/api/billing/webhook` ; Wave → `/api/billing/wave/webhook` ; CinetPay → `/api/billing/cinetpay/notify`
4. `prisma db push` ou migration sur la base cible
5. Clés paiement plateforme dans `/admin` → Wave & Orange
6. Health check : `GET /health`

### Paiements : deux niveaux

| Niveau | UI | Usage |
|--------|-----|-------|
| **Plateforme** | `/admin` | Commerçants paient l’abonnement Nora |
| **Boutique** | Intégrations → Wave & Orange | Clients paient le commerçant en ligne |

---

## 17. Sécurité

- Ne jamais exposer `STRIPE_SECRET_KEY`, `CINETPAY_API_KEY` côté client.
- Mots de passe gérant : hash scrypt, validation Gmail côté serveur.
- Webhooks : vérifier signatures (Stripe) et tokens partenaires.
- `x-license-key` : traiter comme secret organisation.
- Journaliser annulations, remises et validations sensibles.

---

## 18. Extensions recommandées

- Drivers matériels réels (TPE, imprimantes ESC/POS réseau)
- Tests E2E (Playwright) sur parcours caisse et abonnement
- Migration script pour comptes sans `passwordHash`
- Monitoring (`/health`, logs structurés, Sentry)
- CI : `npm run build && npm run lint`

---

## 19. Références code

| Sujet | Fichiers clés |
|-------|---------------|
| Checkout caisse | `Shell.tsx`, `CartPanel.tsx`, `checkoutPayment.ts` |
| KDS | `KitchenView.tsx` |
| Abonnement UI | `SubscriptionView.tsx`, `SubscriptionContext.tsx` |
| Onboarding | `OrganizationSetup.tsx` |
| Boutique luxe | `LuxuryStorefrontView.tsx`, `PublicStorefrontPage.tsx` |
| Marketing | `MarketingSiteView.tsx`, `src/components/marketing/` |
| Modules catalogue | `CatalogueView.tsx`, `csvProducts.ts` |
| Stocks | `StocksView.tsx` |
| Tickets / rapport | `TicketsFacturesView.tsx`, `JournalReportView.tsx` |
