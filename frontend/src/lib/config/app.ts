// src/lib/config/app.ts
//
// Constantes applicatives globales — source unique de vérité pour le nom de l'application.
// Toutes les occurrences du nom doivent importer APP_NAME depuis ce fichier.
//
// Configurable via NEXT_PUBLIC_APP_NAME (baked au build) :
//   - Docker : passer APP_NAME dans le .env racine, récupéré comme build ARG
//   - Dev local : définir NEXT_PUBLIC_APP_NAME dans frontend/.env.local

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Stock Manager';

export const APP_DESCRIPTION = 'Gestion Commerciale Centralisée';
