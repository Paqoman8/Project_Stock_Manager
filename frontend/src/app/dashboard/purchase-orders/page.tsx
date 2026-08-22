// src/app/dashboard/purchase-orders/page.tsx
// Page de gestion des commandes fournisseurs (PurchaseOrder).
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement initial : GET /api/purchase-orders, /api/suppliers, /api/stores
//   - Chargement dynamique des produits fournisseur : GET /api/supplier-products?isActive=true&supplier_id=XXX
//   - Filtrage 100% client-side via useMemo (statut, fournisseur, établissement)
//   - Cinq modales inline : création, édition, envoi, annulation, détail
//
// Accès :
//   - Liste + création : tous les utilisateurs authentifiés
//   - Annulation : SA uniquement (bouton masqué côté UI si non-SA)

'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/Portal';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLE_SA = 'Super Administrateur';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

interface PackagingFormat {
  id: string;
  label: string;
  units_per_package: number;
  is_base_unit: boolean;
}

interface PurchaseOrderItemRow {
  id: string;
  order_id: string;
  supplier_product_id: string;
  ordered_qty: number;
  unit_price: string; // Decimal sérialisé
  packaging_format_id: string | null;
  supplier_product: {
    id: string;
    packaging_format_id: string;
    product: { id: string; name: string; sku: string; unit: string };
    packaging_format: { id: string; label: string; units_per_package: number };
  };
  packaging_format: { id: string; label: string; units_per_package: number } | null;
}

interface PurchaseOrderRow {
  id: string;
  reference: string;
  supplier_id: string;
  destination_store_id: string;
  ordered_by_id: string;
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

interface SupplierOption {
  id: string;
  name: string;
  is_international: boolean;
}

interface StoreOption {
  id: string;
  name: string;
  status: 'ACTIVE' | 'CLOSED';
}

interface SupplierProductOption {
  id: string;
  purchase_price: string;
  packaging_format_id: string;
  min_order_qty: number;
  product: { id: string; name: string; sku: string; unit: string };
  packaging_format: { id: string; label: string; units_per_package: number };
}

// ---------------------------------------------------------------------------
// Labels de statut
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  DRAFT:              'Brouillon',
  SENT:               'Envoyé',
  PARTIALLY_RECEIVED: 'Partiellement reçu',
  RECEIVED:           'Reçu',
  CANCELLED:          'Annulé',
};

// ---------------------------------------------------------------------------
// Helpers visuels
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const variants: Record<PurchaseOrderStatus, string> = {
    DRAFT:              'bg-[#F1F3F5] text-textMuted border-borderLight',
    SENT:               'bg-blue-50 text-blue-700 border-blue-200',
    PARTIALLY_RECEIVED: 'bg-orange-50 text-orange-700 border-orange-200',
    RECEIVED:           'bg-green-50 text-green-700 border-green-200',
    CANCELLED:          'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        variants[status],
      ].join(' ')}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function IconReset() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Lignes skeleton
// ---------------------------------------------------------------------------

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
// Classes communes aux inputs/selects
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

// ---------------------------------------------------------------------------
// Utilitaires de formatage
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function calcTotal(items: PurchaseOrderItemRow[]): string {
  const total = items.reduce(
    (acc, item) => acc + item.ordered_qty * parseFloat(item.unit_price),
    0
  );
  return total.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 });
}

// Extrait le message d'erreur API de façon cohérente
function extractApiError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.message ?? fallback;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Stepper indicator — partagé par les deux modales de commande
// ---------------------------------------------------------------------------

function StepIndicator({
  step,
  onGoToStep1,
  onGoToStep2,
  step2Enabled,
}: {
  step: 1 | 2;
  onGoToStep1: () => void;
  onGoToStep2: () => void;
  step2Enabled: boolean;
}) {
  return (
    <div className="px-6 py-3 border-b border-borderLight flex items-center gap-3 flex-shrink-0">
      <button
        type="button"
        onClick={onGoToStep1}
        className={[
          'flex items-center gap-2 text-xs font-medium transition-colors',
          step === 1 ? 'text-primary' : 'text-textMuted hover:text-textMain',
        ].join(' ')}
      >
        <span
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold shrink-0',
            step === 1 ? 'bg-primary text-white' : 'bg-[#E9ECEF] text-textMuted',
          ].join(' ')}
        >
          1
        </span>
        Informations
      </button>
      <div className="flex-1 h-px bg-borderLight" />
      <button
        type="button"
        onClick={onGoToStep2}
        disabled={!step2Enabled}
        className={[
          'flex items-center gap-2 text-xs font-medium transition-colors',
          step === 2
            ? 'text-primary'
            : step2Enabled
            ? 'text-textMuted hover:text-textMain'
            : 'text-textMuted opacity-40 cursor-default',
        ].join(' ')}
      >
        <span
          className={[
            'inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold shrink-0',
            step === 2 ? 'bg-primary text-white' : 'bg-[#E9ECEF] text-textMuted',
          ].join(' ')}
        >
          2
        </span>
        Produits
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Création de commande
// ---------------------------------------------------------------------------

interface CreateOrderItem {
  supplier_product_id: string;
  ordered_qty: number;
  unit_price: number;
  min_order_qty: number;
  product_name: string;
  product_sku: string;
  product_id: string;
  format_label: string;
  format_units: number;
  packaging_format_id?: string;
}

interface CreateOrderFormData {
  supplier_id: string;
  destination_store_id: string;
  expected_at: string;
  notes: string;
}

function CreateOrderModal({
  isOpen,
  suppliers,
  stores,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  suppliers: SupplierOption[];
  stores: StoreOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const emptyForm: CreateOrderFormData = {
    supplier_id:          '',
    destination_store_id: '',
    expected_at:          '',
    notes:                '',
  };

  const [form, setForm]               = useState<CreateOrderFormData>(emptyForm);
  const [step, setStep]               = useState<1 | 2>(1);
  const [stepError, setStepError]     = useState('');
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductOption[]>([]);
  const [loadingProducts, setLoadingProducts]   = useState(false);
  const [selectedItems, setSelectedItems]       = useState<Map<string, CreateOrderItem>>(new Map());
  const [productSearch, setProductSearch]       = useState('');
  const [showDropdown, setShowDropdown]         = useState(false);
  const [apiError, setApiError]                 = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const firstInputRef = useRef<HTMLSelectElement>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);

  // Réinitialiser au montage de la modale
  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm);
    setStep(1);
    setStepError('');
    setSupplierProducts([]);
    setSelectedItems(new Map());
    setProductSearch('');
    setShowDropdown(false);
    setApiError(null);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Fermeture par Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Charger les produits fournisseur quand le fournisseur change
  useEffect(() => {
    if (!form.supplier_id) {
      setSupplierProducts([]);
      setSelectedItems(new Map());
      setProductSearch('');
      return;
    }
    let cancelled = false;
    setLoadingProducts(true);
    apiClient
      .get<{ success: boolean; supplierProducts: SupplierProductOption[] }>(
        `/api/supplier-products?isActive=true&supplier_id=${form.supplier_id}`
      )
      .then((res) => {
        if (!cancelled) {
          setSupplierProducts(res.data.supplierProducts ?? []);
          setSelectedItems(new Map());
          setProductSearch('');
        }
      })
      .catch(() => {
        if (!cancelled) setSupplierProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });
    return () => { cancelled = true; };
  }, [form.supplier_id]);

  // Produits filtrés selon la recherche (CreateOrderModal)
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? supplierProducts.filter(
          (sp) =>
            sp.product.name.toLowerCase().includes(q) ||
            sp.product.sku.toLowerCase().includes(q)
        )
      : supplierProducts;
    return list.slice(0, 8);
  }, [supplierProducts, productSearch]);

  // Fermer le dropdown si clic en dehors (CreateOrderModal)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleAddProduct(sp: SupplierProductOption) {
    if (selectedItems.has(sp.id)) return;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.set(sp.id, {
        supplier_product_id: sp.id,
        ordered_qty:         sp.min_order_qty,
        unit_price:          parseFloat(sp.purchase_price),
        min_order_qty:       sp.min_order_qty,
        product_name:        sp.product.name,
        product_sku:         sp.product.sku,
        product_id:          sp.product.id,
        format_label:        sp.packaging_format.label,
        format_units:        sp.packaging_format.units_per_package,
        packaging_format_id: sp.packaging_format_id,
      });
      return next;
    });
    setProductSearch('');
    setShowDropdown(false);
  }

  function handleRemoveProduct(spId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.delete(spId);
      return next;
    });
  }

  function handleItemChange(spId: string, field: 'ordered_qty' | 'unit_price', value: number) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const item = next.get(spId);
      if (item) next.set(spId, { ...item, [field]: value });
      return next;
    });
  }

  function handleNextStep() {
    if (!form.supplier_id) {
      setStepError('Veuillez sélectionner un fournisseur.');
      return;
    }
    if (!form.destination_store_id) {
      setStepError('Veuillez sélectionner un établissement de destination.');
      return;
    }
    setStepError('');
    setStep(2);
  }

  // Validation
  function validate(): string | null {
    if (!form.supplier_id)          return 'Veuillez sélectionner un fournisseur.';
    if (!form.destination_store_id) return 'Veuillez sélectionner un établissement de destination.';
    if (selectedItems.size === 0)   return 'Ajoutez au moins une ligne de commande.';
    for (const item of selectedItems.values()) {
      if (item.ordered_qty < item.min_order_qty) {
        return `La quantité de "${item.product_name}" doit être ≥ ${item.min_order_qty}.`;
      }
      if (item.ordered_qty <= 0) {
        return `La quantité de "${item.product_name}" doit être positive.`;
      }
      if (item.unit_price <= 0) {
        return `Le prix unitaire de "${item.product_name}" doit être positif.`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setApiError(validationError);
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    const payload: {
      supplier_id: string;
      destination_store_id: string;
      notes?: string;
      expected_at?: string;
      items: Array<{ supplier_product_id: string; ordered_qty: number; unit_price: number; packaging_format_id?: string }>;
    } = {
      supplier_id:          form.supplier_id,
      destination_store_id: form.destination_store_id,
      items: Array.from(selectedItems.values()).map((item) => ({
        supplier_product_id: item.supplier_product_id,
        ordered_qty:         item.ordered_qty,
        unit_price:          item.unit_price,
        ...(item.packaging_format_id ? { packaging_format_id: item.packaging_format_id } : {}),
      })),
    };
    if (form.notes.trim())     payload.notes       = form.notes.trim();
    if (form.expected_at)      payload.expected_at = new Date(form.expected_at).toISOString();

    try {
      await apiClient.post('/api/purchase-orders', payload);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la création.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  const itemsArray = Array.from(selectedItems.values());

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="create-order-title" className="text-base font-medium text-textMain">
            Créer une commande fournisseur
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        <StepIndicator
          step={step}
          onGoToStep1={() => { setStep(1); setApiError(null); }}
          onGoToStep2={handleNextStep}
          step2Enabled={!!form.supplier_id && !!form.destination_store_id}
        />

        {/* Corps */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto flex-1">

            {/* --- Step 1 : Informations générales --- */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                {/* Fournisseur */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="order-supplier" className="text-xs font-medium text-textSecondary">
                    Fournisseur <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <select
                    ref={firstInputRef}
                    id="order-supplier"
                    value={form.supplier_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, supplier_id: e.target.value }))
                    }
                    className={inputCls}
                    aria-required="true"
                  >
                    <option value="">Sélectionner un fournisseur…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}{s.is_international ? ' (International)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Établissement de destination */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="order-store" className="text-xs font-medium text-textSecondary">
                    Établissement de destination <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="order-store"
                    value={form.destination_store_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, destination_store_id: e.target.value }))
                    }
                    className={inputCls}
                    aria-required="true"
                  >
                    <option value="">Sélectionner un établissement…</option>
                    {stores.filter((s) => s.status === 'ACTIVE').map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date attendue */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="order-expected-at" className="text-xs font-medium text-textSecondary">
                    Date attendue
                  </label>
                  <input
                    id="order-expected-at"
                    type="date"
                    value={form.expected_at}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, expected_at: e.target.value }))
                    }
                    className={inputCls}
                  />
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="order-notes" className="text-xs font-medium text-textSecondary">
                    Notes
                  </label>
                  <textarea
                    id="order-notes"
                    value={form.notes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                    rows={3}
                    placeholder="Instructions de livraison, conditions particulières…"
                    className={inputCls + ' resize-none'}
                  />
                </div>

                {stepError && (
                  <p role="alert" className="text-sm text-danger">{stepError}</p>
                )}
              </div>
            )}

            {/* --- Step 2 : Lignes de commande --- */}
            {step === 2 && (
              <div className="flex flex-col gap-3">

                {/* Champ de recherche + dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <input
                    type="text"
                    placeholder={
                      loadingProducts
                        ? 'Chargement des produits…'
                        : 'Rechercher un produit par nom ou SKU…'
                    }
                    value={productSearch}
                    disabled={loadingProducts}
                    onChange={(e) => { setProductSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    className={inputCls}
                    autoComplete="off"
                  />
                  {showDropdown && !loadingProducts && supplierProducts.length === 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-surface border border-borderLight rounded shadow-lg px-3 py-2.5 text-sm text-textMuted">
                      Aucun produit actif pour ce fournisseur.
                    </div>
                  )}
                  {showDropdown && filteredProducts.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-surface border border-borderLight rounded shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                      {filteredProducts.map((sp) => {
                        const isAdded = selectedItems.has(sp.id);
                        return (
                          <button
                            key={sp.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleAddProduct(sp); }}
                            disabled={isAdded}
                            className={[
                              'w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm',
                              'border-b border-borderLight last:border-0 transition-colors',
                              isAdded
                                ? 'opacity-50 cursor-default bg-background'
                                : 'hover:bg-primary/5 cursor-pointer',
                            ].join(' ')}
                          >
                            <span className="w-4 text-center text-xs text-primary shrink-0">
                              {isAdded ? '✓' : ''}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium text-textMain truncate">
                                {sp.product.name}
                              </span>
                              <span className="text-xs text-textMuted">
                                {sp.product.sku} · {sp.packaging_format.label} · Min. {sp.min_order_qty}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Tableau des lignes de commande */}
                {itemsArray.length > 0 ? (
                  <div className="border border-borderLight rounded overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F1F3F5] text-xs text-textMuted border-b border-borderLight">
                          <th className="px-3 py-2 text-left font-medium">Produit</th>
                          <th className="px-3 py-2 text-left font-medium">Format</th>
                          <th className="px-3 py-2 text-left font-medium">Qté</th>
                          <th className="px-3 py-2 text-left font-medium">Prix unit. (XOF)</th>
                          <th className="px-3 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {itemsArray.map((item, idx) => (
                          <tr
                            key={item.supplier_product_id}
                            className={idx > 0 ? 'border-t border-borderLight' : ''}
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-textMain text-xs leading-snug">
                                {item.product_name}
                              </div>
                              <div className="text-xs text-textMuted">{item.product_sku}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-textMuted whitespace-nowrap">
                              {item.format_label}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step={1}
                                min={item.min_order_qty}
                                value={item.ordered_qty}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.supplier_product_id,
                                    'ordered_qty',
                                    parseInt(e.target.value, 10) || item.min_order_qty
                                  )
                                }
                                className="w-16 px-2 py-1 text-xs border border-borderLight rounded focus:outline-none focus:ring-1 focus:ring-primary text-textMain bg-background"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step={0.01}
                                min={0}
                                value={item.unit_price}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.supplier_product_id,
                                    'unit_price',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-24 px-2 py-1 text-xs border border-borderLight rounded focus:outline-none focus:ring-1 focus:ring-primary text-textMain bg-background"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveProduct(item.supplier_product_id)}
                                className="text-textMuted hover:text-danger transition-colors"
                                aria-label={`Retirer ${item.product_name}`}
                              >
                                <IconReset />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 border-t border-borderLight bg-[#F1F3F5] flex justify-between items-center">
                      <span className="text-xs text-textMuted">
                        {itemsArray.length} ligne{itemsArray.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-sm font-medium text-textMain">
                        Total :{' '}
                        {itemsArray
                          .reduce((acc, i) => acc + i.ordered_qty * i.unit_price, 0)
                          .toLocaleString('fr-FR', {
                            style: 'currency',
                            currency: 'XOF',
                            minimumFractionDigits: 0,
                          })}
                      </span>
                    </div>
                  </div>
                ) : (
                  !loadingProducts && (
                    <p className="text-sm text-textMuted text-center py-6 border border-dashed border-borderLight rounded">
                      Recherchez un produit ci-dessus pour l'ajouter à la commande.
                    </p>
                  )
                )}
              </div>
            )}

            {/* Erreur */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          {/* Pied */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-between gap-2 flex-shrink-0">
            {step === 1 ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Annuler
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={handleNextStep}>
                  Suivant →
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setStep(1); setApiError(null); }}>
                  ← Précédent
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                  Créer la commande
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Modale : Modification (DRAFT uniquement — tous les champs sauf fournisseur)
// ---------------------------------------------------------------------------

function EditOrderModal({
  order,
  stores,
  onClose,
  onSuccess,
}: {
  order: PurchaseOrderRow | null;
  stores: StoreOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [notes, setNotes]                                   = useState('');
  const [expectedAt, setExpectedAt]                         = useState('');
  const [destinationStoreId, setDestinationStoreId]         = useState('');
  const [step, setStep]                         = useState<1 | 2>(2);
  const [supplierProducts, setSupplierProducts] = useState<SupplierProductOption[]>([]);
  const [loadingProducts, setLoadingProducts]   = useState(false);
  const [selectedItems, setSelectedItems]       = useState<Map<string, CreateOrderItem>>(new Map());
  const [productSearch, setProductSearch]       = useState('');
  const [showDropdown, setShowDropdown]         = useState(false);
  const [apiError, setApiError]                 = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef   = useRef<HTMLDivElement>(null);

  // Initialiser l'état depuis la commande à l'ouverture
  useEffect(() => {
    if (!order) return;
    setNotes(order.notes ?? '');
    setExpectedAt(order.expected_at ? order.expected_at.slice(0, 10) : '');
    setDestinationStoreId(order.destination_store_id);
    setStep(2);
    setApiError(null);
    setProductSearch('');
    setShowDropdown(false);

    // Pré-remplir les lignes depuis les items existants
    const initialItems = new Map<string, CreateOrderItem>();
    for (const item of order.items) {
      initialItems.set(item.supplier_product_id, {
        supplier_product_id: item.supplier_product_id,
        ordered_qty:         item.ordered_qty,
        unit_price:          parseFloat(item.unit_price),
        min_order_qty:       1, // Mis à jour après chargement du catalogue fournisseur
        product_name:        item.supplier_product.product.name,
        product_sku:         item.supplier_product.product.sku,
        product_id:          item.supplier_product.product.id,
        format_label:        item.supplier_product.packaging_format.label,
        format_units:        item.supplier_product.packaging_format.units_per_package,
        packaging_format_id: item.packaging_format_id ?? undefined,
      });
    }
    setSelectedItems(initialItems);

    setTimeout(() => firstInputRef.current?.focus(), 50);
  }, [order]);

  // Charger les produits du fournisseur et mettre à jour min_order_qty
  useEffect(() => {
    if (!order?.supplier_id) return;
    let cancelled = false;
    setLoadingProducts(true);
    apiClient
      .get<{ success: boolean; supplierProducts: SupplierProductOption[] }>(
        `/api/supplier-products?isActive=true&supplier_id=${order.supplier_id}`
      )
      .then((res) => {
        if (!cancelled) {
          const sps = res.data.supplierProducts ?? [];
          setSupplierProducts(sps);
          // Mettre à jour min_order_qty dans les items déjà sélectionnés
          setSelectedItems((prev) => {
            const next = new Map(prev);
            for (const sp of sps) {
              const existing = next.get(sp.id);
              if (existing) {
                next.set(sp.id, { ...existing, min_order_qty: sp.min_order_qty });
              }
            }
            return next;
          });
        }
      })
      .catch(() => { if (!cancelled) setSupplierProducts([]); })
      .finally(() => { if (!cancelled) setLoadingProducts(false); });
    return () => { cancelled = true; };
  }, [order?.supplier_id]);

  // Fermeture par Escape
  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  // Produits filtrés selon la recherche (EditOrderModal)
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const list = q
      ? supplierProducts.filter(
          (sp) =>
            sp.product.name.toLowerCase().includes(q) ||
            sp.product.sku.toLowerCase().includes(q)
        )
      : supplierProducts;
    return list.slice(0, 8);
  }, [supplierProducts, productSearch]);

  // Fermer le dropdown si clic en dehors (EditOrderModal)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleAddProduct(sp: SupplierProductOption) {
    if (selectedItems.has(sp.id)) return;
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.set(sp.id, {
        supplier_product_id: sp.id,
        ordered_qty:         sp.min_order_qty,
        unit_price:          parseFloat(sp.purchase_price),
        min_order_qty:       sp.min_order_qty,
        product_name:        sp.product.name,
        product_sku:         sp.product.sku,
        product_id:          sp.product.id,
        format_label:        sp.packaging_format.label,
        format_units:        sp.packaging_format.units_per_package,
        packaging_format_id: sp.packaging_format_id,
      });
      return next;
    });
    setProductSearch('');
    setShowDropdown(false);
  }

  function handleRemoveProduct(spId: string) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.delete(spId);
      return next;
    });
  }

  function handleItemChange(spId: string, field: 'ordered_qty' | 'unit_price', value: number) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const item = next.get(spId);
      if (item) next.set(spId, { ...item, [field]: value });
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;

    // Validation
    if (!destinationStoreId) {
      setApiError('Veuillez sélectionner un établissement de destination.');
      return;
    }
    if (selectedItems.size === 0) {
      setApiError('La commande doit contenir au moins une ligne.');
      return;
    }
    for (const item of selectedItems.values()) {
      if (item.ordered_qty <= 0) {
        setApiError(`La quantité de "${item.product_name}" doit être positive.`);
        return;
      }
      if (item.unit_price <= 0) {
        setApiError(`Le prix unitaire de "${item.product_name}" doit être positif.`);
        return;
      }
    }

    setIsSubmitting(true);
    setApiError(null);

    const payload: {
      destination_store_id?: string;
      notes?: string;
      expected_at?: string;
      items: Array<{ supplier_product_id: string; ordered_qty: number; unit_price: number; packaging_format_id?: string }>;
    } = {
      items: Array.from(selectedItems.values()).map((item) => ({
        supplier_product_id: item.supplier_product_id,
        ordered_qty:         item.ordered_qty,
        unit_price:          item.unit_price,
        ...(item.packaging_format_id ? { packaging_format_id: item.packaging_format_id } : {}),
      })),
    };

    if (destinationStoreId !== order.destination_store_id) {
      payload.destination_store_id = destinationStoreId;
    }
    if (notes.trim()) payload.notes = notes.trim();
    if (expectedAt)   payload.expected_at = new Date(expectedAt).toISOString();

    try {
      await apiClient.put(`/api/purchase-orders/${order.id}`, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(extractApiError(err, 'Une erreur est survenue lors de la mise à jour.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  const itemsArray = Array.from(selectedItems.values());

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <h2 id="edit-order-title" className="text-base font-medium text-textMain">
            Modifier la commande{' '}
            <span className="text-textMuted font-normal">{order.reference}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Stepper */}
        <StepIndicator
          step={step}
          onGoToStep1={() => { setStep(1); setApiError(null); }}
          onGoToStep2={() => { setStep(2); setApiError(null); }}
          step2Enabled={true}
        />

        {/* Corps */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 flex flex-col gap-5 overflow-y-auto flex-1">

            {/* --- Step 1 : Informations générales --- */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                {/* Fournisseur (lecture seule) */}
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-textSecondary">Fournisseur</span>
                  <div className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMuted">
                    {order.supplier.name}
                  </div>
                </div>

                {/* Établissement de destination */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="edit-order-store" className="text-xs font-medium text-textSecondary">
                    Établissement de destination <span className="text-danger" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="edit-order-store"
                    value={destinationStoreId}
                    onChange={(e) => setDestinationStoreId(e.target.value)}
                    className={inputCls}
                    aria-required="true"
                  >
                    <option value="">Sélectionner un établissement…</option>
                    {stores.filter((s) => s.status === 'ACTIVE').map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date attendue */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="edit-expected-at" className="text-xs font-medium text-textSecondary">
                    Date attendue
                  </label>
                  <input
                    ref={firstInputRef}
                    id="edit-expected-at"
                    type="date"
                    value={expectedAt}
                    onChange={(e) => setExpectedAt(e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-1">
                  <label htmlFor="edit-notes" className="text-xs font-medium text-textSecondary">
                    Notes
                  </label>
                  <textarea
                    id="edit-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Instructions de livraison, conditions particulières…"
                    className={inputCls + ' resize-none'}
                  />
                </div>
              </div>
            )}

            {/* --- Step 2 : Lignes de commande --- */}
            {step === 2 && (
            <div className="flex flex-col gap-3">

              {/* Champ de recherche + dropdown */}
              <div className="relative" ref={dropdownRef}>
                <input
                  type="text"
                  placeholder={
                    loadingProducts
                      ? 'Chargement des produits…'
                      : 'Ajouter un produit par nom ou SKU…'
                  }
                  value={productSearch}
                  disabled={loadingProducts}
                  onChange={(e) => { setProductSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  className={inputCls}
                  autoComplete="off"
                />
                {showDropdown && !loadingProducts && supplierProducts.length === 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-surface border border-borderLight rounded shadow-lg px-3 py-2.5 text-sm text-textMuted">
                    Aucun produit actif pour ce fournisseur.
                  </div>
                )}
                {showDropdown && filteredProducts.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-surface border border-borderLight rounded shadow-lg overflow-hidden max-h-56 overflow-y-auto">
                    {filteredProducts.map((sp) => {
                      const isAdded = selectedItems.has(sp.id);
                      return (
                        <button
                          key={sp.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handleAddProduct(sp); }}
                          disabled={isAdded}
                          className={[
                            'w-full text-left px-3 py-2.5 flex items-center gap-3 text-sm',
                            'border-b border-borderLight last:border-0 transition-colors',
                            isAdded
                              ? 'opacity-50 cursor-default bg-background'
                              : 'hover:bg-primary/5 cursor-pointer',
                          ].join(' ')}
                        >
                          <span className="w-4 text-center text-xs text-primary shrink-0">
                            {isAdded ? '✓' : ''}
                          </span>
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-textMain truncate">
                              {sp.product.name}
                            </span>
                            <span className="text-xs text-textMuted">
                              {sp.product.sku} · {sp.packaging_format.label} · Min. {sp.min_order_qty}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Tableau des lignes de commande */}
              {itemsArray.length > 0 ? (
                <div className="border border-borderLight rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#F1F3F5] text-xs text-textMuted border-b border-borderLight">
                        <th className="px-3 py-2 text-left font-medium">Produit</th>
                        <th className="px-3 py-2 text-left font-medium">Format</th>
                        <th className="px-3 py-2 text-left font-medium">Qté</th>
                        <th className="px-3 py-2 text-left font-medium">Prix unit. (XOF)</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {itemsArray.map((item, idx) => (
                        <tr
                          key={item.supplier_product_id}
                          className={idx > 0 ? 'border-t border-borderLight' : ''}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-textMain text-xs leading-snug">
                              {item.product_name}
                            </div>
                            <div className="text-xs text-textMuted">{item.product_sku}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-textMuted whitespace-nowrap">
                            {item.format_label}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step={1}
                              min={item.min_order_qty}
                              value={item.ordered_qty}
                              onChange={(e) =>
                                handleItemChange(
                                  item.supplier_product_id,
                                  'ordered_qty',
                                  parseInt(e.target.value, 10) || item.min_order_qty
                                )
                              }
                              className="w-16 px-2 py-1 text-xs border border-borderLight rounded focus:outline-none focus:ring-1 focus:ring-primary text-textMain bg-background"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step={0.01}
                              min={0}
                              value={item.unit_price}
                              onChange={(e) =>
                                handleItemChange(
                                  item.supplier_product_id,
                                  'unit_price',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-24 px-2 py-1 text-xs border border-borderLight rounded focus:outline-none focus:ring-1 focus:ring-primary text-textMain bg-background"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveProduct(item.supplier_product_id)}
                              className="text-textMuted hover:text-danger transition-colors"
                              aria-label={`Retirer ${item.product_name}`}
                            >
                              <IconReset />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t border-borderLight bg-[#F1F3F5] flex justify-between items-center">
                    <span className="text-xs text-textMuted">
                      {itemsArray.length} ligne{itemsArray.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-sm font-medium text-textMain">
                      Total :{' '}
                      {itemsArray
                        .reduce((acc, i) => acc + i.ordered_qty * i.unit_price, 0)
                        .toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'XOF',
                          minimumFractionDigits: 0,
                        })}
                    </span>
                  </div>
                </div>
              ) : (
                !loadingProducts && (
                  <p className="text-sm text-textMuted text-center py-6 border border-dashed border-borderLight rounded">
                    Recherchez un produit ci-dessus pour l'ajouter à la commande.
                  </p>
                )
              )}
            </div>
            )}

            {/* Erreur */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          {/* Pied */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-between gap-2 flex-shrink-0">
            {step === 1 ? (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Annuler
                </Button>
                <Button type="button" variant="primary" size="sm" onClick={() => { setStep(2); setApiError(null); }}>
                  Suivant →
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="secondary" size="sm" onClick={() => { setStep(1); setApiError(null); }}>
                  ← Précédent
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                  Enregistrer
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation d'envoi
// ---------------------------------------------------------------------------

function SendOrderModal({
  order,
  onClose,
  onSuccess,
}: {
  order: PurchaseOrderRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!order) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [order]);

  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  async function handleConfirm() {
    if (!order) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/purchase-orders/${order.id}/send`);
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        setApiError(
          'Cette commande ne peut pas être envoyée dans son état actuel. Veuillez rafraîchir la page.'
        );
      } else {
        setApiError(extractApiError(err, 'Une erreur est survenue lors de l\'envoi.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="send-order-title" className="text-base font-medium text-textMain">
            Envoyer la commande
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-2">
          <p className="text-sm text-textMuted">
            Voulez-vous envoyer la commande{' '}
            <strong className="text-textMain">{order.reference}</strong> au fournisseur{' '}
            <strong className="text-textMain">{order.supplier.name}</strong> ?
          </p>
          <p className="text-sm text-textMuted">
            Cette action est <strong>irréversible</strong>. La commande passera à l&apos;état
            &quot;Envoyé&quot; et ne pourra plus être modifiée.
          </p>
          {apiError && (
            <p role="alert" className="mt-1 text-sm text-danger">{apiError}</p>
          )}
        </div>
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
            Envoyer
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation d'annulation (SA uniquement)
// ---------------------------------------------------------------------------

function CancelOrderModal({
  order,
  onClose,
  onSuccess,
}: {
  order: PurchaseOrderRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!order) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [order]);

  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  async function handleConfirm() {
    if (!order) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/purchase-orders/${order.id}/cancel`);
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 422) {
        setApiError(
          'Cette commande ne peut pas être annulée dans son état actuel (transition de statut invalide).'
        );
      } else {
        setApiError(extractApiError(err, 'Une erreur est survenue lors de l\'annulation.'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!order) return null;

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="cancel-order-title" className="text-base font-medium text-textMain">
            Annuler la commande
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-2">
          <p className="text-sm text-textMuted">
            Voulez-vous annuler la commande{' '}
            <strong className="text-textMain">{order.reference}</strong> ?
          </p>
          <p className="text-sm text-textMuted">
            Cette action est <strong>irréversible</strong>.
          </p>
          {apiError && (
            <p role="alert" className="mt-1 text-sm text-danger">{apiError}</p>
          )}
        </div>
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
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Modale : Détail de commande (pleine largeur)
// ---------------------------------------------------------------------------

const RECEPTION_TRACKED_STATUSES: PurchaseOrderStatus[] = ['SENT', 'PARTIALLY_RECEIVED', 'RECEIVED'];

function OrderDetailModal({
  order,
  onClose,
}: {
  order: PurchaseOrderRow | null;
  onClose: () => void;
}) {
  // Map "productId|formatId" → stock_units_added confirmés
  const [confirmedUnitsMap, setConfirmedUnitsMap] = useState<Map<string, number>>(new Map());
  const [isLoadingReceptions, setIsLoadingReceptions] = useState(false);

  useEffect(() => {
    if (!order) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  // Charger les réceptions confirmées pour les statuts concernés
  useEffect(() => {
    if (!order || !RECEPTION_TRACKED_STATUSES.includes(order.status)) return;
    let cancelled = false;
    setIsLoadingReceptions(true);
    setConfirmedUnitsMap(new Map());
    apiClient
      .get<{ success: boolean; receptions: Array<{
        status: string;
        items: Array<{ product_id: string; stock_units_added: number; packaging_format_id: string | null }>;
      }> }>(`/api/receptions/by-order/${order.id}`)
      .then((res) => {
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const reception of res.data.receptions ?? []) {
          if (reception.status !== 'CONFIRMED') continue;
          for (const item of reception.items) {
            const key = `${item.product_id}|${item.packaging_format_id ?? ''}`;
            map.set(key, (map.get(key) ?? 0) + item.stock_units_added);
          }
        }
        setConfirmedUnitsMap(map);
      })
      .catch(() => { /* non-bloquant */ })
      .finally(() => { if (!cancelled) setIsLoadingReceptions(false); });
    return () => { cancelled = true; };
  }, [order]);

  if (!order) return null;

  return (
    <Portal>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-order-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 id="detail-order-title" className="text-base font-medium text-textMain">
              {order.reference}
            </h2>
            <StatusBadge status={order.status} />
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="px-6 py-5 flex flex-col gap-6 overflow-y-auto flex-1">

          {/* Informations générales */}
          <section aria-labelledby="detail-info-title">
            <h3
              id="detail-info-title"
              className="text-xs font-semibold text-textMuted uppercase tracking-wide mb-3"
            >
              Informations générales
            </h3>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Fournisseur</dt>
                <dd className="text-sm font-medium text-textMain">{order.supplier.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Établissement de destination</dt>
                <dd className="text-sm font-medium text-textMain">{order.destination_store.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Commandé par</dt>
                <dd className="text-sm font-medium text-textMain">{order.ordered_by.username}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Date de création</dt>
                <dd className="text-sm text-textMain">{formatDate(order.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Date attendue</dt>
                <dd className="text-sm text-textMain">{formatDate(order.expected_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-textMuted mb-0.5">Date d&apos;envoi</dt>
                <dd className="text-sm text-textMain">{formatDate(order.sent_at)}</dd>
              </div>
              {order.notes && (
                <div className="col-span-2">
                  <dt className="text-xs text-textMuted mb-0.5">Notes</dt>
                  <dd className="text-sm text-textMain whitespace-pre-wrap">{order.notes}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Lignes de commande */}
          <section aria-labelledby="detail-items-title">
            <h3
              id="detail-items-title"
              className="text-xs font-semibold text-textMuted uppercase tracking-wide mb-3"
            >
              Lignes de commande
            </h3>
            <div className="border border-borderLight rounded overflow-x-auto">
              <table
                className="w-full text-sm"
                role="table"
                aria-label="Lignes de la commande"
              >
                <thead>
                  <tr className="bg-background border-b border-borderLight">
                    {['Produit', 'SKU', 'Format colis', 'Qté commandée', 'Prix unitaire', 'Sous-total'].map((col) => (
                      <th
                        key={col}
                        scope="col"
                        className="px-4 py-2.5 text-left text-xs font-medium text-textMuted uppercase tracking-wide whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {order.items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-textMuted">
                        Aucune ligne de commande.
                      </td>
                    </tr>
                  ) : (
                    order.items.map((item) => {
                      const subTotal = item.ordered_qty * parseFloat(item.unit_price);
                      return (
                        <tr key={item.id} className="border-b border-borderLight last:border-b-0">
                          <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                            {item.supplier_product.product.name}
                          </td>
                          <td className="px-4 py-3 text-textMuted whitespace-nowrap font-mono text-xs">
                            {item.supplier_product.product.sku}
                          </td>
                          <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                            {item.packaging_format
                              ? item.packaging_format.label
                              : <span className="text-textMuted/50 italic text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 text-textMain tabular-nums">
                            {item.ordered_qty}
                          </td>
                          <td className="px-4 py-3 text-textMain tabular-nums whitespace-nowrap">
                            {parseFloat(item.unit_price).toLocaleString('fr-FR', {
                              style: 'currency',
                              currency: 'XOF',
                              minimumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-4 py-3 font-medium text-textMain tabular-nums whitespace-nowrap">
                            {subTotal.toLocaleString('fr-FR', {
                              style: 'currency',
                              currency: 'XOF',
                              minimumFractionDigits: 0,
                            })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total */}
            {order.items.length > 0 && (
              <div className="flex justify-end mt-3 pr-1">
                <p className="text-sm text-textMuted">
                  Total commande :{' '}
                  <strong className="text-textMain text-base">{calcTotal(order.items)}</strong>
                </p>
              </div>
            )}
          </section>

          {/* Suivi des réceptions — visible pour SENT, PARTIALLY_RECEIVED, RECEIVED */}
          {RECEPTION_TRACKED_STATUSES.includes(order.status) && order.items.length > 0 && (
            <section aria-labelledby="detail-reception-title">
              <h3
                id="detail-reception-title"
                className="text-xs font-semibold text-textMuted uppercase tracking-wide mb-3"
              >
                Suivi des réceptions (confirmées)
              </h3>

              {isLoadingReceptions ? (
                <div className="flex flex-col gap-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="h-10 bg-borderLight rounded animate-pulse" aria-hidden="true" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {order.items.map((item) => {
                    const fmt            = item.supplier_product.packaging_format;
                    const key            = `${item.supplier_product.product.id}|${fmt.id}`;
                    const expectedUnits  = item.ordered_qty * fmt.units_per_package;
                    const receivedUnits  = confirmedUnitsMap.get(key) ?? 0;
                    const receivedOrders = fmt.units_per_package > 0 ? Math.round(receivedUnits / fmt.units_per_package) : 0;
                    const remaining      = Math.max(0, item.ordered_qty - receivedOrders);
                    const pct            = expectedUnits > 0 ? Math.min(100, Math.round((receivedUnits / expectedUnits) * 100)) : 0;
                    const isComplete     = pct >= 100;
                    const hasStarted     = receivedOrders > 0;

                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1 p-3 bg-background border border-borderLight rounded"
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex flex-col gap-0">
                            <span className="text-sm font-medium text-textMain">
                              {item.supplier_product.product.name}
                              <span className="ml-1.5 text-xs font-normal text-textMuted">({fmt.label})</span>
                            </span>
                            <span className="text-xs text-textMuted font-mono">{item.supplier_product.product.sku}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-textMuted whitespace-nowrap">
                            <span>
                              Commandé&nbsp;:&nbsp;<strong className="text-textMain">{item.ordered_qty}</strong>
                            </span>
                            <span>
                              Reçu&nbsp;:&nbsp;
                              <strong className={isComplete ? 'text-green-700' : hasStarted ? 'text-orange-600' : 'text-textMuted'}>
                                {receivedOrders}
                              </strong>
                            </span>
                            <span>
                              Restant&nbsp;:&nbsp;
                              <strong className={remaining === 0 ? 'text-green-700' : 'text-textMain'}>
                                {remaining}
                              </strong>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="flex-1 h-1.5 bg-borderLight rounded-full overflow-hidden"
                            role="progressbar"
                            aria-valuenow={pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${item.supplier_product.product.name} : ${pct}% reçu`}
                          >
                            <div
                              className={[
                                'h-full rounded-full transition-all',
                                isComplete ? 'bg-green-500' : hasStarted ? 'bg-orange-400' : 'bg-borderLight',
                              ].join(' ')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={[
                            'text-xs font-medium tabular-nums w-8 text-right',
                            isComplete ? 'text-green-700' : hasStarted ? 'text-orange-600' : 'text-textMuted',
                          ].join(' ')}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
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
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function PurchaseOrdersPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();

  const isSA = !sessionLoading && sessionUser !== null && sessionUser.roleName === ROLE_SA;

  // --- Données ---
  const [orders, setOrders]     = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [stores, setStores]       = useState<StoreOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Filtres ---
  const [filterStatus, setFilterStatus]     = useState<PurchaseOrderStatus | ''>('');
  const [filterSupplier, setFilterSupplier] = useState<string>('');
  const [filterStore, setFilterStore]       = useState<string>('');

  // --- État des modales ---
  const [modalCreate, setModalCreate]       = useState(false);
  const [orderToEdit, setOrderToEdit]       = useState<PurchaseOrderRow | null>(null);
  const [orderToSend, setOrderToSend]       = useState<PurchaseOrderRow | null>(null);
  const [orderToCancel, setOrderToCancel]   = useState<PurchaseOrderRow | null>(null);
  const [orderToView, setOrderToView]       = useState<PurchaseOrderRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement initial
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [ordersRes, suppliersRes, storesRes] = await Promise.all([
        apiClient.get<{ success: boolean; orders: PurchaseOrderRow[] }>(
          '/api/purchase-orders'
        ),
        apiClient.get<{ success: boolean; suppliers: SupplierOption[] }>(
          '/api/suppliers?isActive=true'
        ),
        apiClient.get<{ success: boolean; stores: StoreOption[] }>('/api/stores'),
      ]);
      setOrders(ordersRes.data.orders ?? []);
      setSuppliers(suppliersRes.data.suppliers ?? []);
      setStores(storesRes.data.stores ?? []);
    } catch (err) {
      setFetchError(extractApiError(err, 'Impossible de charger les commandes fournisseurs.'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // ---------------------------------------------------------------------------
  // Filtrage client-side
  // ---------------------------------------------------------------------------

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterStatus && o.status !== filterStatus) return false;
      if (filterSupplier && o.supplier_id !== filterSupplier) return false;
      if (filterStore && o.destination_store_id !== filterStore) return false;
      return true;
    });
  }, [orders, filterStatus, filterSupplier, filterStore]);

  const hasActiveFilters = filterStatus !== '' || filterSupplier !== '' || filterStore !== '';

  function handleReset() {
    setFilterStatus('');
    setFilterSupplier('');
    setFilterStore('');
  }

  // ---------------------------------------------------------------------------
  // Garde de rendu — pendant le chargement de session
  // ---------------------------------------------------------------------------

  if (sessionLoading || !sessionUser) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-72 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody>
              <SkeletonRows cols={8} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textMain">Commandes fournisseurs</h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Créer une commande
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

        {/* Filtre statut */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary">
            Statut
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PurchaseOrderStatus | '')}
            className={inputCls}
          >
            <option value="">Tous les statuts</option>
            <option value="DRAFT">Brouillon</option>
            <option value="SENT">Envoyé</option>
            <option value="PARTIALLY_RECEIVED">Partiellement reçu</option>
            <option value="RECEIVED">Reçu</option>
            <option value="CANCELLED">Annulé</option>
          </select>
        </div>

        {/* Filtre fournisseur */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label htmlFor="filter-supplier" className="text-xs font-medium text-textSecondary">
            Fournisseur
          </label>
          <select
            id="filter-supplier"
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous les fournisseurs</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Filtre établissement */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label htmlFor="filter-store" className="text-xs font-medium text-textSecondary">
            Établissement de destination
          </label>
          <select
            id="filter-store"
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous les établissements</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Bouton réinitialiser */}
        {hasActiveFilters && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleReset}
            className="flex items-center gap-1.5 self-end"
          >
            <IconReset />
            Réinitialiser
          </Button>
        )}
      </div>

      {/* Compteur */}
      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-3">
          {filteredOrders.length === 0
            ? 'Aucune commande ne correspond aux filtres.'
            : filteredOrders.length === orders.length
              ? `${orders.length} commande${orders.length > 1 ? 's' : ''}`
              : `${filteredOrders.length} commande${filteredOrders.length > 1 ? 's' : ''} affichée${filteredOrders.length > 1 ? 's' : ''} sur ${orders.length}`}
        </p>
      )}

      {/* Erreur de chargement */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Liste des commandes fournisseurs"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {[
                'Référence',
                'Fournisseur',
                'Destination',
                'Commandé par',
                'Statut',
                'Date attendue',
                'Nb lignes',
                'Actions',
              ].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium text-textMuted uppercase tracking-wide whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <SkeletonRows cols={8} />
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-textMuted">
                  {orders.length === 0
                    ? 'Aucune commande trouvée.'
                    : 'Aucune commande ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr
                  key={order.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors"
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

                  {/* Commandé par */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {order.ordered_by.username}
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>

                  {/* Date attendue */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {formatDate(order.expected_at)}
                  </td>

                  {/* Nb lignes */}
                  <td className="px-4 py-3 text-textMuted tabular-nums text-center">
                    {order.items.length}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {/* DRAFT : Modifier + Envoyer + Annuler(SA) */}
                      {order.status === 'DRAFT' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOrderToEdit(order)}
                            aria-label={`Modifier la commande ${order.reference}`}
                          >
                            Modifier
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setOrderToSend(order)}
                            aria-label={`Envoyer la commande ${order.reference}`}
                          >
                            Envoyer
                          </Button>
                          {isSA && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setOrderToCancel(order)}
                              aria-label={`Annuler la commande ${order.reference}`}
                            >
                              Annuler
                            </Button>
                          )}
                        </>
                      )}

                      {/* SENT : Voir + Annuler(SA) */}
                      {order.status === 'SENT' && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setOrderToView(order)}
                            aria-label={`Voir la commande ${order.reference}`}
                          >
                            Voir
                          </Button>
                          {isSA && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setOrderToCancel(order)}
                              aria-label={`Annuler la commande ${order.reference}`}
                            >
                              Annuler
                            </Button>
                          )}
                        </>
                      )}

                      {/* PARTIALLY_RECEIVED / RECEIVED / CANCELLED : Voir uniquement */}
                      {(order.status === 'PARTIALLY_RECEIVED' ||
                        order.status === 'RECEIVED' ||
                        order.status === 'CANCELLED') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setOrderToView(order)}
                          aria-label={`Voir la commande ${order.reference}`}
                        >
                          Voir
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      <CreateOrderModal
        isOpen={modalCreate}
        suppliers={suppliers}
        stores={stores}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
      />

      <EditOrderModal
        order={orderToEdit}
        stores={stores}
        onClose={() => setOrderToEdit(null)}
        onSuccess={loadData}
      />

      <SendOrderModal
        order={orderToSend}
        onClose={() => setOrderToSend(null)}
        onSuccess={loadData}
      />

      <CancelOrderModal
        order={orderToCancel}
        onClose={() => setOrderToCancel(null)}
        onSuccess={loadData}
      />

      <OrderDetailModal
        order={orderToView}
        onClose={() => setOrderToView(null)}
      />
    </div>
  );
}
