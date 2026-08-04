// src/app/platform/page.tsx
// Tableau de bord du Platform Manager — pour le moment une coquille vide.
// Accès déjà garanti par PlatformGuard (layout) : cette page ne s'affiche
// jamais pour un compte qui n'est pas Platform Manager.
//
// Prochaines étapes : liste des organisations, provisioning, suspend/reactivate.

export default function PlatformDashboardPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold text-textMain">Tableau de bord plateforme</h1>

      <div className="rounded border border-dashed border-borderLight bg-surface p-8 text-center">
        <p className="text-sm text-textMuted">
          Cette section accueillera la gestion des organisations clientes
          (liste, création, suspension, suppression). À venir.
        </p>
      </div>
    </section>
  );
}
