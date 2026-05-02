import type { Metadata } from 'next';
import { SessionProvider } from '@/contexts/SessionContext';
import { DashboardShell } from '@/components/layout/DashboardShell';
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
      <DashboardShell>{children}</DashboardShell>
    </SessionProvider>
  );
}
