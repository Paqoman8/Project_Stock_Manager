// src/lib/errors.ts
// Utilitaire partagé d'extraction de message d'erreur Axios.
// Évite la duplication du pattern typeof error === 'object' && 'response' in error
// dans chaque composant qui appelle l'API.

/**
 * Extrait un message lisible d'une erreur Axios (ou générique).
 * Retourne le message serveur s'il est disponible, sinon un fallback.
 */
export function extractApiErrorMessage(
  error: unknown,
  fallback: string = 'Impossible de joindre le serveur.',
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error
  ) {
    const axiosError = error as {
      response?: { data?: { message?: string } };
    };
    return axiosError.response?.data?.message || fallback;
  }
  return fallback;
}
