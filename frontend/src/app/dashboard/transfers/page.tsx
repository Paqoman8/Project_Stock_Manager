'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

const TRANSFER_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin'] as const;

type TransferStatus = 'PENDING' | 'DONE' | 'CANCEL';

type DestinationStore = { id: string; name: string };
type SourceInventoryRow = {
  product_id: string;
  stock_physical: number;
  product: { id: string; name: string; sku: string; unit: string };
};
type PackagingFormat = {
  id: string;
  label: string;
  units_per_package: number;
  is_base_unit: boolean;
};

type TransferRow = {
  id: string;
  from_store_id: string;
  to_store_id: string;
  status: TransferStatus;
  created_at: string;
  from_store: { id: string; name: string };
  to_store: { id: string; name: string };
  items: Array<{
    product_id: string;
    qty: number;
    packaging_format_id: string | null;
    packages_count: number | null;
    packaging_format: { id: string; label: string; units_per_package: number } | null;
    product: { id: string; name: string; sku: string; unit: string };
  }>;
};

type DraftItem = { product_id: string; qty: string; packaging_format_id: string; packages_count: string };

const createTransferSchema = z.object({
  to_store_id: z.string().uuid('Sélectionnez un établissement de destination valide.'),
  items: z.array(
    z.object({
      product_id: z.string().uuid('Produit invalide.'),
      qty: z.number().int().positive('La quantité doit être > 0.').optional(),
      packaging_format_id: z.string().uuid('Format invalide.').optional(),
      packages_count: z.number().int().positive('Le nombre de colis doit être > 0.').optional(),
    }),
  ).min(1, 'Ajoutez au moins un produit.')
    .refine(
      (items) => items.every((item) => (item.packaging_format_id ? item.packages_count !== undefined : item.qty !== undefined)),
      { message: 'Chaque ligne doit fournir quantité (sans format) ou colis + format.' },
    ),
});

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

function statusLabel(status: TransferStatus): string {
  if (status === 'PENDING') return 'En attente';
  if (status === 'DONE') return 'Confirmé';
  return 'Annulé';
}

function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message ?? fallback;
  return fallback;
}

function sanitizePositiveIntegerInput(value: string): string {
  if (value.trim() === '') return '';
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly === '') return '';
  const asNumber = Number(digitsOnly);
  return String(Math.max(0, Math.trunc(asNumber)));
}

export default function TransfersPage() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  const [destinationStores, setDestinationStores] = useState<DestinationStore[]>([]);
  const [sourceInventory, setSourceInventory] = useState<SourceInventoryRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  const [toStoreId, setToStoreId] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ product_id: '', qty: '', packaging_format_id: '', packages_count: '' }]);
  const [formatsByProduct, setFormatsByProduct] = useState<Record<string, PackagingFormat[]>>({});

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionLoadingId, setIsActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const canAccess = !isLoading && user !== null && TRANSFER_ROLES.includes(user.roleName as (typeof TRANSFER_ROLES)[number]);

  const productOptions = useMemo(
    () => sourceInventory.filter((row) => row.stock_physical > 0),
    [sourceInventory],
  );
  const hasAtLeastOneCompleteRow = useMemo(
    () => draftItems.some((item) => (
      item.product_id.trim() !== '' &&
      (
        (item.packaging_format_id.trim() !== '' && Number(item.packages_count) > 0) ||
        (item.packaging_format_id.trim() === '' && Number(item.qty) > 0)
      )
    )),
    [draftItems],
  );

  useEffect(() => {
    if (isLoading) return;
    if (!canAccess) {
      router.replace('/dashboard');
    }
  }, [canAccess, isLoading, router]);

  async function loadBootstrap(): Promise<void> {
    if (!user) return;
    setIsBootLoading(true);
    setError(null);
    try {
      const [storesRes, inventoryRes, transfersRes] = await Promise.all([
        apiClient.get('/api/transfers/options/stores'),
        apiClient.get('/api/inventory', { params: { store_id: user.storeId } }),
        apiClient.get('/api/transfers'),
      ]);

      setDestinationStores(storesRes.data?.stores ?? []);
      setSourceInventory(inventoryRes.data?.inventory ?? []);
      setTransfers(transfersRes.data?.transfers ?? []);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les transferts.'));
    } finally {
      setIsBootLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess || !user) return;
    const timer = setTimeout(() => {
      void loadBootstrap();
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, user?.id]);

  function addDraftItem(): void {
    setDraftItems((prev) => [...prev, { product_id: '', qty: '', packaging_format_id: '', packages_count: '' }]);
  }

  function removeDraftItem(index: number): void {
    setDraftItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateDraftItem(index: number, next: Partial<DraftItem>): void {
    setDraftItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...next } : row)));
  }

  useEffect(() => {
    const productIds = Array.from(new Set(draftItems.map((i) => i.product_id).filter((id) => id.trim() !== '')));
    productIds.forEach((productId) => {
      if (formatsByProduct[productId]) return;
      void apiClient
        .get<{ success: boolean; formats: PackagingFormat[] }>(`/api/products/${productId}/packaging-formats`)
        .then(({ data }) => {
          setFormatsByProduct((prev) => ({ ...prev, [productId]: data.formats ?? [] }));
        })
        .catch(() => {
          setFormatsByProduct((prev) => ({ ...prev, [productId]: [] }));
        });
    });
  }, [draftItems, formatsByProduct]);

  async function submitTransfer(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!user) return;

    setFormError(null);

    const parsedItems = draftItems
      .filter((item) => item.product_id.trim() !== '')
      .map((item) => {
        if (item.packaging_format_id.trim() !== '') {
          return {
            product_id: item.product_id,
            packaging_format_id: item.packaging_format_id,
            packages_count: Number(item.packages_count),
          };
        }
        return {
          product_id: item.product_id,
          qty: Number(item.qty),
        };
      });

    const uniqueProductIds = new Set(parsedItems.map((item) => item.product_id));
    if (uniqueProductIds.size !== parsedItems.length) {
      setFormError('Un produit ne peut apparaître qu’une seule fois dans un transfert.');
      return;
    }

    const parsed = createTransferSchema.safeParse({
      to_store_id: toStoreId,
      items: parsedItems,
    });

    if (!parsed.success) {
      const first = parsed.error.issues[0]?.message ?? 'Vérifiez le formulaire.';
      setFormError(first);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/transfers', {
        from_store_id: user.storeId,
        to_store_id: parsed.data.to_store_id,
        items: parsed.data.items,
      });

      setToStoreId('');
      setDraftItems([{ product_id: '', qty: '', packaging_format_id: '', packages_count: '' }]);
      await loadBootstrap();
    } catch (err) {
      setFormError(extractApiError(err, 'Échec de création du transfert.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmTransfer(transferId: string): Promise<void> {
    setIsActionLoadingId(transferId);
    try {
      await apiClient.put(`/api/transfers/${transferId}/confirm`);
      await loadBootstrap();
    } catch (err) {
      setError(extractApiError(err, 'Échec de confirmation du transfert.'));
    } finally {
      setIsActionLoadingId(null);
    }
  }

  async function cancelTransfer(transferId: string): Promise<void> {
    setIsActionLoadingId(transferId);
    try {
      await apiClient.put(`/api/transfers/${transferId}/cancel`);
      await loadBootstrap();
    } catch (err) {
      setError(extractApiError(err, 'Échec d\'annulation du transfert.'));
    } finally {
      setIsActionLoadingId(null);
    }
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
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-textMain">Transferts inter-magasins</h1>
        <p className="text-sm text-textMuted mt-1">
          Magasin source: <span className="font-medium text-textMain">{user?.storeName}</span>
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-surface border border-borderLight p-4 md:p-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-textMain">Nouveau transfert</h2>
          <Button
            type="submit"
            form="transfer-form"
            disabled={isSubmitting || !hasAtLeastOneCompleteRow || toStoreId.trim() === ''}
            className="min-w-[200px]"
          >
            {isSubmitting ? 'Création...' : 'Créer le transfert'}
          </Button>
        </div>
        <form id="transfer-form" className="space-y-4" onSubmit={submitTransfer}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-end">
            <div className="space-y-1">
              <label htmlFor="destination-store" className="text-xs font-medium text-textMuted">
                Magasin destination
              </label>
              <select
                id="destination-store"
                className={inputCls}
                value={toStoreId}
                onChange={(e) => setToStoreId(e.target.value)}
              >
                <option value="">Sélectionnez un magasin</option>
                {destinationStores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>

            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={addDraftItem}
                className="w-full"
              >
                Ajouter un produit
              </Button>
            </div>
          </div>

          <div className="border border-borderLight p-4 space-y-3">
            <div className="hidden lg:grid lg:grid-cols-[1fr_1fr_160px_64px] gap-4 px-2 text-sm font-medium text-textMain">
              <span>Produit</span>
              <span>Format</span>
              <span>Quantité</span>
              <span />
            </div>

            {draftItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_160px_64px] gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs text-textMuted lg:hidden">Produit</label>
                  <select
                    className={inputCls}
                    value={item.product_id}
                    onChange={(e) => {
                      const nextProductId = e.target.value;
                      const formats = formatsByProduct[nextProductId] ?? [];
                      const baseFormat = formats.find((f) => f.is_base_unit);
                      updateDraftItem(idx, {
                        product_id: nextProductId,
                        packaging_format_id: baseFormat?.id ?? '',
                        packages_count: '',
                        qty: '',
                      });
                    }}
                  >
                    <option value="">Sélectionnez un produit</option>
                    {productOptions.map((row) => (
                      <option key={row.product_id} value={row.product_id}>
                        {row.product.name} ({row.product.sku}) - stock {row.stock_physical}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-textMuted lg:hidden">Format</label>
                  <select
                    className={inputCls}
                    value={item.packaging_format_id}
                    onChange={(e) => updateDraftItem(idx, { packaging_format_id: e.target.value, qty: '', packages_count: '' })}
                    disabled={!item.product_id}
                  >
                    <option value="">Sélectionnez un format</option>
                    {(formatsByProduct[item.product_id] ?? []).map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.label} (x{format.units_per_package})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-textMuted lg:hidden">Quantité</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    className={`${inputCls} text-right`}
                    placeholder="eg. 1"
                    value={item.packaging_format_id ? item.packages_count : item.qty}
                    onChange={(e) => updateDraftItem(
                      idx,
                      item.packaging_format_id
                        ? { packages_count: sanitizePositiveIntegerInput(e.target.value) }
                        : { qty: sanitizePositiveIntegerInput(e.target.value) },
                    )}
                  />
                </div>

                <button
                  type="button"
                  aria-label="Retirer la ligne"
                  onClick={() => removeDraftItem(idx)}
                  disabled={draftItems.length === 1}
                  className="h-10 w-10 border border-borderLight text-textMuted hover:text-red-600 hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {formError && (
            <p className="text-sm text-red-700">{formError}</p>
          )}
        </form>
      </div>

      <div className="bg-surface border border-borderLight rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLight">
          <h2 className="text-lg font-medium text-textMain">Transferts</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-background text-textMuted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
                <th className="text-left px-4 py-2 font-medium">Destination</th>
                <th className="text-left px-4 py-2 font-medium">Lignes</th>
                <th className="text-left px-4 py-2 font-medium">Qté totale</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isBootLoading ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={7}>Chargement...</td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={7}>Aucun transfert.</td>
                </tr>
              ) : (
                transfers.map((transfer) => {
                  const totalQty = transfer.items.reduce((sum, item) => sum + item.qty, 0);
                  const isPending = transfer.status === 'PENDING';
                  return (
                    <tr key={transfer.id} className="border-t border-borderLight">
                      <td className="px-4 py-3 text-textMain">{new Date(transfer.created_at).toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 text-textMain">{statusLabel(transfer.status)}</td>
                      <td className="px-4 py-3 text-textMain">{transfer.from_store.name}</td>
                      <td className="px-4 py-3 text-textMain">{transfer.to_store.name}</td>
                      <td className="px-4 py-3 text-textMain">{transfer.items.length}</td>
                      <td className="px-4 py-3 text-textMain">{totalQty}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!isPending || isActionLoadingId === transfer.id}
                            onClick={() => confirmTransfer(transfer.id)}
                          >
                            Confirmer
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={!isPending || isActionLoadingId === transfer.id}
                            onClick={() => cancelTransfer(transfer.id)}
                          >
                            Annuler
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
