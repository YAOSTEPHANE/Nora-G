# Référence des modules — Nora

Guide fonctionnel écran par écran. Pour l’installation et l’API, voir [documentation-technique.md](documentation-technique.md).

---

## Navigation

Le menu latéral est organisé en sections :

| Section | Modules |
|---------|---------|
| **Ventes** | Caisse, Tableau de bord |
| **Gestion** | Catalogue, Stocks, Comptabilité, RH, CRM, Tables, Promotions, Fidélité, Cuisine, Tickets & factures, Commandes en ligne, Multi-magasins, Rapport journalier |
| **Équipe** | Personnel, Pointage, Analytique |
| **Écosystème** | Paramètres, Intégrations, Abonnement |

Le menu affiché dépend du **rôle** (caissier / gérant / admin) et du **plan** d’abonnement.

---

## Caisse (`caisse`)

**Objectif** : encaisser rapidement en point de vente.

| Fonction | Description |
|----------|-------------|
| Recherche | Barre de recherche texte + filtre par catégorie (pilules) |
| Scan | Saisie ou scan code-barres |
| Grille produits | Cartes avec image, prix TTC ; densité compacte ou confort |
| Panier | Quantités, suppression, vidage, annulation transaction |
| Remises | Code promo, client fidélité (téléphone), points |
| Paiement | Espèces, carte, mobile money, mixte |
| Reçu | Affichage écran ; impression si imprimante activée |

**Mobile** : panier en barre flottante en bas ; safe-area pour encoches ; sélecteur de densité grille.

**Hors ligne** : espèces uniquement ; bandeau réseau en haut.

---

## Tableau de bord (`dash`)

Vue synthétique de l’activité : indicateurs du jour, tendances, raccourcis vers modules fréquents.

**Plan** : Starter.

---

## Catalogue (`catalogue`)

**Objectif** : gérer articles, prix, TVA, codes-barres et catégories.

### Bandeau KPI
- Articles actifs / total
- Ruptures (stock ≤ 0)
- Alertes (sous seuil)
- Valorisation stock (prix TTC × quantités)

### Onglet Articles
- Recherche nom ou code-barres
- Filtres catégorie (pilules défilantes)
- Filtres stock : Tous, Ruptures, Alertes, Stock OK
- Tri : nom, prix, stock
- Vue **Grille** ou **Liste** (desktop)
- Actions admin : nouvel article, modifier, archiver, import/export CSV, modèle CSV
- Photos : upload (Vercel Blob si configuré, sinon local IndexedDB)

### Onglet Catégories
- Liste et gestion des catégories produits

**Rôles** : lecture pour caissier ; édition prix/catalogue selon permissions admin/gérant.

**Plan** : Starter.

---

## Stocks (`stocks`)

**Objectif** : suivre niveaux, seuils, mouvements et inventaire.

### Onglets de périmètre
- **Stock catalogue** : articles du catalogue par magasin
- **Ingrédients cuisine** : matières premières (recettes KDS)

### Onglet Articles (catalogue)
- KPIs : ruptures, alertes, OK, valorisation
- Filtres : Tous / Rupture / Alerte / OK
- Tri : priorité alerte, nom, stock, prix
- Inventaire rapide (+ / − / saisie directe)
- Historique des mouvements
- Exports : **Export stock** et **Mouvements** (CSV)

### Cuisine
- CRUD ingrédients (unités kg, g, L, ml, pièce)
- Seuils et alertes dédiés

**Menu** : badges rupture et alerte sur l’entrée « Stocks ».

**Plan** : Starter.

---

## Tickets & factures (`ticketsFactures`)

**Objectif** : documents hors vente caisse immédiate (devis, factures, tickets).

### KPIs
Documents totaux, à encaisser, réglé, brouillons.

### Onglets
| Onglet | Usage |
|--------|--------|
| **Historique** | Liste filtrable (type, statut, recherche) ; tableau desktop, **cartes sur mobile** |
| **Nouveau document** | Ticket ou facture, client, lignes, TVA, échéance |
| **Ventes caisse** | Ventes récentes liées au magasin |

### Statuts document
Brouillon → Émis → Réglé (ou en retard si échéance dépassée).

### Actions
Export CSV, émission, marquage payé, édition brouillon.

**Plan** : Starter.

---

## Rapport journalier (`journal`)

**Objectif** : synthèse et clôture de la journée de caisse.

### Onglets
| Onglet | Contenu |
|--------|---------|
| **Synthèse** | KPIs (total TTC, tickets, panier moyen, solde théorique), ventilation paiements |
| **Ventes** | Liste du jour avec recherche ; **tableau desktop + cartes mobile** |
| **Audit** | Événements (annulations, remises, clôtures…) |
| **Clôture** | Fond de caisse, comptage, clôture / réouverture (admin/gérant) |

### Exports
CSV ventes du jour, CSV historique clôtures, impression (`window.print`).

**Clôture** : bloque les nouveaux encaissements pour la journée jusqu’à réouverture.

**Plan** : Starter.

---

## Cuisine (`kitchen`)

**Plan** : Pro.

KDS : file d’attente, statuts (En file, Préparation, Prêt, Servi), priorités, SLA automatique.

Désactivable via Intégrations → Écrans cuisine.

---

## Commandes en ligne (`onlineOrders`)

**Plan** : Pro.

Validation commandes boutique web / partenaires avant décrémentation stock et passage cuisine.

---

## Tables (`tables`)

**Plan** : Pro.

Plan de salle, occupation, réservations, statuts table.

---

## Promotions & Fidélité

| Module | Plan | Rôle |
|--------|------|------|
| Promotions | Pro | Codes promo, fenêtres, seuil panier |
| Fidélité | Pro | Points, remises, historique client |

---

## Comptabilité (`comptabilite`)

**Plan** : Pro.

Journaux, ventilation HT/TVA, exports écritures.

---

## Analytique (`analytique`)

**Plan** : Pro.

Périodes, top produits, heures de pointe, marges, exports CSV / Excel / PDF.

---

## Multi-magasins (`network`)

**Plan** : Business.

Création magasins, bascule magasin actif, transferts stock, vue consolidée.

---

## CRM (`crm`) & RH (`rh`)

**Plan** : Business.

CRM : clients, interactions, relances.  
RH : demandes, présence, validations manager.

---

## Personnel (`personnel`) & Pointage (`pointage`)

| Module | Plan | Description |
|--------|------|-------------|
| Personnel | Starter | Profils staff, rôles, PIN |
| Pointage | Starter | Arrivées / départs, historique par magasin |

---

## Paramètres (`parametres`)

Magasin, terminal, modules, cuisine, tables, périphériques, fond de caisse par défaut.

---

## Intégrations (`integrations`)

**Plan** : Business.

- Marketplaces (Shopify, Glovo, Uber Eats…)
- Webhooks / pull commandes
- Équipements (démo) : TPE, imprimante, KDS, tiroir-caisse
- Connecteur livraison

---

## Abonnement (`subscription`)

Plan actif, code magasin, QR boutique, clé licence, paiement MM/carte, historique, SMS rappels.

---

## Pages hors menu caisse

| URL | Page |
|-----|------|
| `/` | Site commercial |
| `/tarifs` | Grille tarifaire |
| `/inscription` | Création compte |
| `/connexion` | Connexion gérant |
| `/abonnement` | Gestion licence |
| `/staff` | Connexion PIN staff |
| `/boutique/:code` | Boutique client |
| `/admin` | Console opérateur plateforme |

---

## Interface responsive

| Élément | Comportement mobile |
|---------|---------------------|
| Menu | Drawer hamburger |
| Onglets | Défilement horizontal |
| Tableaux larges | Cartes empilées (ventes, tickets) |
| Caisse | Panier flottant bas d’écran |
| En-têtes | Actions en `flex-wrap` |

Breakpoints principaux : `<640px` mobile, `md` tablette, `xl` grand écran.
