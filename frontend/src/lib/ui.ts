// src/lib/ui.ts
// Utilitaires UI partagés entre toutes les pages du dashboard.
// Centralise ce qui était dupliqué (formatters, inputCls, extractApiError).

import axios from 'axios';

// Classe CSS commune à tous les inputs/selects des modales et filtres.
export const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

// Formate une date ISO en date courte fr-FR (jj/mm/aaaa). Retourne '—' si null.
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Formate une date ISO en date + heure fr-FR (jj/mm/aaaa hh:mm).
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Formate un Decimal Prisma (string) en montant lisible (ex: "12 500 FCFA").
export function formatPrice(price: string): string {
  return (
    parseFloat(price).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + ' FCFA'
  );
}

// Extrait le message d'erreur d'une réponse axios, avec fallback.
export function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message ?? fallback;
  }
  return fallback;
}
