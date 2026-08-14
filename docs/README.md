# Documentation Nora

Index de la documentation de l’application **Nora**.

## Par où commencer ?

### [Documentation complète](documentation-complete.md) — **recommandé**

Vue d’ensemble : produit, plans, rôles, parcours, modules clés, dev et déploiement.

### [Documentation utilisateur](documentation-utilisateur.md)

Guide pour **gérants**, **caissiers** et **administrateurs** :

- Création de compte et connexion
- Abonnement et essai gratuit
- Encaissement et mode hors ligne
- Bonnes pratiques et dépannage

### [Référence des modules](documentation-modules.md)

Fiche **écran par écran** : Catalogue, Stocks, Tickets, Rapport, Caisse, KDS, etc.

### [Documentation technique](documentation-technique.md)

Guide pour **développeurs** et **intégrateurs** :

- Architecture fullstack
- API REST, Prisma / MongoDB, Dexie
- Variables d’environnement
- PWA, responsive, déploiement

## Démarrage rapide

```bash
npm install && cp .env.example .env
npm run db:up && npm run prisma:generate && npm run prisma:push
npm run dev:full
```

Voir aussi le README à la racine du projet.
