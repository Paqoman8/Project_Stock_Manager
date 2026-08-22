// src/lib/pos.ts
//
// Shared constants and helpers for the POS/Caisse module (M13).
// Single source of truth — import from here instead of redeclaring.

// ---------------------------------------------------------------------------
// ROLES
// ---------------------------------------------------------------------------

/**
 * Roles that are authorized to access POS features (create sales, view
 * transactions, see the daily summary widget).
 */
export const POS_ROLES = [
  'Super Administrateur',
  'Administrateur',
  'Manager Magasin',
  'Opérateur',
  'Caissier',
] as const;

export type PosRole = (typeof POS_ROLES)[number];


// ---------------------------------------------------------------------------
// LABELS
// ---------------------------------------------------------------------------

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE_MONEY';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH:         'Espèces',
  CARD:         'Carte bancaire',
  MOBILE_MONEY: 'Mobile Money',
};


// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

/**
 * Formats a numeric price for French locale display (e.g. "12 500").
 */
export function formatPrice(value: string | number): string {
  return Number(value).toLocaleString('fr-FR', { minimumFractionDigits: 0 });
}

/**
 * Extracts a user-facing error message from an Axios error response.
 * Falls back to the provided fallback string if no message is available.
 */
export function extractApiError(err: unknown, fallback: string): string {
  if (isAxiosLikeError(err)) return err.response?.data?.message ?? fallback;
  return fallback;
}

// Internal type guard — avoids importing axios in this utility file.
type AxiosLikeError = { response?: { data?: { message?: string } } };

function isAxiosLikeError(err: unknown): err is AxiosLikeError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'response' in err
  );
}
