export function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString('fr-FR', {
    style:                 'currency',
    currency:              'XOF',
    minimumFractionDigits: 0,
  });
}
