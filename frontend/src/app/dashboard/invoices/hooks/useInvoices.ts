'use client';

import { useCallback, useState } from 'react';
import { extractApiError } from '@/lib/ui';
import apiClient from '@/lib/apiClient';
import type { InvoiceStatus, PurchaseOrderRow, SupplierInvoiceRow } from '../types';

interface UseInvoicesReturn {
  invoices:      SupplierInvoiceRow[];
  orders:        PurchaseOrderRow[];
  isLoading:     boolean;
  fetchError:    string | null;
  filterStatus:  InvoiceStatus | '';
  setFilterStatus: (v: InvoiceStatus | '') => void;
  loadData:      () => Promise<void>;
}

export function useInvoices(): UseInvoicesReturn {
  const [invoices,  setInvoices]  = useState<SupplierInvoiceRow[]>([]);
  const [orders,    setOrders]    = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | ''>('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [invoicesRes, ordersRes] = await Promise.all([
        apiClient.get<{ success: boolean; invoices: SupplierInvoiceRow[] }>(
          filterStatus ? `/api/invoices?status=${filterStatus}` : '/api/invoices',
        ),
        apiClient.get<{ success: boolean; orders: PurchaseOrderRow[] }>('/api/purchase-orders'),
      ]);
      setInvoices(invoicesRes.data.invoices ?? []);
      setOrders(ordersRes.data.orders ?? []);
    } catch (err) {
      setFetchError(extractApiError(err, 'Impossible de charger les factures.'));
    } finally {
      setIsLoading(false);
    }
  }, [filterStatus]);

  return { invoices, orders, isLoading, fetchError, filterStatus, setFilterStatus, loadData };
}
