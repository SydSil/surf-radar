# Surf Radar

PWA personnelle à 0 € pour repérer les fenêtres de surf adaptées à un débutant autonome en mini-malibu, depuis Laon vers le Nord de la France, la Belgique, les Pays-Bas et le Cotentin.

## Lancer sur l’ordinateur

Prérequis : Node.js 20 ou plus récent.

```powershell
cd C:\Perso\surf-radar
npm start
```

Puis ouvrir `http://127.0.0.1:4173`. Dans Edge ou Chrome, utiliser le bouton **Installer** pour créer une application Windows.

## Ajouter un spot sans coordonnées

Deux parcours simples sont disponibles dans **Mes spots** :

1. **Spots connus** : un catalogue de départ couvre Wimereux, Wissant, Blankenberge, Domburg, Brouwersdam, Scheveningen, Vluchtenburg, Le Rozel, Siouville et Sciotot. Un appui sur **Ajouter** suffit. Les quatre lieux utiles retrouvés dans la liste Google Maps partagée (Vluchtenburg, Le Rozel, Sciotot et Siouville) sont déjà activés au premier lancement.
2. **Carte / recherche** : saisir un nom de plage, de spot ou une adresse, choisir un résultat puis éventuellement déplacer le marqueur sur la carte.

La carte utilise Leaflet et les fonds OpenStreetMap. La recherche utilise Nominatim uniquement après un appui sur **Rechercher** : aucun autocomplétion ni recherche périodique, une requête par seconde au maximum et un cache local pour les recherches répétées. Cette utilisation personnelle respecte la politique du service public ; elle devra être remplacée par une instance dédiée si l’application devient publique ou très utilisée.

Les coordonnées techniques sont calculées et stockées en arrière-plan mais ne sont jamais demandées à l’utilisateur.

## Ajouter les spots Google Maps

Sur Android, après installation de la PWA :

1. Ouvrir la fiche d’une plage dans Google Maps.
2. Toucher **Partager**.
3. Choisir **Surf Radar**.
4. Pour un spot connu, son préréglage prudent est ajouté immédiatement. Pour un autre lieu, Surf Radar affiche son nom et une courte liste de résultats cartographiques à confirmer.

Cette intégration utilise le standard Web Share Target de Chrome Android. Elle ne demande ni compte Google, ni latitude/longitude, ni clé API.

Google ne propose pas d’API publique permettant à une application de synchroniser silencieusement les listes personnelles. Pour reprendre une liste complète, la méthode officielle et gratuite reste Google Takeout :

1. Aller sur <https://takeout.google.com/>.
2. Désélectionner tous les produits.
3. Cocher **Saved / Enregistrés**.
4. Créer une exportation unique au format ZIP.
5. Décompresser l’archive.
6. Dans **Mes spots > Importer Google**, sélectionner le CSV de la liste `spot surf`.

L’import reconnaît CSV, JSON et GeoJSON. Il extrait automatiquement la position des formats habituels de liens Google Maps (`@lat,lon`, `!3d…!4d…`, `query=lat,lon`). Si un lien raccourci ne contient pas directement le lieu, le spot est conservé et marqué **Lieu à retrouver** : ouvrir **Compléter**, taper son nom et choisir le résultat.

## Hébergement gratuit et Android

Le projet est entièrement statique. Préparer le dossier publiable avec :

```powershell
npm run build
```

Le dossier `dist` peut être déposé sur Cloudflare Pages. Un workflow `.github/workflows/pages.yml` est également prêt pour une publication gratuite sur GitHub Pages : il lance les tests, construit l’application puis publie uniquement `dist`.

Une archive prête à déposer est générée dans `C:\Perso\surf-radar\surf-radar-dist.zip`.

Une fois l’URL HTTPS ouverte dans Chrome Android :

1. Menu Chrome **Ajouter à l’écran d’accueil** ou **Installer l’application**.
2. Ouvrir **Mon profil**.
3. Autoriser les notifications.

Une fois installée, l’application apparaît aussi dans la feuille de partage Android : c’est ce qui permet **Google Maps → Partager → Surf Radar**.

Les données personnelles sont conservées dans le navigateur de chaque appareil. Le bouton **Sauvegarder** produit un JSON à transférer sur Android, puis **Restaurer** le recharge.

Le bouton **Activer les alertes quotidiennes** demande à Android un réveil périodique de la PWA. Quand Chrome l’accorde, le service worker relit localement les spots, interroge Open-Meteo une fois par jour et affiche une notification seulement pour un nouveau créneau. Android garde le contrôle de l’heure exacte et peut refuser ou retarder ce réveil selon la batterie, l’engagement avec l’application ou les réglages système. Dans ce cas, l’application conserve le repli simple : actualisation et notification à chaque ouverture.

Cette solution ne nécessite aucun serveur ni abonnement, mais elle est volontairement annoncée comme **best effort** : l’API Periodic Background Sync n’est pas disponible dans tous les navigateurs. Un réveil garanti à heure fixe demanderait ultérieurement un petit service push hébergé.

## Données et scoring

- Open-Meteo Marine : hauteur, direction et période de la mer totale, houle primaire/secondaire et niveau marin.
- Open-Meteo Forecast : vent à 10 m, rafales, lever et coucher du soleil.
- OpenStreetMap/Nominatim : carte et recherche de lieux déclenchée par l’utilisateur.
- Cache local : trois heures, puis utilisation possible du dernier résultat si le réseau échoue.
- Créneau : au moins deux heures consécutives au-dessus du seuil personnel.
- Confiance : élevée à J+0/J+2, moyenne à J+3/J+4, tendance ensuite.

Le score utilise la houle au large, pas une promesse de hauteur au bord. Il applique un plafond quand la houle dépasse la limite du spot, que les rafales sont fortes, que la période est trop courte pour des vagues formées, que la longue période accroît la puissance ou que le créneau est de nuit. Les spots au-delà du trajet facile ne sont pas cachés : ils sont signalés comme **escapade**.

## Tests

```powershell
cd C:\Perso\surf-radar
npm test
```

## Vie privée

Le profil, les spots et le cache des prévisions sont stockés dans `localStorage`. Aucun compte Google, jeton OAuth ou contenu Surfline n’est utilisé. Les mots saisis dans la recherche cartographique — ou le nom d’un lieu partagé volontairement depuis Google Maps — sont transmis à Nominatim ; ne pas y saisir de donnée personnelle ou confidentielle.
