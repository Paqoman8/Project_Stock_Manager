// src/lib/config/app.ts
//
// Constantes applicatives globales de GStock.
// Source unique de vérité — toutes les occurrences du nom de l'application
// doivent importer APP_NAME depuis ce fichier plutôt que de le hardcoder.
//
// Le nom est configurable via la variable d'environnement NEXT_PUBLIC_APP_NAME
// dans .env.local. "GStock" est utilisé comme valeur par défaut si la variable
// est absente (ex : CI, démo, ou environnement non configuré).

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'GStock';

export const APP_DESCRIPTION = 'Gestion Commerciale Centralisée';
