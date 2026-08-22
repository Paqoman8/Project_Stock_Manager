'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import TransactionsList from '@/components/pos/TransactionsList';
import NewClientSelector from '@/components/pos/NewClientSelector';
import type { ClientPayload } from '@/components/pos/NewClientSelector';
import ConversionDialog from '@/components/stock/ConversionDialog';

type SortKey = 'name' | 'price' | 'stock';
type SortDir = 'asc' | 'desc';

type InventoryProductRow = {
  product_id: string;
  stock_physical: number;
  product: {
    id: string;
    name: string;
    sku: string;
    price: string;
    unit: string;
    is_active: boolean;
  };
};

type PackagingFormat = {
  id: string;
  label: string;
  units_per_package: number;
  is_base_unit: boolean;
  available_quantity: number;
};

type CartItem = {
  cartId: string;
  product: InventoryProductRow['product'];
  stock: number;
  qtyInput: string;
  selectedFormatId: string;
  formats: PackagingFormat[];
};

const PAGE_SIZE = 30;

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

const SORT_LABELS: Record<SortKey, string> = {
  name: 'Nom',
  price: 'Prix',
  stock: 'Stock',
};

function sanitizePositiveIntegerInput(value: string): string {
  if (value.trim() === '') return '';
  const digitsOnly = value.replace(/\D/g, '');
  if (digitsOnly === '') return '';
  return String(Math.max(1, Math.trunc(Number(digitsOnly))));
}

function getFormatForItem(item: CartItem): PackagingFormat | undefined {
  return item.formats.find((format) => format.id === item.selectedFormatId);
}

function getRequestedUnits(item: CartItem): number {
  const amount = Number(item.qtyInput || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const selectedFormat = getFormatForItem(item);
  return selectedFormat ? amount * selectedFormat.units_per_package : amount;
}

function getMaxAmountForItem(item: CartItem): number {
  const selectedFormat = getFormatForItem(item);
  if (!selectedFormat) return item.stock;
  return Math.min(
    Math.floor(item.stock / selectedFormat.units_per_package),
    selectedFormat.available_quantity,
  );
}

let nextCartItemId = 1;

export default function PosPage() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  const [inventoryRows, setInventoryRows] = useState<InventoryProductRow[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);

  const [clientPayload, setClientPayload] = useState<ClientPayload | null>(null);

  const [conversionForPos, setConversionForPos] = useState<{
    productId: string;
    productName: string;
    toFormatId: string;
  } | null>(null);

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingFormatIds, setLoadingFormatIds] = useState<string[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canAccess = !isLoading && user !== null &&
    POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  useEffect(() => {
    if (!isLoading && !canAccess) router.replace('/dashboard');
  }, [canAccess, isLoading, router]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsBootLoading(true);
    setBootError(null);
    try {
      const inventoryRes = await apiClient.get<{ success: boolean; inventory: InventoryProductRow[] }>('/api/inventory', {
        params: { store_id: user.storeId },
      });
      const rows = (inventoryRes.data?.inventory ?? []).filter((row) => row.product.is_active);
      setInventoryRows(rows);
      setCart((current) => current
        .map((item) => {
          const nextRow = rows.find((row) => row.product_id === item.product.id);
          if (!nextRow || nextRow.stock_physical <= 0) return null;
          const nextItem = { ...item, stock: nextRow.stock_physical };
          const maxAmount = getMaxAmountForItem(nextItem);
          if (maxAmount <= 0) return null;
          return {
            ...nextItem,
            qtyInput: String(Math.min(Number(nextItem.qtyInput || 1), maxAmount)),
          };
        })
        .filter((item): item is CartItem => item !== null));
    } catch (err) {
      setBootError(extractApiError(err, 'Impossible de charger le catalogue.'));
    } finally {
      setIsBootLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!canAccess || !user) return;
    const timer = setTimeout(() => {
      void loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [canAccess, user, loadData]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? inventoryRows.filter((row) => row.product.name.toLowerCase().includes(q) || row.product.sku.toLowerCase().includes(q))
      : inventoryRows;

    return [...base]
      .filter((row) => row.stock_physical > 0)
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.product.name.localeCompare(b.product.name, 'fr');
        if (sortKey === 'price') cmp = Number(a.product.price) - Number(b.product.price);
        if (sortKey === 'stock') cmp = a.stock_physical - b.stock_physical;
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [inventoryRows, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price) * getRequestedUnits(item), 0),
    [cart],
  );

  async function loadFormats(productId: string): Promise<PackagingFormat[]> {
    setLoadingFormatIds((current) => [...current, productId]);
    try {
      const { data } = await apiClient.get<{ success: boolean; formats: PackagingFormat[] }>(`/api/products/${productId}/packaging-formats`);
      return data.formats ?? [];
    } finally {
      setLoadingFormatIds((current) => current.filter((id) => id !== productId));
    }
  }

  async function addToCart(row: InventoryProductRow): Promise<void> {
    if (row.stock_physical <= 0) return;

    try {
      const formats = await loadFormats(row.product.id);
      const baseFormat = formats.find((format) => format.is_base_unit) ?? formats[0];
      const nextItem: CartItem = {
        cartId: String(nextCartItemId++),
        product: row.product,
        stock: row.stock_physical,
        qtyInput: '1',
        selectedFormatId: baseFormat?.id ?? '',
        formats,
      };

      if (getMaxAmountForItem(nextItem) <= 0) {
        setSubmitError('Le format choisi ne peut pas être vendu avec le stock disponible.');
        return;
      }

      setCart((current) => [...current, nextItem]);
      setSubmitError(null);
      setSuccessMessage(null);
    } catch (err) {
      setSubmitError(extractApiError(err, 'Impossible de charger les formats du produit.'));
    }
  }

  function updateCartItem(cartId: string, updater: (item: CartItem) => CartItem): void {
    setCart((current) => current.map((item) => {
      if (item.cartId !== cartId) return item;
      const nextItem = updater(item);
      const maxAmount = getMaxAmountForItem(nextItem);
      return {
        ...nextItem,
        qtyInput: String(Math.min(Number(nextItem.qtyInput || 1), Math.max(maxAmount, 1))),
      };
    }));
  }

  function removeFromCart(cartId: string): void {
    setCart((current) => current.filter((item) => item.cartId !== cartId));
  }

  function clearCart(): void {
    setCart([]);
    setPaymentMethod('CASH');
    setClientPayload(null);
  }

  async function submitSale(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitError(null);
    setSuccessMessage(null);

    const invalidLine = cart.find((item) => {
      const maxAmount = getMaxAmountForItem(item);
      return Number(item.qtyInput) < 1 || Number(item.qtyInput) > maxAmount || getRequestedUnits(item) > item.stock;
    });
    if (invalidLine) {
      setSubmitError(`La quantité saisie pour ${invalidLine.product.name} dépasse le stock disponible.`);
      return;
    }

    const plainItemsByProduct = new Map<string, number>();
    for (const item of cart) {
      const selectedFormat = getFormatForItem(item);
      if (selectedFormat) continue;
      const productId = item.product.id;
      plainItemsByProduct.set(productId, (plainItemsByProduct.get(productId) ?? 0) + getRequestedUnits(item));
    }
    for (const productId of plainItemsByProduct.keys()) {
      const row = inventoryRows.find((r) => r.product_id === productId);
      if (row && plainItemsByProduct.get(productId)! > row.stock_physical) {
        setSubmitError(`La quantité totale demandée pour ${row.product.name} dépasse le stock disponible.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/api/transactions', {
        payment_method: paymentMethod,
        client: clientPayload ?? undefined,
        items: cart.map((item) => {
          const selectedFormat = getFormatForItem(item);
          if (selectedFormat) {
            return {
              product_id: item.product.id,
              packaging_format_id: selectedFormat.id,
              packages_count: Number(item.qtyInput),
              price_at_sale: Number(item.product.price),
            };
          }
          return {
            product_id: item.product.id,
            qty: Number(item.qtyInput),
            price_at_sale: Number(item.product.price),
          };
        }),
      });

      const total = formatPrice(cartTotal);
      clearCart();
      await loadData();
      setSuccessMessage(`Vente de ${total} F validée avec succès.`);
    } catch (err) {
      setSubmitError(extractApiError(err, 'Échec de la vente.'));
    } finally {
      setIsSubmitting(false);
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
    <><section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-textMain">Point de Vente</h1>
        <p className="text-sm text-textMuted mt-1">
          Magasin&nbsp;: <span className="font-medium text-textMain">{user?.storeName}</span>
        </p>
      </header>

      {bootError && (
        <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
          {bootError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <div className="bg-surface border border-borderLight space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-textMain">Catalogue</h2>
            {!isBootLoading && (
              <span className="text-xs text-textMuted">
                {filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher par nom ou SKU…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={`${inputCls} flex-1 min-w-0`}
              aria-label="Rechercher un produit"
              autoFocus
            />
            <select
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setPage(1);
              }}
              className={`${inputCls} shrink-0`}
              aria-label="Trier par"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>{SORT_LABELS[key]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setSortDir((current) => current === 'asc' ? 'desc' : 'asc');
                setPage(1);
              }}
              className="shrink-0 px-2 py-2 border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary transition-colors"
              aria-label={sortDir === 'asc' ? 'Tri croissant — passer en décroissant' : 'Tri décroissant — passer en croissant'}
            >
              {sortDir === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          {isBootLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-24 bg-borderLight rounded animate-pulse" />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="text-sm text-textMuted py-4 text-center">Aucun produit trouvé.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visibleProducts.map((row) => {
                const outOfStock = row.stock_physical <= 0;
                const isLoadingFormats = loadingFormatIds.includes(row.product.id);
                return (
                  <button
                    key={row.product_id}
                    type="button"
                    onClick={() => void addToCart(row)}
                    disabled={outOfStock || isLoadingFormats}
                    aria-label={`Ajouter ${row.product.name} au panier`}
                    className={[
                      'flex flex-col gap-1 p-3 border rounded text-left transition-colors',
                      outOfStock
                        ? 'border-borderLight bg-background opacity-50 cursor-not-allowed'
                        : 'border-borderLight bg-background hover:border-primary hover:bg-primary/10 cursor-pointer',
                    ].join(' ')}
                  >
                    <span className="text-sm font-medium text-textMain leading-tight line-clamp-2">{row.product.name}</span>
                    <span className="text-xs text-textMuted">{row.product.sku}</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-primary">{formatPrice(row.product.price)} F</span>
                      <span className={`text-xs ${outOfStock ? 'text-red-500' : 'text-textMuted'}`}>
                        {isLoadingFormats ? 'Formats…' : outOfStock ? 'Rupture' : `Stock ${row.stock_physical}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {!isBootLoading && totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Précédent
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, index) => index + 1)
                  .filter((item) => item === 1 || item === totalPages || Math.abs(item - safePage) <= 1)
                  .reduce<(number | '…')[]>((acc, item, index, arr) => {
                    if (index > 0 && item - (arr[index - 1] as number) > 1) acc.push('…');
                    acc.push(item);
                    return acc;
                  }, [])
                  .map((item, index) => item === '…' ? (
                    <span key={`ellipsis-${index}`} className="px-1 text-xs text-textMuted select-none">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setPage(item as number)}
                      className={[
                        'w-7 h-7 text-xs rounded border transition-colors',
                        safePage === item
                          ? 'bg-primary text-white border-primary font-medium'
                          : 'border-borderLight text-textMuted hover:text-textMain hover:border-primary',
                      ].join(' ')}
                    >
                      {item}
                    </button>
                  ))}
              </div>

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>

        <div className="bg-surface border border-borderLight p-4 space-y-4 sticky top-4">
          <h2 className="text-lg font-medium text-textMain">Panier</h2>

          {successMessage && (
            <div className="rounded border border-green-200 bg-green-50 text-green-700 text-sm px-3 py-2">
              {successMessage}
            </div>
          )}

          {submitError && (
            <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
              {submitError}
            </div>
          )}

          <NewClientSelector onClientPayloadChange={setClientPayload} />

          {cart.length === 0 ? (
            <p className="text-sm text-textMuted py-4 text-center">Cliquez sur un produit pour l&apos;ajouter.</p>
          ) : (
            <>
              <ul className="space-y-3" aria-label="Articles dans le panier">
                {cart.map((item) => {
                  const selectedFormat = getFormatForItem(item);
                  const maxAmount = getMaxAmountForItem(item);
                  const requestedUnits = getRequestedUnits(item);
                  const lineTotal = Number(item.product.price) * requestedUnits;
                  return (
                    <li key={item.cartId} className="border border-borderLight rounded p-3 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-textMain">{item.product.name}</p>
                          <p className="text-xs text-textMuted">
                            {formatPrice(item.product.price)} F/{item.product.unit} · stock {item.stock}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.cartId)}
                          className="text-textMuted hover:text-red-600 transition-colors"
                          aria-label={`Retirer ${item.product.name}`}
                        >
                          ×
                        </button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-[1fr_90px_28px]">
                        <select
                          value={item.selectedFormatId}
                          onChange={(e) => updateCartItem(item.cartId, (current) => ({
                            ...current,
                            selectedFormatId: e.target.value,
                            qtyInput: '1',
                          }))}
                          className={`${inputCls} w-full`}
                        >
                          {item.formats.length === 0 ? <option value="">Unité simple</option> : null}
                          {item.formats.map((format) => {
                            const maxForFormat = Math.floor(item.stock / format.units_per_package);
                            return (
                              <option key={format.id} value={format.id} disabled={maxForFormat <= 0}>
                                {format.label} {format.units_per_package > 1 ? `(x${format.units_per_package})` : ''}
                              </option>
                            );
                          })}
                        </select>

                        <input
                          type="number"
                          min={1}
                          max={Math.max(maxAmount, 1)}
                          value={item.qtyInput}
                          onChange={(e) => updateCartItem(item.cartId, (current) => ({
                            ...current,
                            qtyInput: sanitizePositiveIntegerInput(e.target.value),
                          }))}
                          className={`${inputCls} w-full text-right`}
                        />
                        {item.formats.length >= 2 && (
                          <button
                            type="button"
                            onClick={() => setConversionForPos({
                              productId: item.product.id,
                              productName: item.product.name,
                              toFormatId: item.selectedFormatId,
                            })}
                            className="h-10 w-7 border border-borderLight rounded text-textMuted hover:text-primary hover:border-primary flex items-center justify-center text-sm"
                            aria-label="Convertir un conditionnement"
                            title="Convertir un conditionnement"
                          >
                            ⇄
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-textMuted">
                          {selectedFormat ? `${item.qtyInput || 0} ${selectedFormat.label.toLowerCase()} → ${requestedUnits} unités` : `${requestedUnits} unités`}
                        </span>
                        <span className={requestedUnits > item.stock ? 'text-red-600' : 'text-textMuted'}>
                          max {maxAmount}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-textMuted">Sous-total</span>
                        <span className="text-sm font-semibold text-textMain">{formatPrice(lineTotal)} F</span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-semibold text-textMain">Total</span>
                <span className="text-lg font-bold text-primary">{formatPrice(cartTotal)} F</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-textMuted" htmlFor="payment-method">
                  Mode de règlement
                </label>
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className={`${inputCls} w-full`}
                >
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((key) => (
                    <option key={key} value={key}>{PAYMENT_LABELS[key]}</option>
                  ))}
                </select>
              </div>

              <form onSubmit={submitSale} className="space-y-2" noValidate>
                <Button type="submit" className="w-full" isLoading={isSubmitting} disabled={cart.length === 0}>
                  Valider la vente
                </Button>
                <Button type="button" variant="secondary" className="w-full" onClick={clearCart} disabled={isSubmitting}>
                  Vider le panier
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      <hr className="border-borderLight" />

      <TransactionsList />
    </section>

      <ConversionDialog
        isOpen={conversionForPos !== null}
        storeId={user?.storeId ?? ''}
        productId={conversionForPos?.productId ?? ''}
        productName={conversionForPos?.productName}
        prefillToFormatId={conversionForPos?.toFormatId}
        reasonHint="Conversion pour vente au comptoir"
        onClose={() => setConversionForPos(null)}
        onSuccess={() => {
          setConversionForPos(null);
          void loadData();
        }}
      />
    </>
  );
}
