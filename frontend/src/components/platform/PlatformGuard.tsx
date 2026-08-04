// src/components/platform/PlatformGuard.tsx
//
// Garde d'accès au panneau plateforme : vérifie user.isPlatformManager
// avant de laisser le layout plateforme s'afficher. Un compte qui n'est
// pas Platform Manager est renvoyé vers /dashboard.
//
// Tant que la session n'est pas hydratée ou que le rôle ne correspond pas,
// on n'affiche rien (le layout — navbar plateforme comprise — reste caché)
// pour éviter tout flash de l'interface plateforme sur un mauvais rôle.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';

export function PlatformGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    if (!user.isPlatformManager) {
      router.replace('/dashboard');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user || !user.isPlatformManager) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="h-10 w-64 animate-pulse rounded bg-borderLight" aria-hidden="true" />
      </div>
    );
  }

  return <>{children}</>;
}
