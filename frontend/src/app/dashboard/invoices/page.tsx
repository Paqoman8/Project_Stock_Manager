'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import { useInvoices } from './hooks/useInvoices';
import InvoiceFilters from './components/InvoiceFilters';
import InvoiceTable from './components/InvoiceTable';
import CreateInvoiceModal from './components/CreateInvoiceModal';
import InvoiceDetailModal from './components/InvoiceDetailModal';
import PayInvoiceModal from './components/PayInvoiceModal';
import DisputeInvoiceModal from './components/DisputeInvoiceModal';
import type { SupplierInvoiceRow } from './types';

const ROLES_ALLOWED = ['Super Administrateur', 'Administrateur'];

export default function InvoicesPage() {
  const router = useRouter();
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  const { invoices, orders, isLoading, fetchError, filterStatus, setFilterStatus, loadData } = useInvoices();

  const [showCreate,       setShowCreate]       = useState(false);
  const [invoiceToDetail,  setInvoiceToDetail]  = useState<SupplierInvoiceRow | null>(null);
  const [invoiceToPay,     setInvoiceToPay]     = useState<SupplierInvoiceRow | null>(null);
  const [invoiceToDispute, setInvoiceToDispute] = useState<SupplierInvoiceRow | null>(null);

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) router.replace('/dashboard');
  }, [sessionLoading, sessionUser, router]);

  useEffect(() => {
    if (sessionLoading || !sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  async function handleReopen(invoice: SupplierInvoiceRow) {
    try {
      await apiClient.patch(`/api/invoices/${invoice.id}/reopen`);
      loadData();
    } catch (err) {
      console.error('Erreur lors de la réouverture :', err);
    }
  }

  if (sessionLoading || !sessionUser) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 bg-borderLight rounded animate-pulse" aria-hidden="true" />
      </div>
    );
  }

  if (!ROLES_ALLOWED.includes(sessionUser.roleName)) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-textMain">Factures fournisseurs</h1>
          <p className="text-sm text-textMuted">Suivi des factures liées aux commandes fournisseurs.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + Nouvelle facture
        </Button>
      </div>

      <InvoiceFilters filterStatus={filterStatus} onStatusChange={setFilterStatus} />

      <InvoiceTable
        invoices={invoices} isLoading={isLoading} fetchError={fetchError}
        onDetail={setInvoiceToDetail} onPay={setInvoiceToPay}
      />

      {showCreate && (
        <CreateInvoiceModal orders={orders} onClose={() => setShowCreate(false)} onSuccess={loadData} />
      )}

      <InvoiceDetailModal
        invoice={invoiceToDetail} onClose={() => setInvoiceToDetail(null)} onSuccess={loadData}
        onPay={(inv) => setInvoiceToPay(inv)}
        onDispute={(inv) => setInvoiceToDispute(inv)}
        onReopen={handleReopen}
      />

      <PayInvoiceModal
        invoice={invoiceToPay} onClose={() => setInvoiceToPay(null)} onSuccess={loadData}
      />

      <DisputeInvoiceModal
        invoice={invoiceToDispute} onClose={() => setInvoiceToDispute(null)} onSuccess={loadData}
      />
    </div>
  );
}
