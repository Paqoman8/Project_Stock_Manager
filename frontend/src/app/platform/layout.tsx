import type { Metadata } from 'next';
import { SessionProvider } from '@/contexts/SessionContext';
import { PlatformGuard } from '@/components/platform/PlatformGuard';
import { PlatformNavbar } from '@/components/platform/PlatformNavbar';
import { APP_NAME } from '@/lib/config/app';

export const metadata: Metadata = {
  title: `Panneau Plateforme — ${APP_NAME}`,
};

export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <PlatformGuard>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <PlatformNavbar />
          <main className="flex-1 overflow-y-auto p-6" id="main-content">
            {children}
          </main>
        </div>
      </PlatformGuard>
    </SessionProvider>
  );
}
