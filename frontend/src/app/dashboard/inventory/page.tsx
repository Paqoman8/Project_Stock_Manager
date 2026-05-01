// src/app/dashboard/inventory/page.tsx
// Page de gestion de l'inventaire.
//
// Fonctionnalités :
//   - Tableau : Établissement | Produit | SKU | Stock physique | Disponible |
//               Seuil min | Réappro. | Alerte
//   - Filtre par établissement et par alerte stock bas
//   - Modale d'édition des seuils (SA/Admin)
//   - Modale de mouvement de stock : INITIAL, ADJUSTMENT_IN, ADJUSTMENT_OUT
//     (SA/Admin/Manager)

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLES_ALLOWED = [
  'Super Administrateur',
  'Administrateur',
  'Manager Magasin',
  'Opérateur',
];
const ROLES_CAN_EDIT    = ['Super Administrateur', 'Administrateur'];
const ROLES_CAN_MOVE    = ['Super Administrateur', 'Administrateur', 'Manager Magasin'];

const UNIT_LABELS: Record<string, string> = {
  PIECE:    'Pièce',
  KG:       'kg',
  G:        'g',
  L:        'L',
  CL:       'cL',
  ML:       'mL',
  BOUTEILLE:'Bouteille',
  SACHET:   'Sachet',
  BOITE:    'Boîte',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StoreOption {
  id:   string;
  name: string;
}

interface InventoryRow {
  store_id:       string;
  product_id:     string;
  stock_physical: number;
  stock_reserved: number;
  stock_min:      number;
  stock_reorder:  number;
  store:   { id: string; name: string; color: string };
  product: { id: string; name: string; sku: string; unit: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? fallback;
  return fallback;
}

function StockAlertBadge({ row }: { row: InventoryRow }) {
  const isLow = row.stock_min > 0 && row.stock_physical <= row.stock_min;
  if (!isLow) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border bg-red-50 text-red-700 border-red-200">
      Stock bas
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
// Modale : édition des seuils
// ---------------------------------------------------------------------------

function EditThresholdsModal({
  row,
  onClose,
  onSaved,
}: {
  row:     InventoryRow;
  onClose: () => void;
  onSaved: (updated: InventoryRow) => void;
}) {
  const [stockMin,     setStockMin]     = useState(String(row.stock_min));
  const [stockReorder, setStockReorder] = useState(String(row.stock_reorder));
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const min     = parseInt(stockMin, 10);
    const reorder = parseInt(stockReorder, 10);

    if (isNaN(min) || min < 0 || isNaN(reorder) || reorder < 0) {
      setError('Les seuils doivent être des entiers positifs ou nuls.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await apiClient.patch(
        `/api/inventory/${row.store_id}/${row.product_id}/thresholds`,
        { stock_min: min, stock_reorder: reorder },
      );
      onSaved(data.entry as InventoryRow);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de mettre à jour les seuils.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-thresholds-title"
    >
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="modal-thresholds-title" className="text-base font-semibold text-textMain">
            Seuils d'alerte
          </h2>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Corps */}
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Contexte */}
          <div className="text-sm text-textMuted space-y-0.5">
            <p>
              <span className="font-medium text-textMain">{row.product.name}</span>
              {' · '}
              <span className="font-mono text-xs">{row.product.sku}</span>
            </p>
            <p>
              Établissement :{' '}
              <span
                className="font-medium"
                style={{ color: row.store.color }}
              >
                {row.store.name}
              </span>
            </p>
            <p>
              Stock actuel :{' '}
              <span className="font-medium text-textMain">
                {row.stock_physical} {UNIT_LABELS[row.product.unit] ?? row.product.unit}
              </span>
            </p>
          </div>

          {/* stock_min */}
          <div>
            <label htmlFor="stock-min" className="block text-sm font-medium text-textMain mb-1">
              Seuil d'alerte (stock bas)
            </label>
            <input
              id="stock-min"
              type="number"
              min={0}
              value={stockMin}
              onChange={(e) => setStockMin(e.target.value)}
              className={inputCls}
              placeholder="ex. 10"
            />
            <p className="mt-1 text-xs text-textMuted">
              Une alerte s'affiche quand le stock physique est ≤ à ce seuil (0 = désactivé).
            </p>
          </div>

          {/* stock_reorder */}
          <div>
            <label htmlFor="stock-reorder" className="block text-sm font-medium text-textMain mb-1">
              Seuil de réapprovisionnement
            </label>
            <input
              id="stock-reorder"
              type="number"
              min={0}
              value={stockReorder}
              onChange={(e) => setStockReorder(e.target.value)}
              className={inputCls}
              placeholder="ex. 20"
            />
            <p className="mt-1 text-xs text-textMuted">
              Indicatif : quantité à partir de laquelle une commande doit être passée.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : mouvement de stock
// ---------------------------------------------------------------------------

type MovementType = 'INITIAL' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT';

const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  INITIAL:        'Saisie initiale',
  ADJUSTMENT_IN:  'Régularisation + (entrée)',
  ADJUSTMENT_OUT: 'Régularisation − (sortie / perte)',
};

function StockMovementModal({
  row,
  onClose,
  onSaved,
}: {
  row?:    InventoryRow | null; // si fourni, pré-sélectionne produit+magasin
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type,      setType]      = useState<MovementType>('INITIAL');
  const [storeId,   setStoreId]   = useState(row?.store_id   ?? '');
  const [productId, setProductId] = useState(row?.product_id ?? '');
  const [qty,       setQty]       = useState('');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const needsReason = type === 'ADJUSTMENT_IN' || type === 'ADJUSTMENT_OUT';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qtyNum = parseInt(qty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('La quantité doit être un entier positif.');
      return;
    }
    if (needsReason && !reason.trim()) {
      setError('Un motif est obligatoire pour les ajustements.');
      return;
    }

    setSaving(true);
    try {
      await apiClient.post('/api/stock-movements', {
        store_id:   storeId   || undefined,
        product_id: productId || undefined,
        type,
        qty:    qtyNum,
        reason: reason.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Impossible d\'enregistrer le mouvement.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40" role="dialog" aria-modal="true">
      <div className="flex min-h-full items-center justify-center p-4">
      <div className="bg-surface rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 className="text-base font-semibold text-textMain">Mouvement de stock</h2>
          <button onClick={onClose} className="text-textMuted hover:text-textMain transition-colors" aria-label="Fermer">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {/* Contexte si pré-sélectionné */}
          {row && (
            <div className="text-sm text-textMuted bg-background rounded px-3 py-2 space-y-0.5">
              <p><span className="font-medium text-textMain">{row.product.name}</span> · <span className="font-mono text-xs">{row.product.sku}</span></p>
              <p>Établissement : <span className="font-medium" style={{ color: row.store.color }}>{row.store.name}</span></p>
              <p>Stock actuel : <span className="font-medium text-textMain">{row.stock_physical} {UNIT_LABELS[row.product.unit] ?? row.product.unit}</span></p>
            </div>
          )}

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-textMain mb-1">Type de mouvement</label>
            <select value={type} onChange={(e) => setType(e.target.value as MovementType)} className={inputCls}>
              {(Object.entries(MOVEMENT_TYPE_LABELS) as [MovementType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Quantité */}
          <div>
            <label className="block text-sm font-medium text-textMain mb-1">Quantité</label>
            <input
              type="number" min={1} value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls} placeholder="ex. 50"
            />
          </div>

          {/* Motif (obligatoire pour ajustements) */}
          <div>
            <label className="block text-sm font-medium text-textMain mb-1">
              Motif {needsReason && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text" value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputCls}
              placeholder={needsReason ? 'Obligatoire pour les ajustements…' : 'Optionnel'}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [stores,    setStores]    = useState<StoreOption[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // Filtres
  const [filterStore,    setFilterStore]    = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);

  // Modale
  const [editRow, setEditRow] = useState<InventoryRow | null>(null);

  const canEdit = !sessionLoading && user !== null && ROLES_CAN_EDIT.includes(user.roleName);
  const canMove = !sessionLoading && user !== null && ROLES_CAN_MOVE.includes(user.roleName);

  // Modale mouvement de stock
  const [movementRow, setMovementRow] = useState<InventoryRow | null | undefined>(undefined);
  // undefined = fermé, null = ouvert sans pré-sélection, InventoryRow = ouvert avec ligne

  // -------------------------------------------------------------------
  // Chargement des données
  // -------------------------------------------------------------------

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStore)    params.set('store_id',  filterStore);
      if (filterLowStock) params.set('low_stock', 'true');

      const { data } = await apiClient.get(`/api/inventory?${params.toString()}`);
      setInventory(data.inventory as InventoryRow[]);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger l\'inventaire.'));
    } finally {
      setLoading(false);
    }
  }, [filterStore, filterLowStock]);

  // Chargement des établissements pour le filtre
  useEffect(() => {
    apiClient.get('/api/stores').then(({ data }) => {
      setStores(
        (data.stores as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })),
      );
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sessionLoading) {
      if (!user || !ROLES_ALLOWED.includes(user.roleName)) {
        router.replace('/dashboard');
        return;
      }
      loadInventory();
    }
  }, [sessionLoading, user, router, loadInventory]);

  // -------------------------------------------------------------------
  // Statistiques
  // -------------------------------------------------------------------

  const stats = useMemo(() => {
    const total    = inventory.length;
    const lowStock = inventory.filter((r) => r.stock_min > 0 && r.stock_physical <= r.stock_min).length;
    const zeroed   = inventory.filter((r) => r.stock_physical === 0).length;
    return { total, lowStock, zeroed };
  }, [inventory]);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------

  function handleSaved(updated: InventoryRow) {
    setInventory((prev) =>
      prev.map((r) =>
        r.store_id === updated.store_id && r.product_id === updated.product_id ? updated : r,
      ),
    );
    setEditRow(null);
  }

  function handleMovementSaved() {
    setMovementRow(undefined);
    loadInventory(); // Recharge pour refléter le nouveau stock_physical
  }

  // -------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------

  if (sessionLoading) return null;

  return (
    <div className="p-6 space-y-6">
      {/* Titre + actions */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-textMain">Inventaire</h1>
          <p className="text-sm text-textMuted mt-0.5">
            Niveaux de stock par établissement et par produit.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {canMove && (
            <Button variant="secondary" size="sm" onClick={() => setMovementRow(null)}>
              + Mouvement de stock
            </Button>
          )}
          {(canEdit || canMove) && (
            <a href="/dashboard/inventory/reports">
              <Button variant="secondary" size="sm">
                Rapports d'inventaire
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface border border-borderLight rounded-lg px-4 py-3">
          <p className="text-xs text-textMuted">Lignes totales</p>
          <p className="text-2xl font-semibold text-textMain mt-0.5">{stats.total}</p>
        </div>
        <div className="bg-surface border border-borderLight rounded-lg px-4 py-3">
          <p className="text-xs text-textMuted">Stock bas</p>
          <p className={['text-2xl font-semibold mt-0.5', stats.lowStock > 0 ? 'text-red-600' : 'text-textMain'].join(' ')}>
            {stats.lowStock}
          </p>
        </div>
        <div className="bg-surface border border-borderLight rounded-lg px-4 py-3">
          <p className="text-xs text-textMuted">Stock épuisé</p>
          <p className={['text-2xl font-semibold mt-0.5', stats.zeroed > 0 ? 'text-orange-600' : 'text-textMain'].join(' ')}>
            {stats.zeroed}
          </p>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-surface border border-borderLight rounded-lg px-4 py-3 flex flex-wrap gap-3 items-center">
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className={[inputCls, 'w-auto min-w-[180px]'].join(' ')}
          aria-label="Filtrer par établissement"
        >
          <option value="">Tous les établissements</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-textMain cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filterLowStock}
            onChange={(e) => setFilterLowStock(e.target.checked)}
            className="rounded"
          />
          Stock bas uniquement
        </label>
      </div>

      {/* Message d'erreur */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borderLight bg-background text-left">
                <th className="px-4 py-3 font-medium text-textMuted">Établissement</th>
                <th className="px-4 py-3 font-medium text-textMuted">Produit</th>
                <th className="px-4 py-3 font-medium text-textMuted">SKU</th>
                <th className="px-4 py-3 font-medium text-textMuted text-right">Stock physique</th>
                <th className="px-4 py-3 font-medium text-textMuted text-right">Disponible</th>
                <th className="px-4 py-3 font-medium text-textMuted text-right">Seuil min</th>
                <th className="px-4 py-3 font-medium text-textMuted text-right">Réappro.</th>
                <th className="px-4 py-3 font-medium text-textMuted">Alerte</th>
                {(canEdit || canMove) && (
                  <th className="px-4 py-3 font-medium text-textMuted">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {loading ? (
                <SkeletonRows cols={(canEdit || canMove) ? 9 : 8} />
              ) : inventory.length === 0 ? (
                <tr>
                  <td
                    colSpan={(canEdit || canMove) ? 9 : 8}
                    className="px-4 py-8 text-center text-sm text-textMuted"
                  >
                    Aucune entrée d'inventaire.
                  </td>
                </tr>
              ) : (
                inventory.map((row) => {
                  const available = row.stock_physical - row.stock_reserved;
                  const isLow     = row.stock_min > 0 && row.stock_physical <= row.stock_min;
                  const unit      = UNIT_LABELS[row.product.unit] ?? row.product.unit;

                  return (
                    <tr
                      key={`${row.store_id}-${row.product_id}`}
                      className={['hover:bg-background/60 transition-colors', isLow ? 'bg-red-50/30' : ''].join(' ')}
                    >
                      {/* Établissement */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: row.store.color }}
                            aria-hidden="true"
                          />
                          <span className="text-textMain font-medium">{row.store.name}</span>
                        </span>
                      </td>

                      {/* Produit */}
                      <td className="px-4 py-3 text-textMain">{row.product.name}</td>

                      {/* SKU */}
                      <td className="px-4 py-3 font-mono text-xs text-textMuted">{row.product.sku}</td>

                      {/* Stock physique */}
                      <td className="px-4 py-3 text-right font-medium text-textMain">
                        {row.stock_physical} <span className="text-textMuted font-normal text-xs">{unit}</span>
                      </td>

                      {/* Disponible */}
                      <td className="px-4 py-3 text-right">
                        <span className={available < 0 ? 'text-red-600 font-medium' : 'text-textMain'}>
                          {available}
                        </span>
                        {' '}
                        <span className="text-textMuted text-xs">{unit}</span>
                      </td>

                      {/* Seuil min */}
                      <td className="px-4 py-3 text-right text-textMuted">
                        {row.stock_min > 0 ? (
                          <>{row.stock_min} <span className="text-xs">{unit}</span></>
                        ) : (
                          <span className="text-borderLight">—</span>
                        )}
                      </td>

                      {/* Seuil réappro */}
                      <td className="px-4 py-3 text-right text-textMuted">
                        {row.stock_reorder > 0 ? (
                          <>{row.stock_reorder} <span className="text-xs">{unit}</span></>
                        ) : (
                          <span className="text-borderLight">—</span>
                        )}
                      </td>

                      {/* Alerte */}
                      <td className="px-4 py-3">
                        <StockAlertBadge row={row} />
                      </td>

                      {/* Actions */}
                      {(canEdit || canMove) && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {canMove && (
                              <Button variant="secondary" size="sm" onClick={() => setMovementRow(row)}>
                                Mouvement
                              </Button>
                            )}
                            {canEdit && (
                              <Button variant="secondary" size="sm" onClick={() => setEditRow(row)}>
                                Seuils
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale mouvement de stock */}
      {movementRow !== undefined && (
        <StockMovementModal
          row={movementRow}
          onClose={() => setMovementRow(undefined)}
          onSaved={handleMovementSaved}
        />
      )}

      {/* Modale édition seuils */}
      {editRow && (
        <EditThresholdsModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
