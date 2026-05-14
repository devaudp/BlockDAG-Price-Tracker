# BDAG Price Tracker — Guide d'installation

## Prérequis

- Un compte Google (Gmail suffit)
- Un smartphone avec l'app **Pushover** installée (iOS ou Android)
- Une clé API **CoinMarketCap** gratuite
- Ton adresse wallet BDAG

---

## Étape 1 — Créer un compte Pushover

1. Va sur [pushover.net](https://pushover.net) et crée un compte
2. Installe l'app **Pushover** sur ton smartphone et connecte-toi
3. Sur la page d'accueil de pushover.net, note ta **User Key** (encadrée en haut à droite)

### Créer une application Pushover

1. Sur pushover.net, clique sur **"Create an Application/API Token"**
2. Donne-lui un nom (ex: `BDAG Tracker`) et une icône si tu veux
3. Valide — note le **API Token** généré

Tu as maintenant :
- `User Key` → à mettre dans `PUSHOVER_BDAG_USER`
- `API Token` → à mettre dans `PUSHOVER_BDAG_TOKEN`

---

## Étape 2 — Obtenir une clé API CoinMarketCap

1. Va sur [coinmarketcap.com/api](https://coinmarketcap.com/api/)
2. Clique sur **"Get Your Free API Key"**
3. Crée un compte et confirme ton email
4. Sur le dashboard, copie ta **API Key**

> Le plan gratuit suffit (10 000 crédits/mois). Le script est configuré pour appeler CMC toutes les 10 minutes au maximum, soit ~144 appels/jour et ~4 320/mois.

---

## Étape 3 — Créer le script Google Apps Script

1. Va sur [script.google.com](https://script.google.com)
2. Clique sur **"Nouveau projet"**
3. Renomme le projet (ex: `BDAG Tracker`)
4. **Supprime** le contenu par défaut dans l'éditeur
5. **Colle** tout le contenu du fichier `BDAG_Tracker_Script_TEMPLATE.js`
6. Remplis les constantes en haut du script (voir Étape 4)

---

## Étape 4 — Configurer les constantes

En haut du script, remplis les valeurs entre guillemets :

```js
const PUSHOVER_BDAG_TOKEN = "TON_API_TOKEN_PUSHOVER";
const PUSHOVER_BDAG_USER  = "TA_USER_KEY_PUSHOVER";
const CMC_API_KEY         = "TA_CLE_API_COINMARKETCAP";
const BDAG_WALLET         = "0xTON_ADRESSE_WALLET_BDAG";
const BDAG_PRIX_ACHAT_CHF = 0.0005; // Ton prix moyen d'achat par BDAG en CHF (0 pour ignorer)
```

> `BDAG_PRIX_ACHAT_CHF` : divise le total CHF investi par le nombre de BDAG détenus.
> Exemple : 100 CHF investis pour 200 000 BDAG → `0.0005`
> Si tu ne veux pas de calcul P&L, laisse `0`.

### Constantes avancées (optionnel)

Ces constantes ont des valeurs par défaut raisonnables. Tu peux les laisser telles quelles.

```js
const HEURES_ENVOI       = [2, 6, 10, 12, 14, 18, 22]; // Heures des pushs horaires
const RANG_ALERTE_SEUIL  = 5;   // Nb de positions CMC pour déclencher une alerte rang
const VOLUME_SPIKE_RATIO = 2;   // Multiplicateur vs moyenne 7j pour alerte volume inhabituek
const INTERVALLE_CMC_MIN = 10;  // Minutes minimum entre deux appels CMC
```

---

## Étape 5 — Déployer la Web App

Le menu d'actions (boutons Pushover) nécessite une Web App déployée.

1. Dans l'éditeur Apps Script, clique sur **"Déployer" → "Nouveau déploiement"**
2. Clique sur l'icône ⚙️ à côté de "Sélectionner un type" → choisis **"Application Web"**
3. Paramètres :
   - **Exécuter en tant que** : Moi
   - **Qui a accès** : Tout le monde
4. Clique **"Déployer"** et autorise les permissions demandées
5. Copie l'**URL de déploiement** générée (ressemble à `https://script.google.com/macros/s/XXXX/exec`)

### Coller l'URL dans le script

Remplace `VOTRE_URL_WEBAPP_APRES_DEPLOIEMENT` dans la constante `PUSHOVER_ACTIONS` :

```js
const PUSHOVER_ACTIONS = {
  menu: "https://script.google.com/macros/s/XXXX/exec"  // ← ton URL ici
};
```

C'est la seule occurrence à modifier. L'URL est automatiquement réutilisée partout dans le script (menu HTML, boutons Pushover).

Après avoir modifié cette ligne, **redéploie** :
- **"Déployer" → "Gérer les déploiements"** → ✏️ modifier → **"Nouvelle version"** → Déployer

---

## Étape 6 — Créer le déclencheur automatique

Le script doit tourner toutes les **5 minutes** pour que les alertes critiques (ATH, paliers, rang CMC) soient détectées rapidement.

1. Dans l'éditeur Apps Script, clique sur l'icône **⏰ Déclencheurs** (horloge dans le menu gauche)
2. Clique sur **"+ Ajouter un déclencheur"** en bas à droite
3. Configure :
   - **Fonction à exécuter** : `checkBDAGprice`
   - **Source de l'événement** : Déclencheur temporel
   - **Type de déclencheur** : Toutes les minutes
   - **Intervalle** : Toutes les 5 minutes
4. Clique **"Enregistrer"**

> Même avec un déclencheur à 5 minutes, CoinMarketCap n'est appelé qu'une fois toutes les 10 minutes grâce à la constante `INTERVALLE_CMC_MIN`. Les pushs horaires planifiés sont eux protégés contre les doublons par un anti-doublon interne.

---

## Étape 7 — Configurer tes paliers cibles

1. Dans l'éditeur, trouve la fonction `configurerMesPaliers()` en bas du script
2. Modifie les paliers selon tes objectifs :

```js
function configurerMesPaliers() {
  resetTargets();
  ajouterTarget(0.001,  "×2");    // ex: si ton PAM est 0.0005
  ajouterTarget(0.005,  "×10");
  ajouterTarget(0.01,   "×20");
  listerTargets();
}
```

3. Sélectionne `configurerMesPaliers` dans le menu déroulant et clique ▶ **Exécuter**
4. Vérifie les logs (**Affichage → Journaux d'exécution**) pour confirmer

---

## Étape 8 — Tester

Avant de laisser tourner, teste que tout fonctionne :

1. Sélectionne `testBDAGpush` dans le menu déroulant → ▶ Exécuter
2. Tu devrais recevoir une notification Pushover sur ton téléphone
3. Si ça fonctionne, teste `testBDAGbilan`, `testBDAGmarket`, `testSimulateurVente`, `testATH`, `testVolumeSpike` et `testRangCMC`

Si tu ne reçois rien, vérifie :
- Les constantes (token, user key, clé CMC)
- Les logs d'exécution pour voir les erreurs (**Affichage → Journaux d'exécution**)

---

## Redéploiement après modification du script

À chaque fois que tu modifies le code et veux que le menu Pushover reflète les changements :

1. **"Déployer" → "Gérer les déploiements"**
2. ✏️ Modifier → **"Nouvelle version"** → Déployer

L'URL reste la même, rien d'autre à changer.
