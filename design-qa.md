# Design QA — refonte Surf Radar

## Vérité source

- Référence choisie par l’utilisateur : `C:\Users\Utilisateur\.codex\generated_images\01a05dee-7873-7ce3-a9f6-a33efd563ff1\exec-48aecd6d-7575-4c7d-9694-705a28ffc4f2.png`
- Dimensions de la référence : 853 × 1844 px.
- État représenté : accueil mobile, trois favoris, une prochaine session recommandée.

## Implémentation contrôlée

- Capture principale mobile : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v6-mobile-home.png`
- Capture complète mobile : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v6-mobile-home-full.png`
- Capture ordinateur : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v6-desktop-home.png`
- Recherche / carte : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v6-mobile-search-dialog.png`
- Liste des spots : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v8-mobile-spots.png`
- Profil : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v8-mobile-profile.png`
- Viewport mobile : 390 × 844 CSS px, DPR 1, thème clair, locale fr-FR, fuseau Europe/Paris.
- Viewport ordinateur : 1440 × 1000 CSS px, DPR 1.
- La référence a été ramenée à 390 × 844 pour la comparaison de densité et de composition.

## Comparaison visuelle

- Comparaison côte à côte finale : `C:\Users\Utilisateur\.codex\visualizations\2026\09\01\01a05dee-7873-7ce3-a9f6-a33efd563ff1\surf-radar-ux-audit\redesign-v6-comparison.png`
- La comparaison complète suffit ici : les zones critiques — en-tête, titre, session principale, bouton d’itinéraire, liste secondaire et navigation — sont toutes visibles dans le même viewport. Aucun recadrage focal supplémentaire n’était nécessaire.
- Correspondances validées : palette blanc/aqua/bleu nuit, fond marin très léger, logo compact, grande hiérarchie typographique, séparation par filets, action turquoise proéminente, listes aérées, navigation inférieure plate.

## Interactions contrôlées

- Les trois spots visibles sur l’accueil exposent un lien Google Maps Directions valide.
- Le bouton principal « S’y rendre » et les actions secondaires utilisent les coordonnées propres à chaque spot.
- La fenêtre d’ajout se ferme avec la croix, « Annuler » et la touche Échap, même lorsque le champ obligatoire est vide.
- La navigation Radar / Spots / Profil fonctionne sur mobile.
- Aucun message d’erreur JavaScript n’a été observé pendant le parcours automatisé.

## Historique des corrections

- v1 : structure encore trop dense, titre sur deux lignes et identité visuelle trop carrée.
- v2 : réduction du titre, des espacements et de la hauteur du verdict.
- v3 : date et lignes secondaires simplifiées.
- v4 : raison de recommandation clarifiée sans surcharge de mesures.
- v5 : ajout du logo transparent généré, en-tête allégé et suppression du bouton d’actualisation sur mobile.
- v6 : lien « Voir tous les spots » replacé après la liste et densité des lignes secondaires ajustée.
- v8 : vérification sans transition intermédiaire des pages Spots et Profil.

## Écarts acceptés

- P3 — La date, les horaires et les mesures diffèrent de la maquette, car l’interface affiche les données réellement calculées au lieu de figer le contenu de référence.
- P3 — Les lignes des spots secondaires sont légèrement plus hautes pour conserver une taille de texte et des cibles tactiles confortables.
- P3 — La version ordinateur adapte la composition en deux zones et une largeur de lecture maîtrisée au lieu d’étirer littéralement la maquette mobile.

## Résultat final

passed
