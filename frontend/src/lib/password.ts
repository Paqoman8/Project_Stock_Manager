// src/lib/password.ts
// Utilitaires de validation et force de mot de passe.
// Partagé par le modal de premier login, la page mot de passe oublié
// et la page paramètres.

export interface PasswordStrength {
  label: string;
  color: string;
  width: string;
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { label: '', color: 'bg-gray-200', width: '0%' };
  }
  if (password.length < 8) {
    return { label: 'Très faible', color: 'bg-danger', width: '20%' };
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const score = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  if (score <= 1) return { label: 'Faible', color: 'bg-orange-400', width: '35%' };
  if (score === 2) return { label: 'Moyen', color: 'bg-yellow-500', width: '55%' };
  if (score === 3) return { label: 'Fort', color: 'bg-lime-500', width: '80%' };
  return { label: 'Très fort', color: 'bg-success', width: '100%' };
}
