# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + composants shadcn-style (Radix) + Auth.js (OAuth2 Discord). Monorepo pnpm/Turborepo : le dashboard partage `@syntra/db`, `@syntra/shared`, `@syntra/security`, `@syntra/core` avec le bot et l'API.

## Users

Les opérateurs de Syntra (le propriétaire du produit) et le staff des serveurs FiveM qui l'utilisent : responsables de pôles (Légal, Illégal, Staff, Event, Dev…), administrateurs, modérateurs. Ils s'y connectent avec leur compte Discord ; chacun ne voit et ne modifie que son périmètre, déterminé par ses rôles Discord réels sur chaque serveur du projet. Usage quotidien, souvent de nuit, en parallèle de Discord et du jeu.

## Product Purpose

Syntra est un bot Discord multi-projets pour serveurs FiveM, vendable sans modifier le code par client. Le dashboard est l'unique poste de pilotage : activer/configurer les modules par serveur Discord, suivre tickets, reports et transcripts, composer et éditer des messages Discord (Embed Builder), gérer clés API et accès, relire l'audit. Succès : un responsable règle un module ou traite un dossier sans jamais ouvrir un fichier de config, et sait immédiatement si le bot est sain.

## Positioning

Console unique, 100 % pilotée par les données, qui relie Discord, le site vitrine externe et le serveur FiveM (bridge) avec des droits fins par rôle Discord réel. Aucun ID, texte ou format n'est figé : tout se règle ici.

## Operating Context

Un projet = un serveur FiveM ; il regroupe plusieurs serveurs Discord (Principal, Staff, Pôle Légal, Pôle Illégal, Event, Dev…). Un seul bot sert tous les projets. Les reports naissent en jeu (≠ tickets) et sont traités depuis un fil Discord ; les tickets naissent en MP Discord. Les transcripts conservent messages, notes internes (invisibles du joueur) et pièces jointes.

## Capabilities and Constraints

- Sélecteur rapide de projet et de serveur Discord ; cartes de modules avec interrupteurs instantanés et alerte de santé (permissions Discord manquantes) ; clés API/HMAC par projet (secret affiché une seule fois) ; visionneuse de transcripts fidèle à Discord (joueur / staff / anonyme / note interne distincts) ; Embed Builder en écran partagé avec rendu Discord en direct et édition de messages déjà postés ; journal d'audit (qui, quoi, avant/après).
- Les droits sont vérifiés côté serveur uniquement. Les permissions sensibles (RCON, intégrations, clés API, accès, audit) ne s'héritent jamais d'un seul serveur.
- FR et EN. Aucun secret n'est jamais renvoyé au navigateur après saisie.
- Configuration complète dans la console : pôles, statuts, réponses rapides, textes FR/EN, règles de synchro des rôles, droits par rôle Discord, intégrations FiveM (base en lecture seule, RCON).
- Non décidé : mode clair (le produit est dark natif uniquement pour l'instant), palette de commandes / raccourcis clavier globaux.

## Brand Commitments

Nom Syntra. Logo facetté violet (`assets/brand/logo.png`). Violet clair `#ad83ff`, violet foncé `#9057ff`. Dark mode natif. Niveau de finition attendu : SaaS B2B moderne (Linear, Vercel, Raycast).

## Evidence on Hand

Aucun client, témoignage ni métrique réels : ne rien inventer. Les écrans de démonstration utilisent des données synthétiques clairement fictives.

## Product Principles

1. Le périmètre de chaque personne est visible et respecté : on ne montre jamais ce qu'elle ne peut pas modifier.
2. L'état réel du bot prime : toute configuration montre si elle fonctionne (santé, permissions manquantes).
3. Chaque action est immédiate, réversible quand c'est possible, et tracée.
4. Les données Discord se lisent comme dans Discord : fidélité avant décoration.
5. Soin égal sur tous les écrans : aucun écran « secondaire ».

## Accessibility & Inclusion

Contrastes AA minimum, navigation clavier complète, focus visibles, respect de `prefers-reduced-motion`. Interface bilingue FR/EN.
