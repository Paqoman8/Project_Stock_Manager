'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import {
  POS_ROLES,
  PAYMENT_LABELS,
  formatPrice,
  extractApiError,
} from '@/lib/pos';
import type { PaymentMethod } from '@/lib/pos';


// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type TransactionType = 'SALE' | 'REFUND' | 'EXPENSE';

type TransactionItem = {
  id:            string;
  product_id:    string;
  qty:           number;
  price_at_sale: string;
  product: { id: string; name: string; sku: string; unit: string };
};

type TransactionRow = {
  id:             string;
  type:           TransactionType;
  payment_method: PaymentMethod;
  total_amount:   string;
  created_at:     string;
  refund_of_id:   string | null;
  store:  { id: string; name: string };
  user:   { id: string; username: string };
  items:  TransactionItem[];
};


// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<TransactionType, string> = {
  SALE:    'Vente',
  REFUND:  'Remboursement',
  EXPENSE: 'Dépense',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  SALE:    'text-green-700 bg-green-50 border-green-200',
  REFUND:  'text-orange-700 bg-orange-50 border-orange-200',
  EXPENSE: 'text-red-700 bg-red-50 border-red-200',
};

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';


// ---------------------------------------------------------------------------
// PAGE COMPONENT
// ---------------------------------------------------------------------------

export default function TransactionsPage() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  // ── Data
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // ── Filters
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState<TransactionType | ''>('');
  const [filterPayment, setFilterPayment] = useState<PaymentMethod | ''>('');

  // ── Table UI
  const [expanded, setExpanded]         = useState<string | null>(null);

  // ── Refund
  const [refundingId, setRefundingId]       = useState<string | null>(null);
  const [refundError, setRefundError]       = useState<string | null>(null);
  const [pendingRefundId, setPendingRefundId] = useState<string | null>(null);

  const canAccess = !isLoading && user !== null &&
    POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  useEffect(() => {
    if (!isLoading && !canAccess) router.replace('/dashboard');
  }, [canAccess, isLoading, router]);

  const loadTransactions = useCallback(async () => {
    if (!user) return;
    setIsBootLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; transactions: TransactionRow[] }>(
        '/api/transactions',
      );
      setTransactions(res.data?.transactions ?? []);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les transactions.'));
    } finally {
      setIsBootLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!canAccess || !user) return;
    void loadTransactions();
  }, [canAccess, user, loadTransactions]);

  // ── Client-side filtering
  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (filterType && tx.type !== filterType) return false;
      if (filterPayment && tx.payment_method !== filterPayment) return false;
      if (q) {
        const dateStr = new Date(tx.created_at).toLocaleString('fr-FR').toLowerCase();
        const amount  = formatPrice(tx.total_amount).toLowerCase();
        const items   = tx.items.map((i) => i.product.name.toLowerCase()).join(' ');
        const user_   = tx.user.username.toLowerCase();
        if (!dateStr.includes(q) && !amount.includes(q) && !items.includes(q) && !user_.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, search, filterType, filterPayment]);

  const hasActiveFilters = search.trim() !== '' || filterType !== '' || filterPayment !== '';

  function clearFilters(): void {
    setSearch('');
    setFilterType('');
    setFilterPayment('');
  }

  // ── Refund handlers
  function requestRefund(transactionId: string): void {
    setRefundError(null);
    setPendingRefundId(transactionId);
  }

  async function confirmRefund(): Promise<void> {
    if (!pendingRefundId) return;
    const id = pendingRefundId;
    setPendingRefundId(null);
    setRefundingId(id);
    try {
      await apiClient.post(`/api/transactions/${id}/refund`);
      await loadTransactions();
    } catch (err) {
      setRefundError(extractApiError(err, 'Échec du remboursement.'));
    } finally {
      setRefundingId(null);
    }
  }

  function cancelRefund(): void {
    setPendingRefundId(null);
  }

  function toggleExpanded(id: string): void {
    setExpanded((prev) => (prev === id ? null : id));
  }


  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  if (isLoading || !canAccess) {
    return (
      <div className="space-y-2">
        <div className="h-7 w-56 bg-borderLight rounded animate-pulse" />
        <div className="h-24 bg-surface border border-borderLight rounded animate-pulse" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-textMain">Historique des transactions</h1>
        <p className="text-sm text-textMuted mt-1">
          Magasin&nbsp;: <span className="font-medium text-textMain">{user?.storeName}</span>
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {refundError && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {refundError}
        </div>
      )}

      {/* ── Filter card ──────────────────────────────────────────────────── */}
      <div className="bg-surface border border-borderLight p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Free-text search */}
          <input
            type="search"
            placeholder="Rechercher (date, montant, produit, caissier…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} flex-1 min-w-48`}
            aria-label="Rechercher dans les transactions"
          />

          {/* Type filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as TransactionType | '')}
            className={`${inputCls} shrink-0`}
            aria-label="Filtrer par type"
          >
            <option value="">Tous les types</option>
            {(Object.keys(TYPE_LABELS) as TransactionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>

          {/* Payment method filter */}
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value as PaymentMethod | '')}
            className={`${inputCls} shrink-0`}
            aria-label="Filtrer par mode de règlement"
          >
            <option value="">Tous les modes</option>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => (
              <option key={p} value={p}>{PAYMENT_LABELS[p]}</option>
            ))}
          </select>

          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="shrink-0 px-3 py-2 text-xs border border-borderLight rounded text-textMuted hover:text-red-600 hover:border-red-300 transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {/* Result count */}
        {!isBootLoading && (
          <p className="text-xs text-textMuted">
            {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
            {hasActiveFilters && ` sur ${transactions.length}`}
          </p>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-borderLight overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLight flex items-center justify-between">
          <h2 className="text-base font-medium text-textMain">Transactions</h2>
          <Button type="button" variant="secondary" size="sm" onClick={loadTransactions}>
            Actualiser
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-background text-textMuted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Mode de règlement</th>
                <th className="text-right px-4 py-2 font-medium">Montant</th>
                <th className="text-center px-4 py-2 font-medium">Articles</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isBootLoading ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={6}>Chargement…</td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-textMuted text-center" colSpan={6}>
                    {hasActiveFilters ? 'Aucune transaction ne correspond aux filtres.' : 'Aucune transaction pour ce magasin.'}
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isExpanded   = expanded === tx.id;
                  const isRefundable = tx.type === 'SALE';
                  const hasRefund    = transactions.some((t) => t.refund_of_id === tx.id);
                  return (
                    <React.Fragment key={tx.id}>
                      <tr className="border-t border-borderLight hover:bg-background/50">
                        <td className="px-4 py-3 text-textMain whitespace-nowrap">
                          {new Date(tx.created_at).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${TYPE_COLORS[tx.type]}`}>
                            {TYPE_LABELS[tx.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-textMain">
                          {PAYMENT_LABELS[tx.payment_method]}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-textMain">
                          {formatPrice(tx.total_amount)} F
                        </td>
                        <td className="px-4 py-3 text-center text-textMain">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(tx.id)}
                            aria-expanded={isExpanded}
                            aria-label="Voir les articles de la transaction"
                            className="underline underline-offset-2 text-primary hover:opacity-75"
                          >
                            {tx.items.length}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isRefundable && !hasRefund && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              isLoading={refundingId === tx.id}
                              disabled={refundingId !== null}
                              onClick={() => requestRefund(tx.id)}
                            >
                              Rembourser
                            </Button>
                          )}
                          {hasRefund && (
                            <span className="text-xs text-textMuted italic">Remboursé</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-t border-borderLight bg-background">
                          <td colSpan={6} className="px-6 py-3">
                            <table className="w-full text-xs text-textMuted">
                              <thead>
                                <tr>
                                  <th className="text-left font-medium pb-1">Produit</th>
                                  <th className="text-right font-medium pb-1">Qté</th>
                                  <th className="text-right font-medium pb-1">Prix unit.</th>
                                  <th className="text-right font-medium pb-1">Sous-total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tx.items.map((item) => (
                                  <tr key={item.id} className="border-t border-borderLight">
                                    <td className="py-1 text-textMain">{item.product.name}</td>
                                    <td className="py-1 text-right">{item.qty}</td>
                                    <td className="py-1 text-right">{formatPrice(item.price_at_sale)} F</td>
                                    <td className="py-1 text-right font-medium text-textMain">
                                      {formatPrice(Number(item.price_at_sale) * item.qty)} F
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Refund confirmation modal */}
      {(() => {
        const tx = transactions.find((t) => t.id === pendingRefundId);
        return (
          <Modal
            isOpen={pendingRefundId !== null}
            title="Confirmer le remboursement"
            message={
              tx
                ? `Rembourser la vente du ${new Date(tx.created_at).toLocaleString('fr-FR')} — ${formatPrice(tx.total_amount)} F ? Cette action recrédite le stock et ne peut pas être annulée.`
                : 'Confirmer le remboursement ?'
            }
            confirmLabel="Rembourser"
            confirmVariant="danger"
            cancelLabel="Annuler"
            onConfirm={confirmRefund}
            onCancel={cancelRefund}
            isConfirming={refundingId !== null}
          />
        );
      })()}
    </section>
  );
}
