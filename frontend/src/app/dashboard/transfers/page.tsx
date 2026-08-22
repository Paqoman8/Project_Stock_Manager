'use client';

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import ConversionDialog from '@/components/stock/ConversionDialog';

const TRANSFER_ROLES = ['Super Administrateur', 'Administrateur', 'Manager Magasin'] as const;

type TransferStatus = 'PENDING' | 'DONE' | 'CANCEL';

type StoreOption = { id: string; name: string };
type SourceInventoryRow = {
  product_id: string;
  stock_physical: number;
  product: { id: string; name: string; sku: string; unit: string; price: string; is_active: boolean };
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

const TRANSFER_PAGE_SIZE = 10;

// PostgreSQL accepte n'importe quel format UUID (v1-v5 et UUID nil). La validation
// Zod .uuid() par défaut exige un UUID v4, ce qui rejetterait les identifiants
// historiques non v4 encore présents en base. On accepte donc tout UUID valide.
const UUID_ANY_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createTransferSchema = z.object({
  to_store_id: z.string().regex(UUID_ANY_REGEX, 'Sélectionnez un établissement de destination valide.'),
  items: z.array(
    z.object({
      product_id: z.string().regex(UUID_ANY_REGEX, 'Produit invalide.'),
      qty: z.number().int().positive('La quantité doit être > 0.').optional(),
      packaging_format_id: z.string().regex(UUID_ANY_REGEX, 'Format invalide.').optional(),
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

function StatusBadge({ status }: { status: TransferStatus }): React.JSX.Element {
  if (status === 'DONE') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Confirmé
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
        En attente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
      Annulé
    </span>
  );
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

function formatZodIssues(issues: Array<{ path?: PropertyKey[]; message: string }>): string {
  const messages = issues.map((issue) => {
    const path = issue.path?.length ? `${issue.path.join('.')}: ` : '';
    return `${path}${issue.message}`;
  });
  return Array.from(new Set(messages)).join(' ; ');
}

function getDraftItemError(
  item: DraftItem,
  inventory: SourceInventoryRow[],
  formatsByProduct: Record<string, PackagingFormat[]>,
): string | null {
  if (!item.product_id.trim()) return null;
  const row = inventory.find((r) => r.product_id === item.product_id);
  if (!row) return 'Produit non disponible dans le stock source.';

  if (item.packaging_format_id.trim()) {
    const format = formatsByProduct[item.product_id]?.find((f) => f.id === item.packaging_format_id);
    if (!format) return null;
    const packagesCount = Number(item.packages_count);
    if (!packagesCount || packagesCount <= 0) return null;
    const requestedUnits = packagesCount * format.units_per_package;
    if (requestedUnits > row.stock_physical) {
      const maxPackages = Math.floor(row.stock_physical / format.units_per_package);
      return `Stock insuffisant : max ${maxPackages} ${format.label} (×${format.units_per_package}) soit ${row.stock_physical} unité(s).`;
    }
  } else {
    const qty = Number(item.qty);
    if (!qty || qty <= 0) return null;
    if (qty > row.stock_physical) {
      return `Stock insuffisant : max ${row.stock_physical} unité(s).`;
    }
  }
  return null;
}

export default function TransfersPage() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  const [sourceStores, setSourceStores] = useState<StoreOption[]>([]);
  const [destinationStores, setDestinationStores] = useState<StoreOption[]>([]);
  const [sourceInventory, setSourceInventory] = useState<SourceInventoryRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);

  const [fromStoreId, setFromStoreId] = useState('');
  const [toStoreId, setToStoreId] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ product_id: '', qty: '', packaging_format_id: '', packages_count: '' }]);
  const [formatsByProduct, setFormatsByProduct] = useState<Record<string, PackagingFormat[]>>({});

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isTransfersLoading, setIsTransfersLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActionLoadingId, setIsActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [conversionSuggestion, setConversionSuggestion] = useState<{
    productId: string;
    productName: string;
    toFormatId: string;
  } | null>(null);
  const [showConversionDialog, setShowConversionDialog] = useState(false);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<TransferStatus | ''>('');
  const [transferPage, setTransferPage] = useState(1);
  const [transferTotalPages, setTransferTotalPages] = useState(1);

  const canAccess = !isLoading && user !== null && TRANSFER_ROLES.includes(user.roleName as (typeof TRANSFER_ROLES)[number]);

  const productOptions = useMemo(
    () => sourceInventory.filter((row) => row.stock_physical > 0 && row.product.is_active),
    [sourceInventory],
  );
  const filteredDestinationStores = useMemo(
    () => destinationStores.filter((store) => store.id !== fromStoreId),
    [destinationStores, fromStoreId],
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
  const itemErrors = useMemo(
    () => draftItems.map((item) => getDraftItemError(item, sourceInventory, formatsByProduct)),
    [draftItems, sourceInventory, formatsByProduct],
  );
  const hasQuantityErrors = useMemo(() => itemErrors.some((err) => err !== null), [itemErrors]);

  const hasActiveFilters = search.trim() !== '' || filterStatus !== '';

  useEffect(() => {
    if (isLoading) return;
    if (!canAccess) {
      router.replace('/dashboard');
    }
  }, [canAccess, isLoading, router]);

  async function loadStores(): Promise<void> {
    if (!user) return;
    try {
      const storesRes = await apiClient.get('/api/transfers/options/stores');
      const nextSourceStores = storesRes.data?.source_stores ?? [];
      const nextDestinationStores = storesRes.data?.destination_stores ?? [];

      setSourceStores(nextSourceStores);
      setDestinationStores(nextDestinationStores);

      setFromStoreId((current) => {
        if (current && nextSourceStores.some((store: StoreOption) => store.id === current)) return current;
        if (nextSourceStores.some((store: StoreOption) => store.id === user.storeId)) return user.storeId;
        return nextSourceStores[0]?.id ?? '';
      });
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les établissements.'));
    }
  }

  async function loadTransfers(page = transferPage, searchQuery = search, statusFilter = filterStatus): Promise<void> {
    if (!user) return;
    setIsTransfersLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(TRANSFER_PAGE_SIZE));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiClient.get<{ success: boolean; transfers: TransferRow[]; total: number; page: number; totalPages: number }>(
        `/api/transfers?${params.toString()}`,
      );
      setTransfers(res.data?.transfers ?? []);
      setTransferPage(res.data?.page ?? page);
      setTransferTotalPages(res.data?.totalPages ?? 1);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger les transferts.'));
    } finally {
      setIsTransfersLoading(false);
      setIsBootLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccess || !user) return;
    const timer = setTimeout(() => {
      void (async () => {
        await loadStores();
        await loadTransfers(1, search, filterStatus);
      })();
    }, 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess, user?.id]);

  useEffect(() => {
    if (!canAccess || !user || fromStoreId.trim() === '') return;
    apiClient
      .get('/api/inventory', { params: { store_id: fromStoreId } })
      .then(({ data }) => {
        setSourceInventory(data?.inventory ?? []);
      })
      .catch((err) => {
        setError(extractApiError(err, 'Impossible de charger le stock source.'));
        setSourceInventory([]);
      });
  }, [canAccess, user, fromStoreId]);

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

  async function submitTransfer(e?: React.FormEvent): Promise<void> {
    if (e) e.preventDefault();
    if (!user) return;

    setFormError(null);
    setConversionSuggestion(null);
    setShowConversionDialog(false);

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

    if (hasQuantityErrors) {
      setFormError('Corrigez les quantités supérieures au stock disponible.');
      return;
    }

    const parsed = createTransferSchema.safeParse({
      to_store_id: toStoreId,
      items: parsedItems,
    });

    if (!parsed.success) {
      setFormError(formatZodIssues(parsed.error.issues));
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/transfers', {
        from_store_id: fromStoreId,
        to_store_id: parsed.data.to_store_id,
        items: parsed.data.items,
      });

      setFromStoreId((current) => current);
      setToStoreId('');
      setDraftItems([{ product_id: '', qty: '', packaging_format_id: '', packages_count: '' }]);
      await loadTransfers(1);
    } catch (err) {
      const apiMsg = extractApiError(err, '');
      setFormError(apiMsg || 'Échec de création du transfert.');

      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const firstFormatItem = parsedItems.find((i) => i.packaging_format_id);
        if (firstFormatItem) {
          const row = sourceInventory.find((r) => r.product_id === firstFormatItem.product_id);
          setConversionSuggestion({
            productId: firstFormatItem.product_id,
            productName: row?.product.name ?? '',
            toFormatId: firstFormatItem.packaging_format_id!,
          });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmTransfer(transferId: string): Promise<void> {
    setIsActionLoadingId(transferId);
    try {
      await apiClient.put(`/api/transfers/${transferId}/confirm`);
      await loadTransfers();
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
      await loadTransfers();
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
          Choisissez la source parmi vos magasins autorisés, puis la destination cible.
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
            disabled={isSubmitting || !hasAtLeastOneCompleteRow || hasQuantityErrors || toStoreId.trim() === '' || fromStoreId.trim() === ''}
            className="min-w-[200px]"
          >
            {isSubmitting ? 'Création...' : 'Créer le transfert'}
          </Button>
        </div>
        <form id="transfer-form" className="space-y-4" onSubmit={submitTransfer}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_220px] gap-4 items-end">
            <div className="space-y-1">
              <label htmlFor="source-store" className="text-xs font-medium text-textMuted">
                Magasin source
              </label>
              <select
                id="source-store"
                className={inputCls}
                value={fromStoreId}
                onChange={(e) => {
                  const nextStoreId = e.target.value;
                  setFromStoreId(nextStoreId);
                  if (toStoreId === nextStoreId) setToStoreId('');
                }}
              >
                <option value="">Sélectionnez un magasin</option>
                {sourceStores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </div>
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
                {filteredDestinationStores.map((store) => (
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
                  {itemErrors[idx] && (
                    <p className="text-xs text-red-700">{itemErrors[idx]}</p>
                  )}
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

          {conversionSuggestion && (
            <div className="border border-amber-200 bg-amber-50 rounded px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-amber-800">
                Stock insuffisant pour <strong>{conversionSuggestion.productName}</strong>.
                Voulez-vous convertir depuis un autre conditionnement&nbsp;?
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowConversionDialog(true)}
              >
                Convertir
              </Button>
            </div>
          )}
        </form>
      </div>

      <ConversionDialog
        isOpen={showConversionDialog}
        storeId={fromStoreId}
        productId={conversionSuggestion?.productId ?? ''}
        productName={conversionSuggestion?.productName}
        prefillToFormatId={conversionSuggestion?.toFormatId}
        reasonHint={
          conversionSuggestion
            ? `Conversion pour transfert vers ${filteredDestinationStores.find((s) => s.id === toStoreId)?.name ?? 'destination'}`
            : undefined
        }
        onClose={() => setShowConversionDialog(false)}
        onSuccess={() => {
          setShowConversionDialog(false);
          setConversionSuggestion(null);
          void submitTransfer();
        }}
      />

      <div className="bg-surface border border-borderLight rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-borderLight">
          <h2 className="text-lg font-medium text-textMain">Transferts</h2>
        </div>

        <div className="p-3 border-b border-borderLight">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher (date, source, destination, produit…)"
              value={search}
              onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                void loadTransfers(1, value, filterStatus);
              }}
              className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary flex-1 min-w-48"
              aria-label="Rechercher dans les transferts"
            />

            <select
              value={filterStatus}
              onChange={(e) => {
                const value = e.target.value as TransferStatus | '';
                setFilterStatus(value);
                void loadTransfers(1, search, value);
              }}
              className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary shrink-0 w-auto"
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="DONE">Confirmé</option>
              <option value="CANCEL">Annulé</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilterStatus('');
                  void loadTransfers(1, '', '');
                }}
                className="shrink-0 px-3 py-2 text-xs border border-borderLight rounded text-textMuted hover:text-red-600 hover:border-red-300 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-background text-textMuted">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Statut</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
                <th className="text-left px-4 py-2 font-medium">Destination</th>
                <th className="text-left px-4 py-2 font-medium">Produit</th>
                <th className="text-left px-4 py-2 font-medium">Format</th>
                <th className="text-left px-4 py-2 font-medium">Qté</th>
                <th className="text-left px-4 py-2 font-medium">Qté totale</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isBootLoading || isTransfersLoading ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={9}>Chargement...</td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-textMuted" colSpan={9}>
                    {hasActiveFilters ? 'Aucun transfert ne correspond aux filtres.' : 'Aucun transfert.'}
                  </td>
                </tr>
              ) : (
                transfers.map((transfer) => {
                  const totalQty = transfer.items.reduce((sum, item) => sum + item.qty, 0);
                  const isPending = transfer.status === 'PENDING';
                  return (
                    <tr key={transfer.id} className="border-t border-borderLight">
                      <td className="px-4 py-3 text-textMain align-top">{new Date(transfer.created_at).toLocaleString('fr-FR')}</td>
                      <td className="px-4 py-3 align-top"><StatusBadge status={transfer.status} /></td>
                      <td className="px-4 py-3 text-textMain align-top">{transfer.from_store.name}</td>
                      <td className="px-4 py-3 text-textMain align-top">{transfer.to_store.name}</td>
                      <td className="px-4 py-3 text-textMain align-top">
                        <div className="space-y-1">
                          {transfer.items.map((item) => (
                            <div key={`${transfer.id}-${item.product_id}-${item.packaging_format_id ?? ''}`}>{item.product.name}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textMain align-top">
                        <div className="space-y-1">
                          {transfer.items.map((item) => (
                            <div key={`${transfer.id}-${item.product_id}-${item.packaging_format_id ?? ''}-fmt`}>
                              {item.packaging_format?.label ?? 'Unité de base'}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textMain align-top">
                        <div className="space-y-1">
                          {transfer.items.map((item) => (
                            <div key={`${transfer.id}-${item.product_id}-${item.packaging_format_id ?? ''}-qty`}>
                              {item.packaging_format ? `${item.packages_count} ${item.packaging_format.label}` : item.qty}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-textMain align-top">{totalQty}</td>
                      <td className="px-4 py-3 align-top">
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

        {transferTotalPages > 1 && (
          <div className="px-4 py-3 border-t border-borderLight flex items-center justify-between">
            <p className="text-xs text-textMuted">
              Page {transferPage} / {transferTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, transferPage - 1);
                  setTransferPage(next);
                  void loadTransfers(next);
                }}
                disabled={transferPage === 1}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Précédent
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(transferTotalPages, transferPage + 1);
                  setTransferPage(next);
                  void loadTransfers(next);
                }}
                disabled={transferPage === transferTotalPages}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
