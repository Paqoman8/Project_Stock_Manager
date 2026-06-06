/**
 * Dashboard homepage — Server Component entry point.
 *
 * Minimal role: landing page after login. Routes user to sections
 * via sidebar menu. No data fetching here — this is an orientation page.
 */

import { Card } from '@/components/ui/Card';
import { DailySalesSummary } from '@/components/dashboard/DailySalesSummary';


// ---------------------------------------------------------------------------
// PAGE                                                                     
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  return (
    <div className="max-w-2xl space-y-4">

      {/* Page title */}
      <h1 className="text-2xl font-semibold text-textMain">
        Tableau de bord
      </h1>

      {/* POS widget — visible to POS-authorized roles only */}
      <DailySalesSummary />

      {/* Orientation card */}
      <Card>
        <p className="text-sm text-textMuted">
          Sélectionnez une section dans le menu de gauche.
        </p>
      </Card>

    </div>
  );
}
