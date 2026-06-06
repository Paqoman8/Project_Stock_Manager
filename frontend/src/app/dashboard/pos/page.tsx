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


// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type SortKey = 'name' | 'price' | 'stock';
type SortDir = 'asc' | 'desc';

type Product = {
  id:        string;
  name:      string;
  sku:       string;
  price:     string;
  unit:      string;
  is_active: boolean;
};

type InventoryRow = {
  product_id:     string;
  stock_physical: number;
};

type CartItem = {
  product: Product;
  qty:     number;
};


// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

const PAGE_SIZE = 30;

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

const SORT_LABELS: Record<SortKey, string> = {
  name:  'Nom',
  price: 'Prix',
  stock: 'Stock',
};


// ---------------------------------------------------------------------------
// PAGE COMPONENT
// ---------------------------------------------------------------------------

export default function PosPage() {
  const router = useRouter();
  const { user, isLoading } = useSession();

  // ── Data
  const [products, setProducts]   = useState<Product[]>([]);
  const [stockMap, setStockMap]   = useState<Map<string, number>>(new Map());

  // ── Cart
  const [cart, setCart]                     = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod]   = useState<PaymentMethod>('CASH');

  // ── Catalog controls
  const [search, setSearch]   = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage]       = useState(1);

  // ── UI state
  const [isBootLoading, setIsBootLoading]   = useState(true);
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [bootError, setBootError]           = useState<string | null>(null);
  const [submitError, setSubmitError]       = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canAccess = !isLoading && user !== null &&
    POS_ROLES.includes(user.roleName as (typeof POS_ROLES)[number]);

  useEffect(() => {
    if (!isLoading && !canAccess) router.replace('/dashboard');
  }, [canAccess, isLoading, router]);

  // ── Load catalog + stock in parallel
  const loadData = useCallback(async () => {
    if (!user) return;
    setIsBootLoading(true);
    setBootError(null);
    try {
      const [productsRes, inventoryRes] = await Promise.all([
        apiClient.get<{ success: boolean; products: Product[] }>('/api/products'),
        apiClient.get<{ success: boolean; inventory: InventoryRow[] }>('/api/inventory', {
          params: { store_id: user.storeId },
        }),
      ]);
      setProducts((productsRes.data?.products ?? []).filter((p) => p.is_active));
      setStockMap(new Map(
        (inventoryRes.data?.inventory ?? []).map((r) => [r.product_id, r.stock_physical]),
      ));
    } catch (err) {
      setBootError(extractApiError(err, 'Impossible de charger le catalogue.'));
    } finally {
      setIsBootLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!canAccess || !user) return;
    void loadData();
  }, [canAccess, user, loadData]);

  // ── Reset page when filter or sort changes
  useEffect(() => { setPage(1); }, [search, sortKey, sortDir]);

  // ── Derived: filter + sort + paginate
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : products;

    return [...base].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name')  cmp = a.name.localeCompare(b.name, 'fr');
      if (sortKey === 'price') cmp = Number(a.price) - Number(b.price);
      if (sortKey === 'stock') cmp = (stockMap.get(a.id) ?? 0) - (stockMap.get(b.id) ?? 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, search, sortKey, sortDir, stockMap]);

  const totalPages     = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage       = Math.min(page, totalPages);
  const visibleProducts = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Cart total
  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.price) * item.qty, 0),
    [cart],
  );

  // ── Cart actions
  function addToCart(product: Product): void {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
    setSubmitError(null);
    setSuccessMessage(null);
  }

  function updateCartQty(productId: string, qty: number): void {
    if (qty <= 0) { removeFromCart(productId); return; }
    setCart((prev) => prev.map((i) => i.product.id === productId ? { ...i, qty } : i));
  }

  function removeFromCart(productId: string): void {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function clearCart(): void {
    setCart([]);
    setPaymentMethod('CASH');
  }

  // ── Submit sale
  async function submitSale(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      await apiClient.post('/api/transactions', {
        payment_method: paymentMethod,
        items: cart.map((item) => ({
          product_id:    item.product.id,
          qty:           item.qty,
          price_at_sale: Number(item.product.price),
        })),
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

        {/* ── CATALOGUE ────────────────────────────────────────────────────── */}
        <div className="bg-surface border border-borderLight space-y-3 p-4">

          {/* Title + count */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-textMain">Catalogue</h2>
            {!isBootLoading && (
              <span className="text-xs text-textMuted">
                {filteredProducts.length} produit{filteredProducts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Search + sort toolbar */}
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher par nom ou SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} flex-1 min-w-0`}
              aria-label="Rechercher un produit"
              autoFocus
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={`${inputCls} shrink-0`}
              aria-label="Trier par"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>{SORT_LABELS[k]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
              className="shrink-0 px-2 py-2 border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary transition-colors"
              aria-label={sortDir === 'asc' ? 'Tri croissant — passer en décroissant' : 'Tri décroissant — passer en croissant'}
            >
              {sortDir === 'asc' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 5v14M5 12l7 7 7-7" />
                </svg>
              )}
            </button>
          </div>

          {/* Product grid */}
          {isBootLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 bg-borderLight rounded animate-pulse" />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <p className="text-sm text-textMuted py-4 text-center">Aucun produit trouvé.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visibleProducts.map((product) => {
                const stock      = stockMap.get(product.id) ?? 0;
                const inCart     = cart.find((i) => i.product.id === product.id);
                const outOfStock = stock <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => !outOfStock && addToCart(product)}
                    disabled={outOfStock}
                    aria-label={`Ajouter ${product.name} au panier`}
                    className={[
                      'flex flex-col gap-1 p-3 border rounded text-left transition-colors',
                      outOfStock
                        ? 'border-borderLight bg-background opacity-50 cursor-not-allowed'
                        : inCart
                          ? 'border-primary bg-primary/10 cursor-pointer'
                          : 'border-borderLight bg-background hover:border-primary hover:bg-primary/10 cursor-pointer',
                    ].join(' ')}
                  >
                    <span className="text-sm font-medium text-textMain leading-tight line-clamp-2">
                      {product.name}
                    </span>
                    <span className="text-xs text-textMuted">{product.sku}</span>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-semibold text-primary">
                        {formatPrice(product.price)} F
                      </span>
                      <span className={`text-xs ${outOfStock ? 'text-red-500' : 'text-textMuted'}`}>
                        {outOfStock ? 'Rupture' : `Stock ${stock}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {!isBootLoading && totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ← Précédent
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '…' ? (
                      <span key={`ell-${i}`} className="px-1 text-xs text-textMuted select-none">…</span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p as number)}
                        className={[
                          'w-7 h-7 text-xs rounded border transition-colors',
                          safePage === p
                            ? 'bg-primary text-white border-primary font-medium'
                            : 'border-borderLight text-textMuted hover:text-textMain hover:border-primary',
                        ].join(' ')}
                      >
                        {p}
                      </button>
                    ),
                  )}
              </div>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-3 py-1.5 text-xs border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Suivant →
              </button>
            </div>
          )}
        </div>

        {/* ── PANIER ───────────────────────────────────────────────────────── */}
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

          {cart.length === 0 ? (
            <p className="text-sm text-textMuted py-4 text-center">
              Cliquez sur un produit pour l'ajouter.
            </p>
          ) : (
            <>
              <ul className="space-y-2" aria-label="Articles dans le panier">
                {cart.map((item) => {
                  const lineTotal = Number(item.product.price) * item.qty;
                  const maxQty    = stockMap.get(item.product.id) ?? 0;
                  return (
                    <li
                      key={item.product.id}
                      className="flex items-center gap-2 py-2 border-b border-borderLight last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-textMain truncate">{item.product.name}</p>
                        <p className="text-xs text-textMuted">
                          {formatPrice(item.product.price)} F/{item.product.unit}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        max={maxQty}
                        value={item.qty}
                        onChange={(e) => updateCartQty(item.product.id, Number(e.target.value))}
                        className={`${inputCls} w-16 text-right`}
                        aria-label={`Quantité ${item.product.name}`}
                      />
                      <span className="text-sm font-medium text-textMain w-20 text-right shrink-0">
                        {formatPrice(lineTotal)} F
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.product.id)}
                        aria-label={`Retirer ${item.product.name}`}
                        className="text-textMuted hover:text-red-600 transition-colors shrink-0"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
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

              <form onSubmit={submitSale} className="space-y-2">
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
    </section>
  );
}
