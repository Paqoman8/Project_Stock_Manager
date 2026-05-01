// src/app/dashboard/receptions/page.tsx
// Page de gestion des réceptions de stock.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Accessible à tous les rôles (SA, Admin, Manager Magasin, Opérateur)
//   - Charge en parallèle les commandes SENT et PARTIALLY_RECEIVED
//   - Quatre modales : CreateReception, OrderReceptions, ConfirmReception, CancelReception
//
// Flux d'interaction :
//   1. Tout rôle → "Réceptionner" ouvre CreateReceptionModal
//   2. La réception créée est PENDING (pas de mise à jour stock immédiate)
//   3. "Historique" ouvre OrderReceptionsModal → affiche les réceptions enregistrées
//   4. Confirmer (SA + Admin) → PATCH /api/receptions/:id/confirm → stock mis à jour
//   5. Annuler (SA only) → PATCH /api/receptions/:id/cancel

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLE_SA    = 'Super Administrateur';
const ROLE_ADMIN = 'Administrateur';
const ROLES_ALLOWED = ['Super Administrateur', 'Administrateur', 'Manager Magasin', 'Opérateur'];

// ---------------------------------------------------------------------------
// Types (contrat backend exact)
// ---------------------------------------------------------------------------

type ReceptionStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';
type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

interface ReceptionItemRow {
  id: string;
  reception_id: string;
  product_id: string;
  received_qty: number;
  stock_units_added: number;
  product: { id: string; name: string; sku: string; unit: string };
}

interface StockReceptionRow {
  id: string;
  order_id: string;
  received_by_id: string;
  status: ReceptionStatus;
  notes: string | null;
  received_at: string;
  confirmed_at: string | null;
  order: { id: string; reference: string; destination_store_id: string };
  received_by: { id: string; username: string };
  items: ReceptionItemRow[];
}

interface PurchaseOrderItemRow {
  id: string;
  order_id: string;
  supplier_product_id: string;
  ordered_qty: number;
  unit_price: string;
  supplier_product: {
    id: string;
    order_unit: string;
    units_per_order: number;
    product: { id: string; name: string; sku: string; unit: string };
  };
}

interface PurchaseOrderRow {
  id: string;
  reference: string;
  supplier_id: string;
  destination_store_id: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  expected_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  supplier: { id: string; name: string };
  destination_store: { id: string; name: string };
  ordered_by: { id: string; username: string };
  items: PurchaseOrderItemRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message ?? fallback;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Helpers visuels
// ---------------------------------------------------------------------------

function OrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const cls: Record<PurchaseOrderStatus, string> = {
    DRAFT: 'bg-[#F1F3F5] text-textMuted border-borderLight',
    SENT: 'bg-blue-50 text-blue-700 border-blue-200',
    PARTIALLY_RECEIVED: 'bg-orange-50 text-orange-700 border-orange-200',
    RECEIVED: 'bg-green-50 text-green-700 border-green-200',
    CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<PurchaseOrderStatus, string> = {
    DRAFT: 'Brouillon',
    SENT: 'Envoyé',
    PARTIALLY_RECEIVED: 'Partiellement reçu',
    RECEIVED: 'Reçu',
    CANCELLED: 'Annulé',
  };
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        cls[status],
      ].join(' ')}
    >
      {labels[status]}
    </span>
  );
}

function ReceptionStatusBadge({ status }: { status: ReceptionStatus }) {
  const cls: Record<ReceptionStatus, string> = {
    PENDING: 'bg-[#F1F3F5] text-textMuted border-borderLight',
    CONFIRMED: 'bg-green-50 text-green-700 border-green-200',
    CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<ReceptionStatus, string> = {
    PENDING: 'En attente',
    CONFIRMED: 'Confirmée',
    CANCELLED: 'Annulée',
  };
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        cls[status],
      ].join(' ')}
    >
      {labels[status]}
    </span>
  );
}

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} aria-hidden="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 bg-borderLight rounded animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modale 1 : Création d'une réception
// ---------------------------------------------------------------------------

function CreateReceptionModal({
  order,
  onClose,
  onSuccess,
}: {
  order: PurchaseOrderRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // Map de product_id → quantité reçue (en unités de commande)
  const [receivedQtys, setReceivedQtys] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Initialiser la Map quand la commande change
  useEffect(() => {
    if (!order) return;
    const initial = new Map<string, number>();
    for (const oi of order.items) {
      initial.set(oi.supplier_product.product.id, 0);
    }
    setReceivedQtys(initial);
    setNotes('');
    setApiError(null);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [order]);

  // Fermeture par Escape
  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  function handleQtyChange(productId: string, raw: string) {
    const parsed = parseInt(raw, 10);
    const value = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setReceivedQtys((prev) => new Map(prev).set(productId, value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    // Validation : au moins un article avec qty > 0
    const items: { product_id: string; received_qty: number }[] = [];
    for (const oi of order.items) {
      const productId = oi.supplier_product.product.id;
      const qty = receivedQtys.get(productId) ?? 0;
      if (qty < 0 || !Number.isInteger(qty)) {
        setApiError('Les quantités doivent être des entiers positifs ou nuls.');
        return;
      }
      if (qty > 0) {
        items.push({ product_id: productId, received_qty: qty });
      }
    }

    if (items.length === 0) {
      setApiError('Veuillez saisir au moins une quantité reçue supérieure à 0.');
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      await apiClient.post('/api/receptions', {
        order_id: order.id,
        notes: notes.trim() || undefined,
        items,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la création de la réception.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-reception-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="create-reception-title" className="text-base font-medium text-textMain">
            Enregistrer une réception
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto flex-1">

            {/* Informations commande (lecture seule) */}
            <div className="flex flex-col gap-3 p-4 bg-background border border-borderLight rounded">
              <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wide">
                Commande
              </h3>
              <dl className="grid grid-cols-3 gap-x-6 gap-y-2">
                <div>
                  <dt className="text-xs text-textMuted mb-0.5">Référence</dt>
                  <dd className="text-sm font-mono font-medium text-textMain">{order.reference}</dd>
                </div>
                <div>
                  <dt className="text-xs text-textMuted mb-0.5">Fournisseur</dt>
                  <dd className="text-sm font-medium text-textMain">{order.supplier.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-textMuted mb-0.5">Destination</dt>
                  <dd className="text-sm font-medium text-textMain">{order.destination_store.name}</dd>
                </div>
              </dl>
            </div>

            {/* Message informatif PENDING */}
            <div
              role="note"
              className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                La réception sera enregistrée en attente de confirmation. La confirmation mettra à jour le stock du magasin.
              </span>
            </div>

            {/* Saisie des quantités par article */}
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold text-textMuted uppercase tracking-wide">
                Quantités reçues
              </h3>

              {order.items.length === 0 ? (
                <p className="text-sm text-textMuted">Aucun article dans cette commande.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {order.items.map((oi, index) => {
                    const product = oi.supplier_product.product;
                    const productId = product.id;
                    const qty = receivedQtys.get(productId) ?? 0;
                    const totalUnits = oi.ordered_qty * oi.supplier_product.units_per_order;

                    return (
                      <div
                        key={oi.id}
                        className="border border-borderLight rounded p-3 flex flex-col gap-2 bg-background"
                      >
                        {/* Nom + SKU */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-medium text-textMain">{product.name}</span>
                          <span className="text-xs text-textMuted font-mono">{product.sku}</span>
                        </div>

                        {/* Infos commande */}
                        <div className="flex items-center gap-4 text-xs text-textMuted">
                          <span>
                            Commandé&nbsp;: {oi.ordered_qty} {oi.supplier_product.order_unit}
                          </span>
                          <span>
                            Soit {totalUnits} {product.unit}
                          </span>
                        </div>

                        {/* Input quantité reçue */}
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor={`reception-qty-${productId}`}
                            className="text-xs font-medium text-textSecondary whitespace-nowrap"
                          >
                            Quantité reçue ({oi.supplier_product.order_unit})
                          </label>
                          <input
                            ref={index === 0 ? firstInputRef : undefined}
                            id={`reception-qty-${productId}`}
                            type="number"
                            step={1}
                            min={0}
                            value={qty === 0 ? '' : qty}
                            placeholder="0"
                            onChange={(e) => handleQtyChange(productId, e.target.value)}
                            className={inputCls + ' max-w-[120px]'}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1">
              <label htmlFor="reception-notes" className="text-xs font-medium text-textSecondary">
                Notes (optionnel)
              </label>
              <textarea
                id="reception-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observations, anomalies constatées…"
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* Erreur */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          {/* Pied */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              Enregistrer la réception
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 2 : Historique des réceptions d'une commande
// ---------------------------------------------------------------------------

function OrderReceptionsModal({
  order,
  isSA,
  isAdmin,
  onClose,
  onConfirm,
  onCancel,
}: {
  order: PurchaseOrderRow | null;
  isSA: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onConfirm: (r: StockReceptionRow) => void;
  onCancel: (r: StockReceptionRow) => void;
}) {
  const [receptions, setReceptions] = useState<StockReceptionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;
    setFetchError(null);

    let cancelled = false;
    setIsLoading(true);
    apiClient
      .get<{ success: boolean; receptions: StockReceptionRow[] }>(
        `/api/receptions/by-order/${order.id}`
      )
      .then((res) => {
        if (!cancelled) {
          // Trier par date décroissante (plus récent en premier)
          const sorted = [...(res.data.receptions ?? [])].sort(
            (a, b) =>
              new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
          );
          setReceptions(sorted);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(extractApiError(err, 'Impossible de charger les réceptions.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [order]);

  // Fermeture par Escape
  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  if (!order) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receptions-history-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 id="receptions-history-title" className="text-base font-medium text-textMain">
              Réceptions — {order.reference}
            </h2>
            <OrderStatusBadge status={order.status} />
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-24 bg-borderLight rounded animate-pulse"
                  aria-hidden="true"
                />
              ))}
            </div>
          ) : fetchError ? (
            <p role="alert" className="text-sm text-danger">{fetchError}</p>
          ) : receptions.length === 0 ? (
            <p className="text-sm text-textMuted py-4 text-center">
              Aucune réception enregistrée pour cette commande.
            </p>
          ) : (
            <ul className="flex flex-col gap-4" aria-label="Liste des réceptions">
              {receptions.map((reception) => (
                <li
                  key={reception.id}
                  className="border border-borderLight rounded p-4 flex flex-col gap-3 bg-background"
                >
                  {/* En-tête de la réception */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <ReceptionStatusBadge status={reception.status} />
                      <span className="text-xs text-textMuted">
                        {formatDateTime(reception.received_at)}
                      </span>
                      <span className="text-xs text-textMuted">
                        · par <strong className="text-textMain">{reception.received_by.username}</strong>
                      </span>
                    </div>

                    {/* Actions (uniquement PENDING) */}
                    {reception.status === 'PENDING' && (isAdmin || isSA) && (
                      <div className="flex items-center gap-2">
                        {/* SA et Admin peuvent confirmer */}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => onConfirm(reception)}
                          aria-label="Confirmer cette réception"
                        >
                          Confirmer
                        </Button>
                        {/* SA peut aussi annuler */}
                        {isSA && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => onCancel(reception)}
                            aria-label="Annuler cette réception"
                          >
                            Annuler
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Articles reçus */}
                  <div className="flex flex-col gap-1">
                    <h4 className="text-xs font-semibold text-textMuted uppercase tracking-wide">
                      Articles
                    </h4>
                    <ul className="flex flex-col gap-1">
                      {reception.items.map((item) => (
                        <li key={item.id} className="text-xs text-textMuted">
                          <span className="font-medium text-textMain">{item.product.name}</span>
                          {' — '}
                          {item.received_qty} reçu(s)
                          {' → '}
                          <span className="text-green-700 font-medium">
                            {item.stock_units_added} unité(s) ajoutée(s) au stock
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Notes */}
                  {reception.notes && (
                    <p className="text-xs text-textMuted italic">
                      Notes : {reception.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-end flex-shrink-0">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 3 : Confirmation d'une réception (met à jour le stock)
// ---------------------------------------------------------------------------

function ConfirmReceptionModal({
  reception,
  onClose,
  onSuccess,
}: {
  reception: StockReceptionRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reception) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [reception]);

  useEffect(() => {
    if (!reception) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [reception, onClose]);

  async function handleConfirm() {
    if (!reception) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/receptions/${reception.id}/confirm`);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la confirmation.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reception) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-reception-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="confirm-reception-title" className="text-base font-medium text-textMain">
            Confirmer la réception
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 flex flex-col gap-3">
          <p className="text-sm text-textMuted">
            Les quantités suivantes seront ajoutées au stock de l&apos;établissement de destination :
          </p>

          {/* Récapitulatif des articles */}
          <ul className="flex flex-col gap-1 pl-1">
            {reception.items.map((item) => (
              <li key={item.id} className="text-sm text-textMain">
                <span className="font-medium">{item.received_qty}</span>{' '}
                unité(s) de{' '}
                <span className="font-medium">{item.product.name}</span>{' '}
                <span className="text-textMuted text-xs">
                  ({item.product.unit})
                </span>{' '}
                seront ajoutées
              </li>
            ))}
          </ul>

          {/* Avertissement irréversible */}
          <p className="text-xs text-danger font-medium">
            Cette action est irréversible.
          </p>

          {apiError && (
            <p role="alert" className="text-sm text-danger">{apiError}</p>
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Annuler
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            onClick={handleConfirm}
          >
            Confirmer et mettre à jour le stock
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale 4 : Annulation d'une réception (SA uniquement)
// ---------------------------------------------------------------------------

function CancelReceptionModal({
  reception,
  onClose,
  onSuccess,
}: {
  reception: StockReceptionRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!reception) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [reception]);

  useEffect(() => {
    if (!reception) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [reception, onClose]);

  async function handleConfirm() {
    if (!reception) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/receptions/${reception.id}/cancel`);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de l\'annulation.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!reception) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-reception-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="cancel-reception-title" className="text-base font-medium text-textMain">
            Annuler la réception
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 flex flex-col gap-2">
          <p className="text-sm text-textMuted">
            Voulez-vous annuler cette réception enregistrée le{' '}
            <strong className="text-textMain">{formatDateTime(reception.received_at)}</strong> ?
          </p>
          <p className="text-xs text-danger font-medium">
            Cette action est irréversible.
          </p>
          {apiError && (
            <p role="alert" className="mt-1 text-sm text-danger">{apiError}</p>
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Retour
          </Button>
          <Button
            ref={confirmBtnRef}
            type="button"
            variant="danger"
            size="sm"
            isLoading={isSubmitting}
            onClick={handleConfirm}
          >
            Confirmer l&apos;annulation
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function ReceptionsPage() {
  const router = useRouter();
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  const isSA    = sessionUser?.roleName === ROLE_SA;
  const isAdmin = sessionUser?.roleName === ROLE_ADMIN;

  // Données
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // État des modales
  const [orderToReceive, setOrderToReceive] = useState<PurchaseOrderRow | null>(null);
  const [orderToView, setOrderToView] = useState<PurchaseOrderRow | null>(null);
  const [receptionToConfirm, setReceptionToConfirm] = useState<StockReceptionRow | null>(null);
  const [receptionToCancel, setReceptionToCancel] = useState<StockReceptionRow | null>(null);

  // ---------------------------------------------------------------------------
  // Contrôle d'accès : redirection si rôle non autorisé
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // ---------------------------------------------------------------------------
  // Chargement des commandes en attente de réception
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [sentRes, partialRes] = await Promise.all([
        apiClient.get<{ success: boolean; orders: PurchaseOrderRow[] }>(
          '/api/purchase-orders?status=SENT'
        ),
        apiClient.get<{ success: boolean; orders: PurchaseOrderRow[] }>(
          '/api/purchase-orders?status=PARTIALLY_RECEIVED'
        ),
      ]);

      const allOrders = [
        ...(sentRes.data.orders ?? []),
        ...(partialRes.data.orders ?? []),
      ];

      // Trier par date d'envoi décroissante
      allOrders.sort(
        (a, b) =>
          new Date(b.sent_at ?? b.created_at).getTime() -
          new Date(a.sent_at ?? a.created_at).getTime()
      );

      setOrders(allOrders);
    } catch (err) {
      setFetchError(
        extractApiError(err, 'Impossible de charger les commandes en attente de réception.')
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser) return;
    if (!ROLES_ALLOWED.includes(sessionUser.roleName)) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // ---------------------------------------------------------------------------
  // Flux : Historique → Confirmation / Annulation
  // Les modales OrderReceptions et Confirm/Cancel ne sont pas ouvertes en même temps.
  // ---------------------------------------------------------------------------

  function handleConfirmReception(r: StockReceptionRow) {
    setOrderToView(null);
    setReceptionToConfirm(r);
  }

  function handleCancelReception(r: StockReceptionRow) {
    setOrderToView(null);
    setReceptionToCancel(r);
  }

  // ---------------------------------------------------------------------------
  // Garde de rendu — session en cours de chargement
  // ---------------------------------------------------------------------------

  if (sessionLoading || !sessionUser) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody>
              <SkeletonRows cols={6} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Garde rendu — rôle non autorisé (redirection en cours)
  if (!ROLES_ALLOWED.includes(sessionUser.roleName)) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-textMain">Réceptions de stock</h1>
          <p className="text-sm text-textMuted">
            Commandes envoyées et partiellement reçues en attente de réception.
          </p>
        </div>
      </div>

      {/* Erreur de chargement */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* Compteur */}
      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-3">
          {orders.length === 0
            ? 'Aucune commande en attente de réception.'
            : `${orders.length} commande${orders.length > 1 ? 's' : ''} en attente de réception`}
        </p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Commandes en attente de réception"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Référence', 'Fournisseur', 'Destination', 'Statut', "Date d'envoi", 'Actions'].map(
                (col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-textMuted uppercase tracking-wide whitespace-nowrap"
                  >
                    {col}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows cols={6} />
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-sm text-textMuted"
                >
                  Aucune commande en attente de réception.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors last:border-b-0"
                >
                  {/* Référence */}
                  <td className="px-4 py-3 font-mono text-xs font-medium text-textMain whitespace-nowrap">
                    {order.reference}
                  </td>

                  {/* Fournisseur */}
                  <td className="px-4 py-3 text-textMain whitespace-nowrap">
                    {order.supplier.name}
                  </td>

                  {/* Destination */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {order.destination_store.name}
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <OrderStatusBadge status={order.status} />
                  </td>

                  {/* Date d'envoi */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(order.sent_at)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setOrderToReceive(order)}
                        aria-label={`Enregistrer une réception pour la commande ${order.reference}`}
                      >
                        Réceptionner
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setOrderToView(order)}
                        aria-label={`Voir l'historique des réceptions pour la commande ${order.reference}`}
                      >
                        Historique
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      <CreateReceptionModal
        order={orderToReceive}
        onClose={() => setOrderToReceive(null)}
        onSuccess={loadData}
      />

      <OrderReceptionsModal
        order={orderToView}
        isSA={isSA}
        isAdmin={isAdmin}
        onClose={() => setOrderToView(null)}
        onConfirm={handleConfirmReception}
        onCancel={handleCancelReception}
      />

      <ConfirmReceptionModal
        reception={receptionToConfirm}
        onClose={() => setReceptionToConfirm(null)}
        onSuccess={loadData}
      />

      <CancelReceptionModal
        reception={receptionToCancel}
        onClose={() => setReceptionToCancel(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
