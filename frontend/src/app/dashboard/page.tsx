// src/app/dashboard/page.tsx
// Page d'accueil du dashboard — Server Component.
//
// Rôle minimal : point d'atterrissage après login.
// Oriente l'utilisateur vers les sections disponibles via le menu latéral.
// Pas de fetch de données ici — c'est une page d'orientation, pas de contenu.

import { Card } from '@/components/ui/Card';

export default function DashboardPage() {
  return (
    <div className="max-w-2xl">
      {/* Titre de page — 24px Semi-Bold selon UI_UX_KIT §3 */}
      <h1 className="text-2xl font-semibold text-textMain mb-6">
        Tableau de bord
      </h1>

      <Card>
        <p className="text-sm text-textMuted">
          Sélectionnez une section dans le menu de gauche.
        </p>
      </Card>
    </div>
  );
}
