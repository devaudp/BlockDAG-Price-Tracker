# BDAG Price Tracker — Guide utilisateur

## Ce que fait le script

Le script surveille automatiquement le prix BDAG et t'envoie des notifications push sur ton téléphone via l'app Pushover. Il lit ton solde directement sur la blockchain et récupère les données de marché depuis CoinMarketCap.

Le déclencheur tourne **toutes les 5 minutes**. CoinMarketCap est interrogé au maximum toutes les 10 minutes (configurable via `INTERVALLE_CMC_MIN`). Les alertes critiques (ATH, paliers, rang CMC) sont donc détectées en moins de 10 minutes.

---

## Notifications automatiques

### Push horaire (aux heures configurées)
Envoyé aux heures définies dans `HEURES_ENVOI` (par défaut : 2h, 6h, 10h, 14h, 18h, 22h).

Contient :
- Prix actuel en CHF
- Valeur de ton portefeuille
- Comparaison vs 4h avant
- À 18h uniquement : comparaison vs 24h avant

### Bilan journalier (1x par jour, à 12h)
Envoyé automatiquement une fois par jour à 12h. Contient :
- Prix + valeur portefeuille
- Données marché : market cap, volume 24h, circulation, rang CMC
- Variations : 1h / 24h / 7 jours
- Comparaisons historiques : J-7, J-14, J-21
- Résumé 3 semaines : min/max et évolution du portefeuille
- Prochain palier cible

### Alerte ATH
Envoyée immédiatement (dans les 10 min) dès qu'un nouveau record absolu est atteint. Priorité haute. Contient le nouveau record, l'ancien ATH et le multiplicateur vs ton prix d'achat.

### Alerte rang CMC
Envoyée immédiatement si le rang CMC de BDAG change de ±5 positions ou plus (configurable via `RANG_ALERTE_SEUIL`).

### Alerte volume inhabituel
Envoyée une fois par jour si le volume 24h dépasse 2× la moyenne des 7 derniers jours (configurable via `VOLUME_SPIKE_RATIO`). Priorité haute.

### Alerte palier cible
Envoyée immédiatement dès qu'un palier de prix est franchi. Ne se redéclenche pas. Contient le multiplicateur vs ton prix d'achat et les simulations de vente à 25%, 50%, 75%, 100%.

---

## Dashboard web live

Le script expose un dashboard accessible depuis n'importe quel navigateur ou depuis l'écran d'accueil iOS.

### Accès

L'URL d'accès est :
```
https://script.google.com/macros/s/XXXX/exec?t=TON_TOKEN
```
Si tu utilises GitHub Pages (recommandé pour l'icône iOS) :
```
https://devaudp.github.io/BlockDAG-Price-Tracker/?t=TON_TOKEN
```

### Ce qu'il affiche (de haut en bas)

| Section | Contenu |
|---|---|
| Prix | Prix CHF en grand, variation 24h, rang CMC, badge distance au PAM |
| Courbe | 48 derniers points (~7 jours), axe prix CHF à gauche, valeur portfolio à droite, ligne PAM |
| Variations | 1h / 24h / 7j |
| Portfolio | Valeur totale CHF, quantité BDAG, multiplicateur vs PAM, P&L |
| Palier cible | Prochain palier + barre de progression logarithmique |
| ATH | Record absolu et écart vs prix actuel |
| Données marché | Market Cap, Volume 24h, Circulation, Rang CMC |
| Pied de page | Heure du dernier refresh + heure du prochain push Pushover |

### Fond dynamique
Le fond change de couleur selon la performance 24h : léger vert si hausse, léger rouge si baisse.

### Refresh
Le dashboard se recharge automatiquement toutes les **10 minutes**.

### Ajouter à l'écran d'accueil iOS (icône BDAG)

1. Ouvre l'URL GitHub Pages avec `&add=1` dans Safari :
   `https://devaudp.github.io/BlockDAG-Price-Tracker/?t=TON_TOKEN&add=1`
2. La page de setup s'affiche avec les instructions
3. Partager → Sur l'écran d'accueil → l'icône BDAG apparaît
4. Les lancements suivants depuis l'icône redirigent directement vers le dashboard

---

## Menu d'actions (bouton dans chaque push)

Chaque notification contient un bouton **"🎛️ Actions BDAG"** qui ouvre un menu sur ton téléphone avec 4 boutons. Le menu affiche aussi le prix actuel en temps réel dès l'ouverture.

| Bouton | Rôle |
|---|---|
| ⛓️ Solde onchain | Interroge la blockchain et envoie un push avec ton solde actuel et sa valeur en CHF |
| 📊 Bilan journalier | Déclenche le bilan complet à la demande, sans attendre 12h |
| 📈 Market Stats | Envoie un push avec les données de marché complètes |
| 💰 Simulateur vente | Envoie 4 scénarios de vente (25/50/75/100%) avec P&L |

---

## Gestion des paliers cibles

Les paliers sont des prix cibles. Quand BDAG atteint l'un de ces prix, tu reçois une alerte immédiate.

### Configurer les paliers

Dans l'éditeur Apps Script, modifie la fonction `configurerMesPaliers()` :

```js
function configurerMesPaliers() {
  resetTargets();                  // Efface les anciens paliers
  ajouterTarget(0.001,  "×2");    // Prix cible, étiquette
  ajouterTarget(0.005,  "×10");
  ajouterTarget(0.01,   "×20");
  ajouterTarget(0.05,   "×100");
  listerTargets();                 // Affiche la liste dans les logs
}
```

Puis sélectionne `configurerMesPaliers` dans le menu déroulant et clique ▶ Exécuter.

### Modifier ou remettre à zéro les paliers

Il suffit de modifier les valeurs dans `configurerMesPaliers()` et de réexécuter. Le `resetTargets()` en début de fonction efface tout avant d'ajouter les nouveaux.

### Vérifier l'état des paliers

Exécute `listerTargets()` — les logs affichent :
- ✅ = palier déjà atteint (ne se redéclenchera pas)
- ⏳ = en attente

---

## Prix moyen d'achat (PAM)

La constante `BDAG_PRIX_ACHAT_CHF` en haut du script définit ton prix moyen d'achat par BDAG en CHF.

**Calcul :** total CHF investis ÷ nombre de BDAG détenus

```js
const BDAG_PRIX_ACHAT_CHF = 0.0005; // exemple : 100 CHF pour 200 000 BDAG
```

Il est utilisé dans :
- Le simulateur de vente (P&L par scénario)
- Les alertes de paliers (multiplicateur ×N)
- Les alertes ATH (multiplicateur ×N)

Si tu mets `0`, les calculs P&L sont simplement omis des messages.

---

## Fonctions disponibles depuis l'éditeur Apps Script

### Tests (pour vérifier que tout fonctionne)

| Fonction | Ce qu'elle envoie |
|---|---|
| `testBDAGpush()` | Push prix simple + portefeuille |
| `testBDAGbilan()` | Bilan journalier complet |
| `testBDAGmarket()` | Push market stats |
| `testSimulateurVente()` | Push simulateur de vente |
| `testRangCMC()` | Simule une montée de rang pour tester l'alerte |
| `testATH()` | Simule un nouveau ATH (réinitialise l'ATH sauvegardé) |
| `testVolumeSpike()` | Simule un spike de volume (injecte un historique bas) |

### Utilitaires

| Fonction | Rôle |
|---|---|
| `listerTargets()` | Affiche tes paliers dans les logs |
| `resetTargets()` | Supprime tous les paliers |
| `ajouterTarget(prix, label)` | Ajoute un palier |
| `configurerMesPaliers()` | Recharge tous tes paliers (à éditer puis exécuter) |
| `debugBilan()` | Affiche l'état interne complet du script dans les logs |
| `debugIcon()` | Vérifie que le coin ID CMC est bien sauvegardé et affiche l'URL de l'icône |
| `resetLastSent()` | Force le prochain check horaire à envoyer un push (contourne l'anti-doublon) |

---

## Personnaliser les heures d'envoi

Par défaut le script envoie aux heures : `[2, 6, 10, 12, 14, 18, 22]`

Pour changer, modifie la ligne en haut du script :

```js
const HEURES_ENVOI = [8, 12, 18]; // exemple : 3 pushs par jour
```

> L'heure `12` doit toujours être présente pour que le bilan journalier soit envoyé automatiquement. Si tu la retires, utilise `testBDAGbilan()` ou le bouton du menu pour l'obtenir manuellement.

---

## Dépannage

**Je ne reçois plus de notifications**
- Vérifie que le déclencheur toutes les 5 min est toujours actif (⏰ Déclencheurs dans Apps Script)
- Exécute `debugBilan()` et regarde les logs — il affiche l'état complet du système
- Exécute `testBDAGpush()` pour tester manuellement

**Le solde affiché est marqué "⚠️ cache"**
Le nœud RPC de la blockchain était temporairement inaccessible. Le script a utilisé le dernier solde connu. Il se remettra à jour automatiquement au prochain check.

**Le bouton du menu ne fonctionne pas**
L'URL de la Web App a peut-être changé suite à un redéploiement. Vérifie que `PUSHOVER_ACTIONS.menu` dans les constantes contient l'URL à jour, puis redéploie en "Nouvelle version".

**Un palier n'a pas déclenché d'alerte**
- Vérifie avec `listerTargets()` que le palier n'est pas déjà marqué ✅
- Les alertes sont vérifiées toutes les 10 minutes (configurable via `INTERVALLE_CMC_MIN`)

**L'alerte ATH ne se déclenche pas**
- Vérifie dans `debugBilan()` la valeur "ATH enregistré" — si elle est déjà supérieure au prix actuel, c'est normal
- Pour forcer un test, exécute `testATH()` (remet l'ATH à presque zéro pour que le prix actuel le batte)

**Je reçois des pushs en double**
Normalement impossible grâce à l'anti-doublon. Si ça arrive, exécute `debugBilan()` pour vérifier l'état de `bdag_last_sent_hour`.
