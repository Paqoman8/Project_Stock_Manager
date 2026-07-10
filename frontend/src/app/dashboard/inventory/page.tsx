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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface BreakdownRow {
  id:                  string;
  packaging_format_id: string;
  quantity:            number;
  packaging_format:    { id: string; label: string; units_per_package: number; is_base_unit: boolean };
}

interface PackagingFormat {
  id:                string;
  label:             string;
  units_per_package: number;
  is_base_unit:      boolean;
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-thresholds-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="modal-thresholds-title" className="text-base font-medium text-textMain">
            Seuils d'alerte
          </h2>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Contexte */}
            <div className="text-sm text-textMuted space-y-0.5 bg-background rounded px-3 py-2 border border-borderLight">
              <p>
                <span className="font-medium text-textMain">{row.product.name}</span>
                {' · '}
                <span className="font-mono text-xs">{row.product.sku}</span>
              </p>
              <p>
                Établissement :{' '}
                <span className="font-medium" style={{ color: row.store.color }}>
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
            <div className="flex flex-col gap-1">
              <label htmlFor="stock-min" className="text-xs font-medium text-textSecondary">
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
              <p className="text-xs text-textMuted">
                Une alerte s'affiche quand le stock physique est ≤ à ce seuil (0 = désactivé).
              </p>
            </div>

            {/* stock_reorder */}
            <div className="flex flex-col gap-1">
              <label htmlFor="stock-reorder" className="text-xs font-medium text-textSecondary">
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
              <p className="text-xs text-textMuted">
                Indicatif : quantité à partir de laquelle une commande doit être passée.
              </p>
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Pied fixe */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
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
  stores,
  onClose,
  onSaved,
}: {
  row?:    InventoryRow | null; // si fourni, pré-sélectionne produit+magasin
  stores:  StoreOption[];
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

  // Produits disponibles quand row est absent
  const [products, setProducts] = useState<{ id: string; name: string; sku: string }[]>([]);

  // Combobox de sélection produit (mode sans row)
  const [productSearch,       setProductSearch]       = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productComboRef = useRef<HTMLDivElement>(null);

  // Formats de conditionnement
  const [formats,         setFormats]         = useState<PackagingFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  const [packagesCount,   setPackagesCount]   = useState('');

  const selectedFormat = formats.find((f) => f.id === selectedFormatId) ?? null;
  const previewUnits   = selectedFormat && packagesCount
    ? (parseInt(packagesCount, 10) || 0) * selectedFormat.units_per_package
    : null;

  const needsReason = type === 'ADJUSTMENT_IN' || type === 'ADJUSTMENT_OUT';

  // Charger la liste des produits si row est absent (mode sans pré-sélection)
  useEffect(() => {
    if (row) return;
    apiClient.get('/api/products')
      .then(({ data }) => setProducts(data.products ?? []))
      .catch(() => {});
  }, [row]);

  // Fermer le dropdown produit si clic en dehors
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (productComboRef.current && !productComboRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Résultats filtrés pour le combobox (max 10)
  const filteredProductsForCombo = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products.slice(0, 10);
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 10);
  }, [products, productSearch]);

  function handleProductSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setProductSearch(e.target.value);
    setProductId('');
    setShowProductDropdown(true);
  }

  function handleSelectProduct(p: { id: string; name: string; sku: string }) {
    setProductId(p.id);
    setProductSearch(`${p.name} (${p.sku})`);
    setShowProductDropdown(false);
  }

  function handleClearProduct() {
    setProductId('');
    setProductSearch('');
    setShowProductDropdown(false);
  }

  // Charger les formats dès qu'un produit est connu
  useEffect(() => {
    const pid = row?.product_id ?? productId;
    if (!pid) { setFormats([]); setSelectedFormatId(''); return; }
    apiClient.get(`/api/products/${pid}/packaging-formats`)
      .then(({ data }) => {
        const fmts = data.formats as PackagingFormat[];
        setFormats(fmts);
        // Pré-sélectionner l'unité de base si disponible
        const base = fmts.find((f) => f.is_base_unit);
        setSelectedFormatId(base?.id ?? '');
      })
      .catch(() => setFormats([]));
  }, [row?.product_id, productId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation store/product quand row est absent
    if (!row && (!storeId || !productId)) {
      setError('Veuillez sélectionner un établissement et un produit.');
      return;
    }

    if (selectedFormatId) {
      // Mode avec format : packages_count obligatoire
      const count = parseInt(packagesCount, 10);
      if (isNaN(count) || count <= 0) {
        setError('Le nombre de colis doit être un entier positif.');
        return;
      }
    } else {
      // Mode sans format : qty obligatoire
      const qtyNum = parseInt(qty, 10);
      if (isNaN(qtyNum) || qtyNum <= 0) {
        setError('La quantité doit être un entier positif.');
        return;
      }
    }

    if (needsReason && !reason.trim()) {
      setError('Un motif est obligatoire pour les ajustements.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        store_id:   storeId   || undefined,
        product_id: productId || undefined,
        type,
        reason: reason.trim() || undefined,
      };

      if (selectedFormatId) {
        body.packaging_format_id = selectedFormatId;
        body.packages_count      = parseInt(packagesCount, 10);
      } else {
        body.qty = parseInt(qty, 10);
      }

      await apiClient.post('/api/stock-movements', body);
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Impossible d\'enregistrer le mouvement.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-movement-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="modal-movement-title" className="text-base font-medium text-textMain">
            Mouvement de stock
          </h2>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Contexte si pré-sélectionné */}
            {row ? (
              <div className="text-sm text-textMuted bg-background rounded px-3 py-2 space-y-0.5 border border-borderLight">
                <p><span className="font-medium text-textMain">{row.product.name}</span> · <span className="font-mono text-xs">{row.product.sku}</span></p>
                <p>Établissement : <span className="font-medium" style={{ color: row.store.color }}>{row.store.name}</span></p>
                <p>Stock actuel : <span className="font-medium text-textMain">{row.stock_physical} {UNIT_LABELS[row.product.unit] ?? row.product.unit}</span></p>
              </div>
            ) : (
              <>
                {/* Sélecteur magasin */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-textSecondary">Établissement <span className="text-red-500">*</span></label>
                  <select
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    className={inputCls}
                    required
                  >
                    <option value="">— Sélectionner un établissement —</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {/* Sélecteur produit — combobox avec recherche */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="mv-product-search" className="text-xs font-medium text-textSecondary">
                    Produit <span className="text-red-500">*</span>
                  </label>
                  <div className="relative" ref={productComboRef}>
                    <input
                      id="mv-product-search"
                      type="text"
                      autoComplete="off"
                      value={productSearch}
                      onFocus={() => setShowProductDropdown(true)}
                      onChange={handleProductSearchChange}
                      placeholder="Rechercher un produit par nom ou SKU…"
                      className={inputCls + ' pr-8'}
                      aria-autocomplete="list"
                      aria-expanded={showProductDropdown}
                    />
                    {/* Bouton effacer */}
                    {(productId || productSearch) && (
                      <button
                        type="button"
                        onClick={handleClearProduct}
                        aria-label="Effacer la sélection"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    {/* Dropdown */}
                    {showProductDropdown && (
                      <ul
                        role="listbox"
                        aria-label="Résultats de recherche produit"
                        className="absolute z-20 w-full mt-1 bg-surface border border-borderLight rounded shadow-lg max-h-52 overflow-y-auto"
                      >
                        {filteredProductsForCombo.length === 0 ? (
                          <li className="px-3 py-3 text-sm text-textMuted">
                            Aucun produit trouvé{productSearch ? ` pour "${productSearch}"` : ''}.
                          </li>
                        ) : (
                          filteredProductsForCombo.map((p) => (
                            <li
                              key={p.id}
                              role="option"
                              aria-selected={productId === p.id}
                              onMouseDown={(e) => { e.preventDefault(); handleSelectProduct(p); }}
                              className={[
                                'px-3 py-2 cursor-pointer text-sm flex items-center justify-between gap-2 transition-colors',
                                productId === p.id
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-background text-textMain',
                              ].join(' ')}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-xs text-textMuted shrink-0 font-mono">{p.sku}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                  {/* Confirmation produit sélectionné */}
                  {productId && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      Produit sélectionné
                    </p>
                  )}
                </div>
              </>
            )}

            {/* Type */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Type de mouvement</label>
              <select value={type} onChange={(e) => setType(e.target.value as MovementType)} className={inputCls}>
                {(Object.entries(MOVEMENT_TYPE_LABELS) as [MovementType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Format de conditionnement */}
            {formats.length > 0 && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">Format de conditionnement</label>
                <select
                  value={selectedFormatId}
                  onChange={(e) => { setSelectedFormatId(e.target.value); setQty(''); setPackagesCount(''); }}
                  className={inputCls}
                >
                  <option value="">— Sans format (unités brutes) —</option>
                  {formats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label} (×{f.units_per_package}{f.is_base_unit ? ' — base' : ''})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Quantité — mode avec format */}
            {selectedFormatId ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">
                  Nombre de colis{selectedFormat ? ` (${selectedFormat.label})` : ''}
                </label>
                <input
                  type="number" value={packagesCount}
                  onChange={(e) => setPackagesCount(e.target.value)}
                  className={inputCls} placeholder="ex. 2"
                />
                {previewUnits !== null && previewUnits > 0 && (
                  <p className="text-xs text-textMuted">
                    = <span className="font-medium text-textMain">{previewUnits}</span> unité{previewUnits > 1 ? 's' : ''} de base
                  </p>
                )}
              </div>
            ) : (
              /* Quantité — mode sans format */
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">Quantité (unités de base)</label>
                <input
                  type="number" value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className={inputCls} placeholder="ex. 50"
                />
              </div>
            )}

            {/* Motif (obligatoire pour ajustements) */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">
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
              <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">{error}</p>
            )}
          </div>

          {/* Pied fixe */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : conversion inter-formats
// ---------------------------------------------------------------------------

function FormatConversionModal({
  row,
  onClose,
  onSaved,
}: {
  row:     InventoryRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formats,          setFormats]          = useState<PackagingFormat[]>([]);
  const [breakdowns,       setBreakdowns]       = useState<BreakdownRow[]>([]);
  const [fromFormatId,     setFromFormatId]     = useState('');
  const [fromPackages,     setFromPackages]     = useState('');
  const [toFormatId,       setToFormatId]       = useState('');
  const [toPackages,       setToPackages]       = useState('');
  const [reason,           setReason]           = useState('');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get(`/api/products/${row.product_id}/packaging-formats`),
      apiClient.get(`/api/inventory/${row.store_id}/${row.product_id}/breakdown`),
    ]).then(([fmtRes, bdRes]) => {
      setFormats(fmtRes.data.formats as PackagingFormat[]);
      setBreakdowns(bdRes.data.breakdown as BreakdownRow[]);
    }).catch(() => {});
  }, [row.product_id, row.store_id]);

  const fromFmt  = formats.find((f) => f.id === fromFormatId) ?? null;
  const toFmt    = formats.find((f) => f.id === toFormatId)   ?? null;
  const fromBd   = breakdowns.find((b) => b.packaging_format_id === fromFormatId);

  // Auto-compute toPackages when from side changes
  useEffect(() => {
    if (!fromFmt || !toFmt || !fromPackages) { setToPackages(''); return; }
    const n = parseInt(fromPackages, 10);
    if (isNaN(n) || n <= 0) { setToPackages(''); return; }
    const totalUnits  = n * fromFmt.units_per_package;
    const toPkgs      = totalUnits / toFmt.units_per_package;
    if (Number.isInteger(toPkgs) && toPkgs > 0) setToPackages(String(toPkgs));
    else setToPackages('');
  }, [fromFormatId, fromPackages, toFormatId, fromFmt, toFmt]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fromFormatId || !toFormatId) { setError('Veuillez sélectionner les deux formats.'); return; }
    if (fromFormatId === toFormatId)   { setError('Le format source et la destination doivent être différents.'); return; }

    const fromCount = parseInt(fromPackages, 10);
    const toCount   = parseInt(toPackages, 10);
    if (isNaN(fromCount) || fromCount <= 0) { setError('Nombre de colis source invalide.'); return; }
    if (isNaN(toCount)   || toCount   <= 0) { setError('Nombre de colis destination invalide.'); return; }
    if (!reason.trim()) { setError('Le motif est obligatoire.'); return; }

    setSaving(true);
    try {
      await apiClient.post('/api/stock-movements/convert', {
        store_id:                 row.store_id,
        product_id:               row.product_id,
        from_packaging_format_id: fromFormatId,
        from_packages_count:      fromCount,
        to_packaging_format_id:   toFormatId,
        to_packages_count:        toCount,
        reason:                   reason.trim(),
      });
      onSaved();
    } catch (err) {
      setError(extractApiError(err, 'Impossible d\'enregistrer la conversion.'));
    } finally {
      setSaving(false);
    }
  }

  const availableFromFormats = formats.filter((f) =>
    breakdowns.some((b) => b.packaging_format_id === f.id && b.quantity > 0)
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-conversion-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="modal-conversion-title" className="text-base font-medium text-textMain">
            Conversion inter-formats
          </h2>
          <button onClick={onClose} className="text-textMuted hover:text-textMain transition-colors text-lg leading-none" aria-label="Fermer">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto flex-1">
            {/* Contexte */}
            <div className="text-sm text-textMuted bg-background rounded px-3 py-2 space-y-0.5 border border-borderLight">
              <p><span className="font-medium text-textMain">{row.product.name}</span> · <span className="font-mono text-xs">{row.product.sku}</span></p>
              <p>Établissement : <span className="font-medium" style={{ color: row.store.color }}>{row.store.name}</span></p>
            </div>

            {/* Format source */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Format source <span className="text-red-500">*</span></label>
              <select value={fromFormatId} onChange={(e) => { setFromFormatId(e.target.value); setFromPackages(''); }} className={inputCls}>
                <option value="">— Sélectionner un format —</option>
                {availableFromFormats.map((f) => {
                  const bd = breakdowns.find((b) => b.packaging_format_id === f.id);
                  return (
                    <option key={f.id} value={f.id}>
                      {f.label} — {bd?.quantity ?? 0} colis disponibles
                    </option>
                  );
                })}
              </select>
              {fromBd && fromFormatId && (
                <p className="text-xs text-textMuted">
                  Stock actuel : <span className="font-medium text-textMain">{fromBd.quantity}</span> colis
                  = <span className="font-medium text-textMain">{fromBd.quantity * fromBd.packaging_format.units_per_package}</span> unités
                </p>
              )}
            </div>

            {/* Qté source */}
            {fromFormatId && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">
                  Nombre de colis à convertir ({fromFmt?.label}) <span className="text-red-500">*</span>
                </label>
                <input type="number" value={fromPackages}
                  onChange={(e) => setFromPackages(e.target.value)} className={inputCls} placeholder="ex. 1" />
                {fromFmt && fromPackages && !isNaN(parseInt(fromPackages)) && (
                  <p className="text-xs text-textMuted">
                    = <span className="font-medium text-textMain">{parseInt(fromPackages) * fromFmt.units_per_package}</span> unités de base
                  </p>
                )}
              </div>
            )}

            {/* Format destination */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Format destination <span className="text-red-500">*</span></label>
              <select value={toFormatId} onChange={(e) => setToFormatId(e.target.value)} className={inputCls}>
                <option value="">— Sélectionner un format —</option>
                {formats.filter((f) => f.id !== fromFormatId).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label} (×{f.units_per_package} unités)
                  </option>
                ))}
              </select>
            </div>

            {/* Qté destination — calculée, non modifiable */}
            {toFormatId && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-textSecondary">
                  Nombre de colis obtenus ({toFmt?.label})
                </label>
                {toPackages ? (
                  <>
                    <div className={inputCls + ' bg-background opacity-70 cursor-not-allowed select-none'}>
                      {toPackages}
                    </div>
                    <p className="text-xs text-textMuted">
                      = <span className="font-medium text-textMain">{parseInt(toPackages) * (toFmt?.units_per_package ?? 1)}</span> unités de base
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
                    Conversion impossible — les unités de base ne se divisent pas entièrement en {toFmt?.label}.
                  </p>
                )}
              </div>
            )}

            {/* Motif obligatoire */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Motif <span className="text-red-500">*</span></label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                className={inputCls} placeholder="ex. Reconditionnement en cartons…" />
            </div>

            {error && (
              <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">{error}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2 flex-shrink-0">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Conversion…' : 'Convertir'}</Button>
          </div>
        </form>
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

  // Modale conversion inter-formats
  const [conversionRow, setConversionRow] = useState<InventoryRow | null>(null);

  // Ventilation par format — clé : "storeId-productId"
  const [expandedKeys, setExpandedKeys]   = useState<Set<string>>(new Set());
  const [breakdownData, setBreakdownData] = useState<Record<string, BreakdownRow[]>>({});
  const [breakdownLoading, setBreakdownLoading] = useState<Set<string>>(new Set());

  function toggleBreakdown(row: InventoryRow) {
    const key = `${row.store_id}-${row.product_id}`;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); return next; }
      next.add(key);
      return next;
    });
    // Charger les données seulement si pas encore chargées
    if (!breakdownData[key]) {
      setBreakdownLoading((prev) => new Set(prev).add(key));
      apiClient.get(`/api/inventory/${row.store_id}/${row.product_id}/breakdown`)
        .then(({ data }) => {
          setBreakdownData((prev) => ({ ...prev, [key]: data.breakdown as BreakdownRow[] }));
        })
        .catch(() => {
          setBreakdownData((prev) => ({ ...prev, [key]: [] }));
        })
        .finally(() => {
          setBreakdownLoading((prev) => { const next = new Set(prev); next.delete(key); return next; });
        });
    }
  }

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

  // Chargement des établissements accessibles à l'utilisateur courant
  // On utilise /api/auth/accessible-stores pour respecter les droits (SA voit tout,
  // Admin voit uniquement ses magasins assignés).
  useEffect(() => {
    apiClient.get('/api/auth/accessible-stores').then(({ data }) => {
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
                <th className="px-4 py-3 font-medium text-textMuted">Ventilation</th>
                {(canEdit || canMove) && (
                  <th className="px-4 py-3 font-medium text-textMuted">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-borderLight">
              {loading ? (
                <SkeletonRows cols={(canEdit || canMove) ? 10 : 9} />
              ) : inventory.length === 0 ? (
                <tr>
                  <td
                    colSpan={(canEdit || canMove) ? 10 : 9}
                    className="px-4 py-8 text-center text-sm text-textMuted"
                  >
                    Aucune entrée d'inventaire.
                  </td>
                </tr>
              ) : (
                inventory.map((row) => {
                  const available  = row.stock_physical - row.stock_reserved;
                  const isLow      = row.stock_min > 0 && row.stock_physical <= row.stock_min;
                  const unit       = UNIT_LABELS[row.product.unit] ?? row.product.unit;
                  const key        = `${row.store_id}-${row.product_id}`;
                  const isExpanded = expandedKeys.has(key);
                  const breakdown  = breakdownData[key] ?? [];
                  const isLoadingBreakdown = breakdownLoading.has(key);
                  const colSpan    = (canEdit || canMove) ? 10 : 9;

                  return (
                    <React.Fragment key={key}>
                    <tr
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

                      {/* Bouton ventilation */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleBreakdown(row)}
                          className="text-xs text-primary hover:underline focus:outline-none flex items-center gap-1"
                          aria-expanded={isExpanded}
                          aria-label="Afficher la ventilation par format"
                        >
                          <svg
                            width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                            className={['transition-transform', isExpanded ? 'rotate-90' : ''].join(' ')}
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          {isExpanded ? 'Masquer' : 'Voir'}
                        </button>
                      </td>

                      {/* Actions */}
                      {(canEdit || canMove) && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {canMove && (
                              <>
                                <Button variant="secondary" size="sm" onClick={() => setMovementRow(row)}>
                                  Mouvement
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setConversionRow(row)}>
                                  Conversion
                                </Button>
                              </>
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

                    {/* Panneau de ventilation */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={colSpan} className="px-0 py-0 bg-background/40">
                          <div className="px-8 py-3 border-t border-borderLight">
                            {isLoadingBreakdown ? (
                              <p className="text-xs text-textMuted">Chargement…</p>
                            ) : breakdown.length === 0 ? (
                              <p className="text-xs text-textMuted italic">
                                Aucune ventilation enregistrée. Les prochains mouvements avec un format mettront à jour cette vue.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-3">
                                {breakdown.map((b) => (
                                  <div
                                    key={b.id}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-borderLight rounded text-sm"
                                  >
                                    {b.packaging_format.is_base_unit && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" aria-hidden="true" />
                                    )}
                                    <span className="font-medium text-textMain">{b.quantity}</span>
                                    <span className="text-textMuted">{b.packaging_format.label}</span>
                                    <span className="text-xs text-textMuted/60">
                                      = {b.quantity * b.packaging_format.units_per_package} {unit}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
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

      {/* Modale mouvement de stock */}
      {movementRow !== undefined && (
        <StockMovementModal
          row={movementRow}
          stores={stores}
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

      {/* Modale conversion inter-formats */}
      {conversionRow && (
        <FormatConversionModal
          row={conversionRow}
          onClose={() => setConversionRow(null)}
          onSaved={() => {
            setConversionRow(null);
            // Invalider le cache des breakdowns pour recharger après conversion
            const key = `${conversionRow.store_id}-${conversionRow.product_id}`;
            setBreakdownData((prev) => { const next = { ...prev }; delete next[key]; return next; });
          }}
        />
      )}
    </div>
  );
}
