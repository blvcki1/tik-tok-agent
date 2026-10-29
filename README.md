# Plateforme de formulaire → canal admin Telegram

Flux : utilisateur → formulaire web → serveur (`/submit`) → bot → message dans le canal admin.

## Installation
1. Créez le bot avec @BotFather et récupérez le token.
2. Ajoutez le bot comme **administrateur** du canal admin. Récupérez l'ID du canal (ex. `-100...`).
3. `copy .env.example .env`, puis renseignez les valeurs.
4. `npm install` puis `npm start`.
5. Ouvrez http://localhost:3000. Pour partager le lien, hébergez le site (Render, Railway, VPS...).

## Personnaliser
Champs : `public/index.html` et le message dans `server.js` (`/submit`).
