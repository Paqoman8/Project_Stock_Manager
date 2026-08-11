// src/app/platform/page.tsx
// Tableau de bord du Platform Manager — point d'entrée du panneau plateforme.
// Accès déjà garanti par PlatformGuard (layout) : cette page ne s'affiche
// jamais pour un compte qui n'est pas Platform Manager.
//
// Sert pour l'instant de hub vers les sections disponibles (Organisations).
// À enrichir au fil des prochaines sections (stats globales, etc.).

import Link from 'next/link';

export default function PlatformDashboardPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-textMain">Tableau de bord plateforme</h1>

      <Link
        href="/platform/organizations"
        className="block rounded border border-borderLight bg-surface p-6 hover:border-primary transition-colors"
      >
        <h2 className="text-base font-medium text-textMain">Organisations</h2>
        <p className="text-sm text-textMuted mt-1">
          Gérer les organisations clientes : liste, création, suspension, réactivation.
        </p>
      </Link>
    </section>
  );
}
