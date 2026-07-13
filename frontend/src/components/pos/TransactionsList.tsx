'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
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
  id: string;
  original_transaction_item_id: string | null;
  product_id: string;
  qty: number;
  price_at_sale: string;
  packages_count: number | null;
  packaging_format: { id: string; label: string; units_per_package: number } | null;
  product: { id: string; name: string; sku: string; unit: string };
};

type TransactionRow = {
  id: string;
  type: TransactionType;
  payment_method: PaymentMethod;
  total_amount: string;
  created_at: string;
  refund_of_id: string | null;
  client: { id: string; name: string; phone: string | null; email: string | null } | null;
  store: { id: string; name: string };
  user: { id: string; username: string };
  items: TransactionItem[];
};

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<TransactionType, string> = {
  SALE: 'Vente',
  REFUND: 'Remboursement',
  EXPENSE: 'Dépense',
};

const TYPE_COLORS: Record<TransactionType, string> = {
  SALE: 'text-green-700 bg-green-50 border-green-200',
  REFUND: 'text-orange-700 bg-orange-50 border-orange-200',
  EXPENSE: 'text-red-700 bg-red-50 border-red-200',
};

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

const TRANSACTION_PAGE_SIZE = 10;

function getRefundedQtys(
  transactions: TransactionRow[],
  saleId: string,
): Map<string, { qty: number; packages_count: number }> {
  const refunded = new Map<string, { qty: number; packages_count: number }>();
  for (const row of transactions) {
    if (row.refund_of_id !== saleId) continue;
    for (const item of row.items) {
      if (!item.original_transaction_item_id) continue;
      const prev = refunded.get(item.original_transaction_item_id) ?? { qty: 0, packages_count: 0 };
      refunded.set(item.original_transaction_item_id, {
        qty: prev.qty + item.qty,
        packages_count: prev.packages_count + (item.packages_count ?? 0),
      });
    }
  }
  return refunded;
}

function isFullyRefunded(
  item: TransactionItem,
  refunded: Map<string, { qty: number; packages_count: number }>,
): boolean {
  const r = refunded.get(item.id);
  if (!r) return false;
  if (item.packaging_format) return (r.packages_count) >= (item.packages_count ?? 0);
  return r.qty >= item.qty;
}

function getRemainingQtys(
  item: TransactionItem,
  refunded: Map<string, { qty: number; packages_count: number }>,
): { qty: number; packages_count: number } {
  const r = refunded.get(item.id);
  if (item.packaging_format) {
    return {
      qty: 0,
      packages_count: Math.max((item.packages_count ?? 0) - (r?.packages_count ?? 0), 0),
    };
  }
  return {
    qty: Math.max(item.qty - (r?.qty ?? 0), 0),
    packages_count: 0,
  };
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------

export default function TransactionsList(): React.JSX.Element {
  const { user, isLoading } = useSession();

  // ── Data
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<TransactionType | ''>('');
  const [filterPayment, setFilterPayment] = useState<PaymentMethod | ''>('');

  // ── Table UI
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotalPages, setTransactionTotalPages] = useState(1);

  // ── Refund
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [pendingRefundId, setPendingRefundId] = useState<string | null>(null);
  const [refundItemQtys, setRefundItemQtys] = useState<Array<{ transaction_item_id: string; qty: number; packages_count: number }>>([]);

  const canAccess = !isLoading && user !== null &&
    POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  const loadTransactions = useCallback(async (
    page = transactionPage,
    searchQuery = search,
    typeFilter = filterType,
    paymentFilter = filterPayment,
  ): Promise<void> => {
    if (!user) return;
    setIsTransactionsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(TRANSACTION_PAGE_SIZE));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (typeFilter) params.set('type', typeFilter);
      if (paymentFilter) params.set('payment_method', paymentFilter);
      const res = await apiClient.get<{ success: boolean; transactions: TransactionRow[]; total: number; page: number; totalPages: number }>(
        `/api/transactions?${params.toString()}`,
      );
      setTransactions(res.data?.transactions ?? []);
      setTransactionPage(res.data?.page ?? page);
      setTransactionTotalPages(res.data?.totalPages ?? 1);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les transactions.'));
    } finally {
      setIsTransactionsLoading(false);
      setIsBootLoading(false);
    }
  }, [user, transactionPage, search, filterType, filterPayment]);

  useEffect(() => {
    if (!canAccess || !user) return;
    const timer = setTimeout(() => {
      void loadTransactions();
    }, 0);
    return () => clearTimeout(timer);
  }, [canAccess, user, loadTransactions]);

  const hasActiveFilters = search.trim() !== '' || filterType !== '' || filterPayment !== '';

  function clearFilters(): void {
    setSearch('');
    setFilterType('');
    setFilterPayment('');
    setTransactionPage(1);
  }

  // ── Refund handlers
  function requestRefund(transactionId: string): void {
    setRefundError(null);
    const transaction = transactions.find((row) => row.id === transactionId);
    const refundedQtys = getRefundedQtys(transactions, transactionId);
    setPendingRefundId(transactionId);
    setRefundItemQtys(
      transaction?.items
        .filter((item) => !isFullyRefunded(item, refundedQtys))
        .map((item) => ({
          transaction_item_id: item.id,
          ...getRemainingQtys(item, refundedQtys),
        })) ?? [],
    );
  }

  async function confirmRefund(): Promise<void> {
    if (!pendingRefundId) return;
    const id = pendingRefundId;
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    setPendingRefundId(null);
    setRefundingId(id);
    try {
      const items = refundItemQtys
        .filter((refundItem) => {
          const origItem = tx.items.find((i) => i.id === refundItem.transaction_item_id);
          return origItem?.packaging_format ? refundItem.packages_count > 0 : refundItem.qty > 0;
        })
        .map((refundItem) => {
          const origItem = tx.items.find((i) => i.id === refundItem.transaction_item_id);
          if (origItem?.packaging_format) {
            return { transaction_item_id: refundItem.transaction_item_id, packages_count: refundItem.packages_count };
          }
          return { transaction_item_id: refundItem.transaction_item_id, qty: refundItem.qty };
        });
      await apiClient.post(`/api/transactions/${id}/refund`, { items });
      await loadTransactions();
    } catch (err) {
      setRefundError(extractApiError(err, 'Échec du remboursement.'));
    } finally {
      setRefundingId(null);
      setRefundItemQtys([]);
    }
  }

  function cancelRefund(): void {
    setPendingRefundId(null);
    setRefundItemQtys([]);
  }

  function updateRefundItemQty(itemId: string, field: 'qty' | 'packages_count', value: number): void {
    setRefundItemQtys((current) => current.map((refundItem) =>
      refundItem.transaction_item_id === itemId ? { ...refundItem, [field]: value } : refundItem,
    ));
  }

  function removeRefundItem(itemId: string): void {
    setRefundItemQtys((current) => current.filter((r) => r.transaction_item_id !== itemId));
  }

  function toggleExpanded(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (isLoading || !canAccess) {
    return (
      <div className="space-y-2">
        <div className="h-7 w-56 bg-borderLight rounded animate-pulse" />
        <div className="h-24 bg-surface border border-borderLight rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <header>
        <h2 className="text-lg font-semibold text-textMain">Historique des transactions</h2>
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
          <input
            type="search"
            placeholder="Rechercher (date, montant, produit, caissier…)"
            value={search}
            onChange={(e) => {
              const value = e.target.value;
              setSearch(value);
              void loadTransactions(1, value, filterType, filterPayment);
            }}
            className={`${inputCls} flex-1 min-w-48`}
            aria-label="Rechercher dans les transactions"
          />

          <select
            value={filterType}
            onChange={(e) => {
              const value = e.target.value as TransactionType | '';
              setFilterType(value);
              void loadTransactions(1, search, value, filterPayment);
            }}
            className={`${inputCls} shrink-0`}
            aria-label="Filtrer par type"
          >
            <option value="">Tous les types</option>
            {(Object.keys(TYPE_LABELS) as TransactionType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>

          <select
            value={filterPayment}
            onChange={(e) => {
              const value = e.target.value as PaymentMethod | '';
              setFilterPayment(value);
              void loadTransactions(1, search, filterType, value);
            }}
            className={`${inputCls} shrink-0`}
            aria-label="Filtrer par mode de règlement"
          >
            <option value="">Tous les modes</option>
            {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => (
              <option key={p} value={p}>{PAYMENT_LABELS[p]}</option>
            ))}
          </select>

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
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-surface border border-borderLight overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLight flex items-center justify-between">
          <h3 className="text-base font-medium text-textMain">Transactions</h3>
          <Button type="button" variant="secondary" size="sm" onClick={() => loadTransactions()}>
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
                <th className="text-left px-4 py-2 font-medium">Client</th>
                <th className="text-center px-4 py-2 font-medium">Articles</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isBootLoading || isTransactionsLoading ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={7}>Chargement…</td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-textMuted text-center" colSpan={7}>
                    {hasActiveFilters ? 'Aucune transaction ne correspond aux filtres.' : 'Aucune transaction pour ce magasin.'}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isExpanded = expanded.has(tx.id);
                  const isRefundable = tx.type === 'SALE';
                  const refundedQtys = getRefundedQtys(transactions, tx.id);
                  const hasRemainingRefundable = tx.items.some((item) => !isFullyRefunded(item, refundedQtys));
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
                        <td className="px-4 py-3 text-textMain">
                          {tx.client ? (
                            <div>
                              <p className="text-sm font-medium">{tx.client.name}</p>
                              <p className="text-xs text-textMuted">
                                {[tx.client.phone, tx.client.email].filter(Boolean).join(' · ') || 'Contact indisponible'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-textMuted">Passage anonyme</span>
                          )}
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
                          {isRefundable && hasRemainingRefundable && (
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
                          {isRefundable && !hasRemainingRefundable && (
                            <span className="text-xs text-textMuted italic">Remboursé</span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-t border-borderLight bg-background">
                          <td colSpan={7} className="px-6 py-3">
                            <table className="w-full text-xs text-textMuted">
                              <thead>
                                <tr>
                                  <th className="text-left font-medium pb-1">Produit</th>
                                  <th className="text-left font-medium pb-1">Format</th>
                                  <th className="text-right font-medium pb-1">Qté</th>
                                  <th className="text-right font-medium pb-1">Prix unit.</th>
                                  <th className="text-right font-medium pb-1">Sous-total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {tx.items.map((item) => (
                                  <tr key={item.id} className="border-t border-borderLight">
                                    <td className="py-1 text-textMain">{item.product.name}</td>
                                    <td className="py-1">
                                      {item.packaging_format
                                        ? `${item.packaging_format.label} (${item.packaging_format.units_per_package})`
                                        : 'Unité'}
                                    </td>
                                    <td className="py-1 text-right">
                                      {item.packaging_format ? (item.packages_count ?? 0) : item.qty}
                                    </td>
                                    <td className="py-1 text-right">
                                      {item.packaging_format
                                        ? `${formatPrice(Number(item.price_at_sale) * item.packaging_format.units_per_package)} F`
                                        : `${formatPrice(item.price_at_sale)} F`}
                                    </td>
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

        {transactionTotalPages > 1 && (
          <div className="px-4 py-3 border-t border-borderLight flex items-center justify-between">
            <p className="text-xs text-textMuted">
              Page {transactionPage} / {transactionTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, transactionPage - 1);
                  setTransactionPage(next);
                  void loadTransactions(next);
                }}
                disabled={transactionPage === 1}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(transactionTotalPages, transactionPage + 1);
                  setTransactionPage(next);
                  void loadTransactions(next);
                }}
                disabled={transactionPage === transactionTotalPages}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>

      {(() => {
        const tx = transactions.find((item) => item.id === pendingRefundId);
        if (!tx) return null;
        const refundedQtys = getRefundedQtys(transactions, tx.id);

        const selectedTotal = tx.items.reduce((sum, item) => {
          const refundItem = refundItemQtys.find((r) => r.transaction_item_id === item.id);
          if (!refundItem || (refundItem.qty <= 0 && refundItem.packages_count <= 0)) return sum;
          const ratio = item.packaging_format
            ? refundItem.packages_count / (item.packages_count ?? 1)
            : refundItem.qty / item.qty;
          return sum + Number(item.price_at_sale) * item.qty * ratio;
        }, 0);

        const hasSelection = refundItemQtys.some((refundItem) => refundItem.qty > 0 || refundItem.packages_count > 0);

        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/40" onClick={cancelRefund} aria-hidden="true" />
            <div className="relative z-10 w-full max-w-2xl rounded bg-surface border border-borderLight p-6 shadow-lg">
              <h2 className="text-base font-medium text-textMain">Remboursement partiel</h2>
              <p className="mt-2 text-sm text-textMuted">
                Ajustez les quantités à rembourser pour la vente du {new Date(tx.created_at).toLocaleString('fr-FR')}. Cliquez sur <strong>×</strong> pour exclure un produit.
              </p>

              <div className="mt-4 space-y-2 max-h-[320px] overflow-y-auto">
                {tx.items.map((item) => {
                  const alreadyRefunded = isFullyRefunded(item, refundedQtys);
                  const remaining = getRemainingQtys(item, refundedQtys);
                  const refundItem = refundItemQtys.find((r) => r.transaction_item_id === item.id);
                  if (!refundItem) return null;
                  return (
                    <div key={item.id} className={`rounded border border-borderLight bg-background px-4 py-3 ${alreadyRefunded ? 'opacity-50' : ''}`}>
                      {!alreadyRefunded && (
                        <div className="flex justify-end -mt-1 -mr-2 mb-1">
                          <button
                            type="button"
                            onClick={() => removeRefundItem(item.id)}
                            className="text-textMuted hover:text-red-600 transition-colors text-sm leading-none px-1"
                            aria-label="Ne pas rembourser ce produit"
                            title="Ne pas rembourser"
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-textMain">{item.product.name}</p>
                          <p className="mt-1 text-xs text-textMuted">
                            {item.packaging_format
                              ? `${item.packaging_format.label} · max ${remaining.packages_count} colis`
                              : `${remaining.qty} unités`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.packaging_format ? (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-textMuted">Colis</label>
                              <input
                                type="number"
                                min={0}
                                max={remaining.packages_count}
                                value={refundItem.packages_count}
                                disabled={alreadyRefunded}
                                onChange={(e) => {
                                  const v = Math.min(Math.max(0, Number(e.target.value) || 0), remaining.packages_count);
                                  updateRefundItemQty(item.id, 'packages_count', v);
                                }}
                                className="w-20 px-2 py-1 text-sm bg-background border border-borderLight rounded text-textMain text-right focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <label className="text-xs text-textMuted">Qté</label>
                              <input
                                type="number"
                                min={0}
                                max={remaining.qty}
                                value={refundItem.qty}
                                disabled={alreadyRefunded}
                                onChange={(e) => {
                                  const v = Math.min(Math.max(0, Number(e.target.value) || 0), remaining.qty);
                                  updateRefundItemQty(item.id, 'qty', v);
                                }}
                                className="w-20 px-2 py-1 text-sm bg-background border border-borderLight rounded text-textMain text-right focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      {!alreadyRefunded && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-borderLight">
                          <span className="text-xs text-textMuted">
                            {item.packaging_format
                              ? `${refundItem.packages_count} × ${item.packaging_format.label} = ${refundItem.packages_count * (item.packaging_format.units_per_package)} unités`
                              : `${refundItem.qty} unités`}
                          </span>
                          <span className="text-xs font-medium text-textMain">
                            {formatPrice(
                              item.packaging_format
                                ? Number(item.price_at_sale) * item.packaging_format.units_per_package * refundItem.packages_count
                                : Number(item.price_at_sale) * refundItem.qty,
                            )} F
                          </span>
                        </div>
                      )}
                      {alreadyRefunded ? (
                        <p className="mt-1 text-xs text-textMuted italic">Déjà entièrement remboursé</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-textMuted">Montant remboursé</p>
                  <p className="text-lg font-semibold text-textMain">{formatPrice(selectedTotal)} F</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" size="md" onClick={cancelRefund} disabled={refundingId !== null}>
                    Annuler
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    onClick={confirmRefund}
                    isLoading={refundingId !== null}
                    disabled={!hasSelection}
                  >
                    Rembourser
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
