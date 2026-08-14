# Nora — Documentation complète

**Nora** — Caisse enregistreuse et gestion magasin **offline-first**, adaptée aux commerces en Côte d’Ivoire.

---

## À qui s’adresse cette documentation ?

| Document | Public | Contenu |
|----------|--------|---------|
| [Documentation utilisateur](documentation-utilisateur.md) | Gérants, caissiers, admins | Prise en main, modules, bonnes pratiques |
| [Documentation modules](documentation-modules.md) | Équipe terrain & support | Référence écran par écran |
| [Documentation technique](documentation-technique.md) | Développeurs, DevOps | Architecture, API, déploiement |
| [README racine](../README.md) | Tous | Installation rapide |

---

## Résumé produit

Nora regroupe sur une seule plateforme :

- **Encaissement** (POS) avec scan, catégories, remises, fidélité et multi-paiements
- **Catalogue & stocks** avec alertes, inventaire et exports CSV
- **Facturation** (tickets & factures) et **rapport journalier** avec clôture de journée
- **Restaurant** : cuisine (KDS), tables, commandes en ligne
- **Commerce** : boutique publique, promotions, CRM, multi-magasins
- **Équipe** : personnel (création / désactivation / quota plan), pointage, RH, analytique
- **Abonnement** : essai 1 mois, mobile money (CinetPay / Wave), carte (Stripe)

L’application est une **PWA** installable sur tablette ou PC et fonctionne **sans connexion** (paiements espèces, cache licence 7 jours).

---

## Créer un utilisateur de caisse

1. Se connecter en **admin** sur `/staff` (démo : Kouadio Yao, PIN `5678`)
2. Menu **Équipe → Personnel**
3. Section **Créer un utilisateur** : nom, rôle **Caissier**, PIN 4–8 chiffres unique
4. Valider — le profil apparaît sur l’écran de connexion

Le **quota utilisateurs** du plan (ex. Starter = 3) est appliqué : si la limite est atteinte, désactivez un compte ou changez de plan.

---

## Plans et modules

| Plan | Prix / mois | Magasins | Utilisateurs |
|------|-------------|----------|--------------|
| Starter | 9 900 F | 1 | 3 |
| Pro | 24 900 F | 3 | 10 |
| Business | 49 900 F | 20 | 50 |

**Starter** : caisse, catalogue, stocks, journal, tickets & factures, tableau de bord, personnel, pointage, boutique en ligne.

**Pro** (+) : cuisine, tables, fidélité, promotions, commandes en ligne, comptabilité, analytique.

**Business** (+) : multi-magasins, CRM, RH, intégrations & webhooks.

---

## Développement local

```bash
npm install
cp .env.example .env
npm run db:up
npm run prisma:generate && npm run prisma:push
npm run dev:full
```

API : http://localhost:4000 — App : http://localhost:5173

---

## Support

Voir [documentation-utilisateur.md](documentation-utilisateur.md) et [documentation-modules.md](documentation-modules.md).  
Contact : **Nora**.
