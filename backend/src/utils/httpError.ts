// src/utils/httpError.ts
//
// Utilitaire pour les réponses d'erreur HTTP 500.
// En développement, expose le message d'erreur réel pour faciliter le debug.
// En production, retourne uniquement le message générique.

import { Response } from 'express';

export function sendInternalError(res: Response, error: unknown, context?: string): void {
  if (context) {
    console.error(`[${context}]`, error);
  } else {
    console.error(error);
  }

  const isDev = process.env.NODE_ENV === 'development';
  const detail = isDev && error instanceof Error ? error.message : undefined;

  res.status(500).json({
    success: false,
    message: 'Une erreur interne est survenue.',
    ...(detail ? { detail } : {}),
  });
}
