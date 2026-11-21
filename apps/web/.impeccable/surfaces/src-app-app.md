---
version: 1
slug: "src-app-app"
primary_target: "src/app/(app)"
related_targets: []
---

# Surface brief — dashboard Syntra (shell + écrans de projet)

Mode : Operate (console de pilotage). Plateforme web, dark natif.

## Contexte
Staff FiveM, de nuit, plusieurs fenêtres Discord ouvertes. Tâches : activer/configurer un module, traiter un ticket ou un report, composer un embed, vérifier la santé du bot, gérer clés et accès. Tous les écrans ont le même niveau de soin.

## Direction contract

THESIS: Une console de pilotage où l'état du bot se lit d'un coup d'œil ; le violet n'est pas décor mais signal (actif, sélectionné, focus). Refus : la grille de cartes SaaS générique avec dégradé partout.
OWN-WORLD: Encre violacée très sombre (#0b0a10 → #201f2d), un seul accent violet (#ad83ff clair, #9057ff plein) réservé aux états actifs, au focus et aux actions principales ; vert/ambre/rouge uniquement pour santé et danger. Facettes angulaires tirées du logo (coupes en biais) comme unique ornement : indicateur de navigation actif, états vides, en-tête des cartes de module activées. Géométrie nette, rayons 6/10/14, séparateurs d'1 px, aucune ombre portée lourde, aucun halo néon. Typo Geist (UI) + Geist Mono (IDs Discord, clés, code).
STORY: Le responsable ouvre un projet, voit en une ligne si tout est sain, bascule un module ou ouvre un dossier, et sait que ça a pris effet (toast, état, audit).
FIRST VIEWPORT: Rail latéral 264 px (logo, sélecteur de projet, sélecteur de serveur Discord, navigation filtrée par droits) ; zone principale : titre du projet + bandeau de santé global en une ligne, puis grille de cartes de modules (interrupteur en haut à droite, état de config, alerte de permission) ; colonne d'activité récente à droite en ≥1280 px.
FORM: Console à rail latéral et panneaux denses de type outil d'ingénierie, position 1 (aucune tournée de concept : direction épinglée par le brief).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

seed: none (pinned) — « Dark Mode natif soigné… niveau de finition Linear, Vercel, Raycast » + violets #ad83ff / #9057ff + logo fourni.
