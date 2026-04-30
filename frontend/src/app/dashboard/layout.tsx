// src/app/dashboard/layout.tsx
// Layout racine de toutes les pages /dashboard.
//
// Ce fichier est un Server Component (pas de 'use client') :
// il se contente d'assembler les blocs sans logique browser.
//
// Responsabilités :
//   - Poser le SessionProvider pour que Navbar et les pages enfants
//     puissent consommer useSession() sans re-fetcher /api/auth/me.
//   - Structurer l'écran en trois zones : Navbar (haut), Sidebar (gauche),
//     Main (droite) — layout standard ERP (UI_UX_KIT §D).
//
// La contrainte `overflow-hidden` sur le wrapper intermédiaire est
// intentionnelle : elle permet à <main> de scroller indépendamment
// sans que la Navbar ou la Sidebar ne bougent.

import type { Metadata } from 'next';
import { SessionProvider } from '@/contexts/SessionContext';
import { Navbar } from '@/components/layout/Navbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { APP_NAME } from '@/lib/config/app';

export const metadata: Metadata = {
  title: `Dashboard — ${APP_NAME}`,
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Barre de navigation supérieure — position sticky gérée dans Navbar */}
        <Navbar />

        {/* Zone principale : Sidebar fixe + contenu scrollable */}
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />

          {/* Zone de contenu : prend tout l'espace restant et scrolle seule */}
          <main className="flex-1 overflow-y-auto p-6" id="main-content">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
