import crypto from 'crypto';

const PASSWORD_UPPER    = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PASSWORD_LOWER    = 'abcdefghijkmnopqrstuvwxyz';
const PASSWORD_DIGITS   = '23456789';
const PASSWORD_SPECIALS = '!@#$%&*_-+=';
const PASSWORD_ALL      = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGITS + PASSWORD_SPECIALS;

/**
 * Génère un mot de passe aléatoire conforme à la politique de sécurité.
 * Utilise crypto.randomBytes pour une entropie cryptographique suffisante.
 *
 * Garantit au moins :
 *   - 1 majuscule
 *   - 1 minuscule
 *   - 1 chiffre
 *   - 1 caractère spécial
 *
 * @param length - Longueur souhaitée (minimum 4, défaut 16)
 * @returns Mot de passe aléatoire en clair
 */
export function generateSecurePassword(length: number = 16): string {
  const safeLength = Math.max(length, 4);
  const bytes = crypto.randomBytes(safeLength * 2);
  const result: string[] = [];

  result.push(PASSWORD_UPPER[bytes[0] % PASSWORD_UPPER.length]);
  result.push(PASSWORD_LOWER[bytes[1] % PASSWORD_LOWER.length]);
  result.push(PASSWORD_DIGITS[bytes[2] % PASSWORD_DIGITS.length]);
  result.push(PASSWORD_SPECIALS[bytes[3] % PASSWORD_SPECIALS.length]);

  for (let i = 4; i < safeLength; i++) {
    result.push(PASSWORD_ALL[bytes[i] % PASSWORD_ALL.length]);
  }

  for (let i = result.length - 1; i > 0; i--) {
    const j = bytes[bytes.length - 1 - i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}
