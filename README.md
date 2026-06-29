# Nissab du Jour

Un petit site qui affiche le **nisâb du jour en or et en argent (en euros)**, les
**dates hégirienne et grégorienne** du jour et du **hawl** (un an lunaire plus
tard), avec un bouton pour **ajouter le hawl à l'agenda** (Apple, Outlook ou
Google) accompagné d'un **rappel 3 jours avant**.

Les visiteurs n'ont pas besoin de se connecter.

---

## 1. Comment ça marche

- **Une seule base de code** en Node.js. Le même petit programme (`server.js`)
  sert à la fois le site (le dossier `public/`) et l'API (`/api/nissab`).
- **Deux requêtes par jour** vers GoldAPI.io : une pour l'once d'or (XAU/EUR) et
  une pour l'once d'argent (XAG/EUR). Le serveur les récupère une fois par jour,
  calcule le nisâb, puis garde le résultat **en cache dans un fichier**
  (`data/cache.json`) pour les 24 heures suivantes. Cela fait environ 60
  requêtes par mois, soit largement sous la limite gratuite de 100.
- **Pas de base de données.** Les seules données à mémoriser sont deux prix par
  jour, donc un simple fichier suffit. Moins de choses à installer et à payer.
- **Les dates** (jour, hawl, calendriers hégirien et grégorien) sont calculées
  directement dans le navigateur du visiteur.

Le calcul : `nisab = (prix_de_l_once_en_euros / 31,1034768) × poids_en_grammes`,
avec 85 g pour l'or et 595 g pour l'argent.

---

## 2. Le vocabulaire en deux minutes

Quelques mots qui reviennent plus bas, expliqués simplement.

- **Serveur** : un ordinateur, loué dans le « cloud », qui reste allumé en
  permanence pour faire tourner votre site.
- **AWS Lightsail** : le service d'Amazon qui loue ce genre de petit serveur,
  pensé pour être simple. C'est lui que nous allons utiliser.
- **SSH** : la fenêtre noire (un « terminal ») qui vous permet de taper des
  commandes sur le serveur, à distance.
- **Adresse IP** : l'adresse numérique de votre serveur sur Internet, du genre
  `13.38.xx.xx`.
- **Nom de domaine** : l'adresse lisible de votre site, par exemple
  `nissab-du-jour.fr`. Il s'achète chez un « registrar » (OVH, Gandi,
  Namecheap...).
- **DNS / enregistrement A** : le réglage qui fait pointer votre nom de domaine
  vers l'adresse IP de votre serveur.
- **PM2** : un outil qui lance votre programme et le relance tout seul s'il
  s'arrête ou si le serveur redémarre.
- **Caddy** : un programme qui met votre site en HTTPS (le cadenas) tout seul,
  sans que vous ayez à gérer les certificats.

> Tout au long du guide, je précise à chaque commande **où** la taper :
> **(Sur votre ordinateur)** ou **(Sur le serveur)**. C'est la confusion la plus
> fréquente, alors gardez l'œil dessus.

---

## 3. Tester d'abord sur votre ordinateur

Cette étape est facultative, mais elle permet de voir le site fonctionner avant
de toucher au serveur. Il faut avoir installé Node.js 18 ou plus récent
(téléchargeable sur https://nodejs.org).

**(Sur votre ordinateur)**, dans le dossier du projet :

```bash
npm install
cp .env.example .env
```

Ouvrez ensuite le fichier `.env` avec un éditeur de texte, collez votre clé
GoldAPI après `GOLDAPI_KEY=`, enregistrez, puis :

```bash
npm start
```

Ouvrez votre navigateur sur http://localhost:3000 : le site doit s'afficher avec
les montants du jour.

### Obtenir une clé GoldAPI (gratuit)

1. Créez un compte sur https://www.goldapi.io
2. Copiez votre clé (elle ressemble à `goldapi-xxxx-io`).
3. C'est cette clé que vous collez dans `.env`.

---

## 4. Mettre en ligne sur AWS, étape par étape

L'objectif : louer un petit serveur chez AWS Lightsail, y déposer le code, et
rendre le site accessible publiquement en HTTPS. Comptez une trentaine de
minutes la première fois.

### Ce qu'il vous faut avant de commencer

- Un compte AWS (avec une carte bancaire enregistrée). Si vous n'en avez pas,
  créez-le sur https://aws.amazon.com.
- Idéalement un nom de domaine (pour avoir une jolie adresse en HTTPS). Sans
  domaine, vous pourrez quand même tester le site, mais seulement via l'adresse
  IP et sans le cadenas HTTPS. Voir l'étape 4.8.

---

### Étape 4.1 — Créer le serveur

1. Connectez-vous à la console AWS, puis cherchez **Lightsail** dans la barre de
   recherche en haut, et ouvrez-le.
2. Cliquez sur le bouton **Create instance** (Créer une instance).
3. Choisissez la région la plus proche de vous (par exemple Paris).
4. Dans **Select a platform**, choisissez **Linux/Unix**.
5. Dans **Select a blueprint**, choisissez l'onglet **OS Only**, puis
   **Ubuntu 22.04 LTS**.
6. Plus bas, dans le choix du forfait (**instance plan**), prenez le moins cher
   (512 Mo ou 1 Go de mémoire suffisent largement ici). Le prix mensuel est
   affiché à l'écran avant de valider.
7. Donnez un nom à l'instance, par exemple `nissab`, puis cliquez sur
   **Create instance**.

**Comment vérifier :** au bout d'une minute, votre instance apparaît dans la
liste avec l'état « Running » (en marche).

---

### Étape 4.2 — Donner une adresse fixe et ouvrir les ports

Par défaut l'adresse IP du serveur peut changer ; on la fige, et on autorise le
trafic web.

1. Cliquez sur votre instance pour l'ouvrir, puis allez dans l'onglet
   **Networking** (Réseau).
2. Trouvez la section des adresses IP et cliquez sur **Attach static IP** (ou
   **Create static IP**). Donnez-lui un nom, validez. **Notez bien cette adresse
   IP**, elle vous servira plus loin.
3. Toujours dans **Networking**, repérez les règles de pare-feu
   (**IPv4 Firewall**). Assurez-vous que les ports suivants sont autorisés, et
   ajoutez-les sinon :
   - **HTTP**, port **80**
   - **HTTPS**, port **443**

**Comment vérifier :** la section pare-feu liste bien des lignes HTTP (80) et
HTTPS (443).

---

### Étape 4.3 — Se connecter au serveur

1. Revenez sur la page de votre instance.
2. Cliquez sur le bouton **Connect using SSH** (Se connecter via SSH).
3. Une fenêtre noire s'ouvre dans votre navigateur : c'est le terminal du
   serveur. **C'est ici que vous taperez toutes les commandes marquées
   « (Sur le serveur) ».**

> Astuce : dans cette fenêtre, le coller se fait souvent avec un clic droit ou
> Ctrl+Maj+V plutôt que Ctrl+V.

**Comment vérifier :** vous voyez une ligne se terminant par un symbole `$` qui
attend que vous tapiez quelque chose.

---

### Étape 4.4 — Installer les outils nécessaires

**(Sur le serveur)**, copiez-collez ce bloc en entier, puis appuyez sur Entrée.
Il installe Node.js, PM2 et Caddy. Cela prend une à deux minutes.

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2 (garde l'app en vie)
sudo npm install -g pm2

# Caddy (HTTPS automatique)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

**Comment vérifier :** tapez `node -v`, puis `pm2 -v`, puis `caddy version`.
Chacune doit afficher un numéro de version, sans message d'erreur.

---

### Étape 4.5 — Déposer le code sur le serveur

La façon la plus simple est de passer par GitHub. Comme aucun secret n'est dans
le code (votre clé reste dans `.env`, qui n'est jamais envoyé), un dépôt
**public** convient parfaitement.

**(Sur votre ordinateur / sur le site GitHub)** :

1. Créez un compte gratuit sur https://github.com si besoin.
2. Cliquez sur **New repository**, nommez-le par exemple `nissab-du-jour`,
   laissez-le **Public**, et créez-le.
3. Sur la page du dépôt vide, cliquez sur **uploading an existing file**, puis
   glissez-y tous les fichiers du projet (vous pouvez glisser le dossier
   entier). Validez avec **Commit changes**.
4. En haut du dépôt, cliquez sur le bouton vert **Code**, puis copiez l'adresse
   **HTTPS** (du genre `https://github.com/votre-nom/nissab-du-jour.git`).

**(Sur le serveur)**, récupérez le code et entrez dans le dossier :

```bash
git clone https://github.com/votre-nom/nissab-du-jour.git
cd nissab-du-jour
npm install --omit=dev
```

**Comment vérifier :** la commande `ls` affiche bien `server.js`, `public`,
`package.json`, etc.

> Vous préférez ne pas utiliser GitHub ? Dites-le-moi, je vous donnerai la
> méthode par transfert direct (scp). Mais GitHub reste le plus simple.

---

### Étape 4.6 — Renseigner votre clé GoldAPI

**(Sur le serveur)**, toujours dans le dossier `nissab-du-jour` :

```bash
cp .env.example .env
nano .env
```

L'éditeur `nano` s'ouvre. Remplacez la valeur après `GOLDAPI_KEY=` par votre
vraie clé. Pour enregistrer et quitter : **Ctrl+O**, puis **Entrée**, puis
**Ctrl+X**.

> Au passage, c'est dans ce même fichier que vous réglez l'heure de
> rafraîchissement. `CRON=1 0 * * *` correspond à 00h01, par exemple.

---

### Étape 4.7 — Démarrer l'application

**(Sur le serveur)** :

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

La commande `pm2 startup` affiche **une ligne** à copier-coller puis à exécuter :
faites-le, c'est ce qui garantit que le site redémarre tout seul si le serveur
reboote.

**Comment vérifier :** tapez `pm2 status`. Votre app `nissab-du-jour` doit être
à l'état « online ». Vous pouvez aussi tester dans votre navigateur :
`http://VOTRE-IP:3000` (remplacez par l'IP fixe de l'étape 4.2) doit afficher le
site.

---

### Étape 4.8 — Brancher le nom de domaine et activer le HTTPS

Cette étape donne l'adresse finale et le cadenas. Elle suppose que vous avez un
nom de domaine.

**Chez votre fournisseur de domaine** (la où vous l'avez acheté), dans les
réglages DNS, créez un enregistrement de type **A** :

- Nom / hôte : `@` (ou le sous-domaine voulu, par exemple `www`)
- Valeur / cible : **l'adresse IP fixe** de votre serveur
- Enregistrez. La prise en compte peut prendre de quelques minutes à quelques
  heures.

**(Sur le serveur)**, ouvrez le fichier de configuration de Caddy fourni dans le
projet et remplacez `nissab.exemple.com` par votre vrai domaine :

```bash
nano Caddyfile
```

(Ctrl+O, Entrée, Ctrl+X pour enregistrer.) Puis activez-le :

```bash
sudo cp Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy obtient alors tout seul le certificat HTTPS.

**Comment vérifier :** ouvrez `https://votre-domaine` dans le navigateur. Le
site s'affiche avec le cadenas. C'est en ligne.

---

## 5. Mettre à jour le site plus tard

Quand vous modifiez le code (sur GitHub), récupérez la nouvelle version sur le
serveur :

**(Sur le serveur)**, dans le dossier du projet :

```bash
git pull
npm install --omit=dev
pm2 restart nissab-du-jour
```

---

## 6. Voir les journaux et dépanner

**(Sur le serveur)** :

- Voir ce que fait l'app en direct : `pm2 logs nissab-du-jour`
- État de l'app : `pm2 status`
- État de Caddy (HTTPS) : `sudo systemctl status caddy`

Quelques cas courants :

- **Le site affiche des tirets à la place des montants.** L'app n'arrive pas à
  joindre GoldAPI. Vérifiez que la clé dans `.env` est correcte, puis
  `pm2 restart nissab-du-jour`. Regardez `pm2 logs` pour le message d'erreur.
- **`https://votre-domaine` ne répond pas.** Le DNS n'est peut-être pas encore
  propagé (patientez), ou l'enregistrement A ne pointe pas vers la bonne IP, ou
  les ports 80/443 ne sont pas ouverts (étape 4.2).
- **`http://VOTRE-IP:3000` ne répond pas.** L'app n'est pas démarrée : voyez
  `pm2 status` et `pm2 logs`.

---

## 7. Réglages utiles (fichier `.env`)

- `GOLDAPI_KEY` : votre clé GoldAPI.
- `PRICE_FIELD` : `prev_close_price` (dernière clôture, par défaut) ou `price`
  (cours spot).
- `CRON` : heure du rafraîchissement quotidien, au format « minute heure ».
  Exemples : `0 6 * * *` = 06:00, `1 0 * * *` = 00h01, `0 0 * * *` = minuit.

L'heure suit le fuseau du serveur, fixé à `Europe/Paris` dans
`ecosystem.config.js`. Le calendrier hégirien utilisé pour l'affichage est
Umm al-Qurâ ; pour en changer, modifiez `ISLAMIC_CAL` en haut de
`public/app.js`.

---

## 8. À propos du rappel d'agenda

- Le **fichier .ics** porte le rappel « 3 jours avant » et fonctionne sur Apple
  Calendrier, Outlook, et dans Google Agenda après import. Sa description
  rappelle aussi les montants du nisâb relevés le jour de la consultation.
- Le **lien Google Agenda** ouvre un évènement prérempli, mais Google ne permet
  pas d'imposer un rappel par ce lien : il applique alors vos réglages par
  défaut. Pour un rappel garanti partout, privilégiez le .ics.

---

## 9. Coût indicatif

- AWS Lightsail : à partir d'environ 5 $/mois (le prix exact s'affiche dans la
  console avant que vous validiez).
- GoldAPI.io : gratuit (100 requêtes/mois, on en utilise environ 60).
- Nom de domaine : variable, souvent 10 à 15 € par an.
