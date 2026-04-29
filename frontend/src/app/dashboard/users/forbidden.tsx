// src/app/dashboard/users/forbidden.tsx
// Page affichée par Next.js quand forbidden() est invoqué dans cette route.
// Renvoie un statut HTTP 403 automatiquement.
//
// Convention Next.js 16 (experimental authInterrupts) :
//   Ce fichier est analogue à not-found.tsx mais pour les erreurs d'autorisation.
//   Il ne reçoit aucune prop (imposé par la convention).
//   Référence : next/dist/docs/01-app/03-api-reference/03-file-conventions/forbidden.md

import Link from 'next/link';
import { Card } from '@/components/ui/Card';

// Pas de 'use client' — composant serveur pur, aucun hook nécessaire.

export default function ForbiddenPage() {
  return (
    // Centrage dans l'espace disponible du layout dashboard
    <div className="flex flex-1 items-center justify-center min-h-[60vh]">
      <Card className="max-w-sm w-full text-center">
        <div className="flex flex-col items-center gap-4 py-2">
          {/* Code d'erreur — discret, informatif */}
          <span className="text-4xl font-bold text-borderLight select-none" aria-hidden="true">
            403
          </span>

          {/* Titre principal */}
          <h1 className="text-xl font-semibold text-textMain">
            Accès refusé
          </h1>

          {/* Explication sobre — pas de jargon technique */}
          <p className="text-sm text-textMuted leading-relaxed">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à
            cette section.
          </p>

          {/* Retour au tableau de bord — action principale */}
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 font-medium rounded px-4 py-2 text-sm bg-[#E9ECEF] text-textMain border border-borderLight hover:bg-[#DEE2E6] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-borderLight transition-opacity mt-2"
          >
            Retour au tableau de bord
          </Link>
        </div>
      </Card>
    </div>
  );
}
