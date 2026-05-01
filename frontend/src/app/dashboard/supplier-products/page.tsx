// src/app/dashboard/supplier-products/page.tsx
// Page de gestion du catalogue fournisseur — accès Super Administrateur uniquement.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement depuis GET /api/supplier-products + GET /api/suppliers + GET /api/products
//   - Filtrage 100% client-side via useMemo (texte libre, fournisseur, statut, préféré)
//   - Trois modales inline : SupplierProductFormModal,
//     DeactivateEntryModal, ReactivateEntryModal
//
// Sécurité UI :
//   - Vérification de rôle après hydratation → router.replace('/dashboard') si non-SA.

'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const ROLE_SA = 'Super Administrateur';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupplierProductRow = {
  id: string;
  supplier_id: string;
  product_id: string;
  supplier_ref: string | null;
  purchase_price: string; // Decimal sérialisé en string
  order_unit: string;
  units_per_order: number;
  min_order_qty: number;
  is_preferred: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  supplier: { id: string; name: string };
  product: { id: string; name: string; sku: string; unit: string };
};

type SupplierOption = { id: string; name: string };
type ProductOption  = { id: string; name: string; sku: string; unit: string };

type FormErrors = {
  supplier_id?: string;
  product_id?: string;
  purchase_price?: string;
  order_unit?: string;
  units_per_order?: string;
  min_order_qty?: string;
  generic?: string;
};

interface SupplierProductFormData {
  supplier_id: string;
  product_id: string;
  supplier_ref: string;
  purchase_price: string;
  order_unit: string;
  units_per_order: string;
  min_order_qty: string;
  is_preferred: boolean;
}

// ---------------------------------------------------------------------------
// Classes communes aux inputs/selects
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

// ---------------------------------------------------------------------------
// Helpers visuels
// ---------------------------------------------------------------------------

function InactiveBadge() {
  return (
    <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium bg-borderLight text-textMuted">
      Inactif
    </span>
  );
}

function IconStar({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={filled ? 'text-amber-500' : 'text-textMuted'}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
      aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Lignes skeleton
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c) => (
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
// Toggle switch réutilisable
// ---------------------------------------------------------------------------

function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
  description?: string;
  id: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-background border border-borderLight rounded">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-textSecondary">{label}</span>
        {description && (
          <span className="text-xs text-textMuted">{description}</span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        className={
          'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 ' +
          (checked ? 'bg-primary' : 'bg-borderLight')
        }
      >
        <span
          className={
            'inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ' +
            (checked ? 'translate-x-4' : 'translate-x-0.5')
          }
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Formulaire Création / Édition
// ---------------------------------------------------------------------------

function SupplierProductFormModal({
  isOpen,
  entry,
  suppliers,
  products,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  entry: SupplierProductRow | null;
  suppliers: SupplierOption[];
  products: ProductOption[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = entry !== null;

  const emptyForm: SupplierProductFormData = {
    supplier_id:    '',
    product_id:     '',
    supplier_ref:   '',
    purchase_price: '',
    order_unit:     '',
    units_per_order: '1',
    min_order_qty:  '1',
    is_preferred:   false,
  };

  const [form, setForm]                   = useState<SupplierProductFormData>(emptyForm);
  const [errors, setErrors]               = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const firstSelectRef = useRef<HTMLSelectElement>(null);
  const firstInputRef  = useRef<HTMLInputElement>(null);

  // Remplir le formulaire en édition
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && entry) {
      setForm({
        supplier_id:    entry.supplier_id,
        product_id:     entry.product_id,
        supplier_ref:   entry.supplier_ref ?? '',
        purchase_price: parseFloat(entry.purchase_price).toString(),
        order_unit:     entry.order_unit,
        units_per_order: entry.units_per_order.toString(),
        min_order_qty:  entry.min_order_qty.toString(),
        is_preferred:   entry.is_preferred,
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    // Focus initial — création sur le select fournisseur, édition sur le premier input modifiable
    setTimeout(() => {
      if (isEdit) {
        firstInputRef.current?.focus();
      } else {
        firstSelectRef.current?.focus();
      }
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, entry?.id]);

  // Fermeture par Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  function validate(): boolean {
    const next: FormErrors = {};
    if (!isEdit && !form.supplier_id) next.supplier_id = 'Le fournisseur est requis.';
    if (!isEdit && !form.product_id)  next.product_id  = 'Le produit est requis.';
    const price = parseFloat(form.purchase_price);
    if (!form.purchase_price || isNaN(price) || price < 0.01) {
      next.purchase_price = 'Le prix d\'achat doit être supérieur à 0.';
    }
    if (!form.order_unit.trim()) next.order_unit = 'L\'unité de commande est requise.';
    const upo = parseInt(form.units_per_order, 10);
    if (!form.units_per_order || isNaN(upo) || upo < 1) {
      next.units_per_order = 'Doit être au moins 1.';
    }
    const moq = parseInt(form.min_order_qty, 10);
    if (!form.min_order_qty || isNaN(moq) || moq < 1) {
      next.min_order_qty = 'Doit être au moins 1.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      if (isEdit && entry) {
        const payload: Record<string, unknown> = {
          purchase_price: parseFloat(form.purchase_price),
          order_unit:     form.order_unit.trim(),
          units_per_order: parseInt(form.units_per_order, 10),
          min_order_qty:  parseInt(form.min_order_qty, 10),
          is_preferred:   form.is_preferred,
        };
        if (form.supplier_ref.trim()) payload.supplier_ref = form.supplier_ref.trim();
        await apiClient.put(`/api/supplier-products/${entry.id}`, payload);
      } else {
        const payload: Record<string, unknown> = {
          supplier_id:    form.supplier_id,
          product_id:     form.product_id,
          purchase_price: parseFloat(form.purchase_price),
          order_unit:     form.order_unit.trim(),
          units_per_order: parseInt(form.units_per_order, 10),
          min_order_qty:  parseInt(form.min_order_qty, 10),
          is_preferred:   form.is_preferred,
        };
        if (form.supplier_ref.trim()) payload.supplier_ref = form.supplier_ref.trim();
        await apiClient.post('/api/supplier-products', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status  = err.response?.status;
        const message = err.response?.data?.message ?? 'Une erreur est survenue.';
        if (status === 409) {
          setErrors((prev) => ({
            ...prev,
            product_id: 'Ce fournisseur référence déjà ce produit.',
          }));
        } else {
          setErrors((prev) => ({ ...prev, generic: message }));
        }
      } else {
        setErrors((prev) => ({ ...prev, generic: 'Une erreur inattendue est survenue.' }));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] overflow-y-auto">

        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="sp-form-title" className="text-base font-medium text-textMain">
            {isEdit ? 'Modifier l\'entrée catalogue' : 'Ajouter une entrée catalogue'}
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
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* Fournisseur — désactivé en édition */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sp-supplier" className="text-xs font-medium text-textSecondary">
                Fournisseur{!isEdit && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
              </label>
              {isEdit ? (
                <div className={inputCls + ' bg-background/50 text-textMuted cursor-not-allowed'}>
                  {entry?.supplier.name}
                </div>
              ) : (
                <>
                  <select
                    ref={firstSelectRef}
                    id="sp-supplier"
                    value={form.supplier_id}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, supplier_id: e.target.value }));
                      if (errors.supplier_id) setErrors((p) => ({ ...p, supplier_id: undefined }));
                    }}
                    className={inputCls + (errors.supplier_id ? ' border-danger' : '')}
                    aria-required="true"
                    aria-describedby={errors.supplier_id ? 'sp-supplier-err' : undefined}
                  >
                    <option value="">— Sélectionner un fournisseur —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {errors.supplier_id && (
                    <p id="sp-supplier-err" role="alert" className="text-xs text-danger">
                      {errors.supplier_id}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Produit — désactivé en édition */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sp-product" className="text-xs font-medium text-textSecondary">
                Produit{!isEdit && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
              </label>
              {isEdit ? (
                <div className={inputCls + ' bg-background/50 text-textMuted cursor-not-allowed'}>
                  {entry?.product.name}
                  <span className="ml-1.5 text-xs text-textMuted">({entry?.product.sku})</span>
                </div>
              ) : (
                <>
                  <select
                    id="sp-product"
                    value={form.product_id}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, product_id: e.target.value }));
                      if (errors.product_id) setErrors((p) => ({ ...p, product_id: undefined }));
                    }}
                    className={inputCls + (errors.product_id ? ' border-danger' : '')}
                    aria-required="true"
                    aria-describedby={errors.product_id ? 'sp-product-err' : undefined}
                  >
                    <option value="">— Sélectionner un produit —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.sku}</option>
                    ))}
                  </select>
                  {errors.product_id && (
                    <p id="sp-product-err" role="alert" className="text-xs text-danger">
                      {errors.product_id}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Référence fournisseur */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sp-ref" className="text-xs font-medium text-textSecondary">
                Réf. fournisseur
              </label>
              <input
                ref={firstInputRef}
                id="sp-ref"
                type="text"
                value={form.supplier_ref}
                onChange={(e) => setForm((f) => ({ ...f, supplier_ref: e.target.value }))}
                placeholder="ex: REF-12345"
                className={inputCls}
              />
            </div>

            {/* Prix d'achat */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sp-price" className="text-xs font-medium text-textSecondary">
                Prix d&apos;achat (€) <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="sp-price"
                type="number"
                step="0.01"
                min="0.01"
                value={form.purchase_price}
                onChange={(e) => {
                  setForm((f) => ({ ...f, purchase_price: e.target.value }));
                  if (errors.purchase_price) setErrors((p) => ({ ...p, purchase_price: undefined }));
                }}
                placeholder="0.00"
                className={inputCls + (errors.purchase_price ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.purchase_price ? 'sp-price-err' : undefined}
              />
              {errors.purchase_price && (
                <p id="sp-price-err" role="alert" className="text-xs text-danger">
                  {errors.purchase_price}
                </p>
              )}
            </div>

            {/* Unité de commande */}
            <div className="flex flex-col gap-1">
              <label htmlFor="sp-order-unit" className="text-xs font-medium text-textSecondary">
                Unité de commande <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="sp-order-unit"
                type="text"
                value={form.order_unit}
                onChange={(e) => {
                  setForm((f) => ({ ...f, order_unit: e.target.value }));
                  if (errors.order_unit) setErrors((p) => ({ ...p, order_unit: undefined }));
                }}
                placeholder="ex: Carton, Pack, Palette"
                className={inputCls + (errors.order_unit ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.order_unit ? 'sp-order-unit-err' : undefined}
              />
              {errors.order_unit && (
                <p id="sp-order-unit-err" role="alert" className="text-xs text-danger">
                  {errors.order_unit}
                </p>
              )}
            </div>

            {/* Unités par commande + Quantité minimale — côte à côte */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="sp-upo" className="text-xs font-medium text-textSecondary">
                  Unités/commande <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                  id="sp-upo"
                  type="number"
                  min="1"
                  step="1"
                  value={form.units_per_order}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, units_per_order: e.target.value }));
                    if (errors.units_per_order) setErrors((p) => ({ ...p, units_per_order: undefined }));
                  }}
                  className={inputCls + (errors.units_per_order ? ' border-danger' : '')}
                  aria-required="true"
                  aria-describedby={errors.units_per_order ? 'sp-upo-err' : undefined}
                />
                {errors.units_per_order && (
                  <p id="sp-upo-err" role="alert" className="text-xs text-danger">
                    {errors.units_per_order}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="sp-moq" className="text-xs font-medium text-textSecondary">
                  Qté minimale <span className="text-danger" aria-hidden="true">*</span>
                </label>
                <input
                  id="sp-moq"
                  type="number"
                  min="1"
                  step="1"
                  value={form.min_order_qty}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, min_order_qty: e.target.value }));
                    if (errors.min_order_qty) setErrors((p) => ({ ...p, min_order_qty: undefined }));
                  }}
                  className={inputCls + (errors.min_order_qty ? ' border-danger' : '')}
                  aria-required="true"
                  aria-describedby={errors.min_order_qty ? 'sp-moq-err' : undefined}
                />
                {errors.min_order_qty && (
                  <p id="sp-moq-err" role="alert" className="text-xs text-danger">
                    {errors.min_order_qty}
                  </p>
                )}
              </div>
            </div>

            {/* Toggle fournisseur préféré */}
            <ToggleSwitch
              id="sp-preferred"
              checked={form.is_preferred}
              onChange={(val) => setForm((f) => ({ ...f, is_preferred: val }))}
              label="Fournisseur préféré"
              description="Ce fournisseur sera proposé en priorité pour ce produit"
            />

            {/* Erreur API générique */}
            {errors.generic && (
              <p role="alert" className="text-sm text-danger">{errors.generic}</p>
            )}
          </div>

          {/* Pied */}
          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isEdit ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation de désactivation
// ---------------------------------------------------------------------------

function DeactivateEntryModal({
  entry,
  onClose,
  onSuccess,
}: {
  entry: SupplierProductRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entry) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [entry, onClose]);

  async function handleConfirm() {
    if (!entry) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.put(`/api/supplier-products/${entry.id}`, { is_active: false });
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setApiError(err.response?.data?.message ?? 'Une erreur est survenue.');
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!entry) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-sp-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="deactivate-sp-title" className="text-base font-medium text-textMain">
            Désactiver l&apos;entrée
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
            Voulez-vous désactiver la liaison{' '}
            <strong className="text-textMain">{entry.supplier.name}</strong>
            {' '}→{' '}
            <strong className="text-textMain">{entry.product.name}</strong> ?
          </p>
          <p className="text-sm text-textMuted">
            Cette entrée ne sera plus proposée dans les commandes mais ses données seront conservées.
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
            variant="danger"
            size="sm"
            isLoading={isSubmitting}
            onClick={handleConfirm}
          >
            Désactiver
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation de réactivation
// ---------------------------------------------------------------------------

function ReactivateEntryModal({
  entry,
  onClose,
  onSuccess,
}: {
  entry: SupplierProductRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!entry) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [entry]);

  useEffect(() => {
    if (!entry) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [entry, onClose]);

  async function handleConfirm() {
    if (!entry) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.put(`/api/supplier-products/${entry.id}`, { is_active: true });
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setApiError(err.response?.data?.message ?? 'Une erreur est survenue.');
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!entry) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-sp-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="reactivate-sp-title" className="text-base font-medium text-textMain">
            Réactiver l&apos;entrée
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-textMuted">
            Voulez-vous réactiver la liaison{' '}
            <strong className="text-textMain">{entry.supplier.name}</strong>
            {' '}→{' '}
            <strong className="text-textMain">{entry.product.name}</strong> ?
          </p>
          {apiError && (
            <p role="alert" className="mt-3 text-sm text-danger">{apiError}</p>
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
            Réactiver
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function SupplierProductsPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection si non-SA
  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && sessionUser.roleName !== ROLE_SA) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // --- Données ---
  const [entries, setEntries]         = useState<SupplierProductRow[]>([]);
  const [suppliers, setSuppliers]     = useState<SupplierOption[]>([]);
  const [products, setProducts]       = useState<ProductOption[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // --- Filtres client-side ---
  const [search, setSearch]                     = useState('');
  const [debouncedSearch, setDebouncedSearch]   = useState('');
  const [filterSupplier, setFilterSupplier]     = useState('');
  const [filterStatus, setFilterStatus]         = useState<'ACTIVE' | 'INACTIVE' | ''>('');
  const [filterPreferred, setFilterPreferred]   = useState<'YES' | ''>('');

  // Debounce 300ms sur la recherche
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // --- Contrôle des modales ---
  const [modalCreate, setModalCreate]         = useState(false);
  const [entryToEdit, setEntryToEdit]         = useState<SupplierProductRow | null>(null);
  const [entryToDeactivate, setEntryToDeactivate] = useState<SupplierProductRow | null>(null);
  const [entryToReactivate, setEntryToReactivate] = useState<SupplierProductRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [entriesRes, suppliersRes, productsRes] = await Promise.all([
        apiClient.get<{ success: boolean; supplierProducts: SupplierProductRow[] }>(
          '/api/supplier-products'
        ),
        apiClient.get<{ success: boolean; suppliers: SupplierOption[] }>(
          '/api/suppliers'
        ),
        apiClient.get<{ success: boolean; products: ProductOption[] }>(
          '/api/products'
        ),
      ]);
      setEntries(entriesRes.data.supplierProducts ?? []);
      setSuppliers(suppliersRes.data.suppliers ?? []);
      setProducts(productsRes.data.products ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setFetchError(
          err.response?.data?.message ?? 'Impossible de charger le catalogue fournisseur.'
        );
      } else {
        setFetchError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser || sessionUser.roleName !== ROLE_SA) return;
    loadData();
  }, [loadData, sessionLoading, sessionUser]);

  // ---------------------------------------------------------------------------
  // Filtrage client-side
  // ---------------------------------------------------------------------------

  const filteredEntries = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return entries.filter((row) => {
      if (q) {
        const matchSupplier = row.supplier.name.toLowerCase().includes(q);
        const matchProduct  = row.product.name.toLowerCase().includes(q);
        const matchSku      = row.product.sku.toLowerCase().includes(q);
        if (!matchSupplier && !matchProduct && !matchSku) return false;
      }
      if (filterSupplier && row.supplier_id !== filterSupplier) return false;
      if (filterStatus === 'ACTIVE'   && !row.is_active) return false;
      if (filterStatus === 'INACTIVE' &&  row.is_active) return false;
      if (filterPreferred === 'YES'   && !row.is_preferred) return false;
      return true;
    });
  }, [entries, debouncedSearch, filterSupplier, filterStatus, filterPreferred]);

  const hasActiveFilters =
    search !== '' || filterSupplier !== '' || filterStatus !== '' || filterPreferred !== '';

  function handleReset() {
    setSearch('');
    setFilterSupplier('');
    setFilterStatus('');
    setFilterPreferred('');
  }

  // Liste des fournisseurs distincts dans le dataset pour le filtre
  const supplierOptions = useMemo(() => {
    const seen = new Set<string>();
    return entries
      .filter((row) => {
        if (seen.has(row.supplier_id)) return false;
        seen.add(row.supplier_id);
        return true;
      })
      .map((row) => ({ id: row.supplier_id, name: row.supplier.name }));
  }, [entries]);

  // ---------------------------------------------------------------------------
  // Garde de rendu — pendant le chargement de la session ou si non-SA
  // ---------------------------------------------------------------------------

  if (sessionLoading || !sessionUser || sessionUser.roleName !== ROLE_SA) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 bg-borderLight rounded animate-pulse" aria-hidden="true" />
        <div className="bg-surface border border-borderLight rounded overflow-x-auto">
          <table className="w-full text-sm" aria-hidden="true">
            <tbody>
              <SkeletonRows />
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
        <h1 className="text-2xl font-semibold text-textMain">Catalogue fournisseur</h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Ajouter une entrée
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

        {/* Recherche libre */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="search-sp" className="text-xs font-medium text-textSecondary">
            Recherche
          </label>
          <input
            id="search-sp"
            type="search"
            placeholder="Fournisseur, produit ou SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Filtre par fournisseur */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-supplier" className="text-xs font-medium text-textSecondary">
            Fournisseur
          </label>
          <select
            id="filter-supplier"
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous</option>
            {supplierOptions.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Filtre par statut */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary">
            Statut
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | '')}
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INACTIVE">Inactifs</option>
          </select>
        </div>

        {/* Filtre préféré */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-preferred" className="text-xs font-medium text-textSecondary">
            Préféré
          </label>
          <select
            id="filter-preferred"
            value={filterPreferred}
            onChange={(e) => setFilterPreferred(e.target.value as 'YES' | '')}
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="YES">Préféré uniquement</option>
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
          {filteredEntries.length === 0
            ? 'Aucune entrée ne correspond aux filtres.'
            : filteredEntries.length === entries.length
              ? `${entries.length} entrée${entries.length > 1 ? 's' : ''}`
              : `${filteredEntries.length} entrée${filteredEntries.length > 1 ? 's' : ''} affichée${filteredEntries.length > 1 ? 's' : ''} sur ${entries.length}`}
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
          aria-label="Catalogue fournisseur"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {[
                'Produit',
                'Fournisseur',
                'Réf. fournisseur',
                'Prix d\'achat',
                'Unité cde.',
                'Unités/cde.',
                'Qté min.',
                'Préféré',
                'Statut',
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
              <SkeletonRows />
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-textMuted">
                  {entries.length === 0
                    ? 'Aucune entrée catalogue trouvée.'
                    : 'Aucune entrée ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredEntries.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors"
                >
                  {/* Produit (nom + SKU) */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="font-medium text-textMain">{row.product.name}</span>
                    <br />
                    <span className="text-xs text-textMuted">{row.product.sku}</span>
                  </td>

                  {/* Fournisseur */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {row.supplier.name}
                  </td>

                  {/* Réf. fournisseur */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {row.supplier_ref ?? <span aria-label="Non renseignée">—</span>}
                  </td>

                  {/* Prix d'achat */}
                  <td className="px-4 py-3 text-textMain whitespace-nowrap tabular-nums">
                    {parseFloat(row.purchase_price).toFixed(2)} €
                  </td>

                  {/* Unité de commande */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {row.order_unit}
                  </td>

                  {/* Unités par commande */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap tabular-nums text-center">
                    {row.units_per_order}
                  </td>

                  {/* Quantité minimale */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap tabular-nums text-center">
                    {row.min_order_qty}
                  </td>

                  {/* Préféré */}
                  <td className="px-4 py-3 text-center">
                    <span
                      title={row.is_preferred ? 'Fournisseur préféré' : 'Non préféré'}
                      aria-label={row.is_preferred ? 'Fournisseur préféré' : 'Non préféré'}
                    >
                      <IconStar filled={row.is_preferred} />
                    </span>
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                        Actif
                      </span>
                    ) : (
                      <InactiveBadge />
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEntryToEdit(row)}
                        aria-label={`Modifier ${row.supplier.name} → ${row.product.name}`}
                      >
                        Modifier
                      </Button>

                      {row.is_active ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEntryToDeactivate(row)}
                          aria-label={`Désactiver ${row.supplier.name} → ${row.product.name}`}
                        >
                          Désactiver
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEntryToReactivate(row)}
                          aria-label={`Réactiver ${row.supplier.name} → ${row.product.name}`}
                        >
                          Réactiver
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
      <SupplierProductFormModal
        isOpen={modalCreate}
        entry={null}
        suppliers={suppliers}
        products={products}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
      />

      <SupplierProductFormModal
        isOpen={entryToEdit !== null}
        entry={entryToEdit}
        suppliers={suppliers}
        products={products}
        onClose={() => setEntryToEdit(null)}
        onSuccess={loadData}
      />

      <DeactivateEntryModal
        entry={entryToDeactivate}
        onClose={() => setEntryToDeactivate(null)}
        onSuccess={loadData}
      />

      <ReactivateEntryModal
        entry={entryToReactivate}
        onClose={() => setEntryToReactivate(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
