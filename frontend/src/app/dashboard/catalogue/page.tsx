// src/app/dashboard/catalogue/page.tsx
// Page de gestion du catalogue — deux onglets : Catégories et Produits.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement : GET /api/categories au montage (partagé entre les deux onglets),
//     GET /api/products au montage
//   - Filtrage produits 100% client-side via useMemo (nom/SKU, catégorie, statut)
//   - Modales inline : CategoryFormModal, DeleteCategoryModal,
//     ProductFormModal, DeactivateProductModal, ReactivateProductModal
//
// Sécurité UI :
//   - Vérification de rôle après hydratation → router.replace('/dashboard')
//     si rôle inconnu (ni SA ni Admin).
//   - SA : accès complet (création, édition, actions par ligne visibles).
//   - Admin : lecture seule (boutons d'action absents du DOM).

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
// Constantes de rôle
// ---------------------------------------------------------------------------

const ROLE_SA    = 'Super Administrateur';
const ROLE_ADMIN = 'Administrateur';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  parent: { id: string; name: string } | null;
  _count: { products: number; children: number };
}

type ProductUnit = 'PIECE' | 'KG' | 'G' | 'L' | 'CL' | 'ML' | 'BOUTEILLE' | 'SACHET' | 'BOITE';

const UNIT_LABELS: Record<ProductUnit, string> = {
  PIECE:    'Pièce',
  KG:       'Kilogramme (kg)',
  G:        'Gramme (g)',
  L:        'Litre (L)',
  CL:       'Centilitre (cL)',
  ML:       'Millilitre (mL)',
  BOUTEILLE:'Bouteille',
  SACHET:   'Sachet',
  BOITE:    'Boîte',
};

const PRODUCT_UNITS: ProductUnit[] = ['PIECE', 'KG', 'G', 'L', 'CL', 'ML', 'BOUTEILLE', 'SACHET', 'BOITE'];

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string; // Decimal as string — parseFloat() pour affichage
  unit: ProductUnit;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category_id: string;
  category: { id: string; name: string };
  _count: { inventories: number };
}

type ActiveTab = 'categories' | 'products';

// ---------------------------------------------------------------------------
// Classes communes
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

// ---------------------------------------------------------------------------
// Icône Reset
// ---------------------------------------------------------------------------

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
// Lignes skeleton (réutilisables)
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
// Badge statut produit
// ---------------------------------------------------------------------------

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
      Actif
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-borderLight text-textMuted">
      Inactif
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helper prix FCFA
// ---------------------------------------------------------------------------

function formatPrice(price: string): string {
  return (
    parseFloat(price).toLocaleString('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + ' FCFA'
  );
}

// ===========================================================================
// MODALES — CATÉGORIES
// ===========================================================================

// ---------------------------------------------------------------------------
// Modale : Formulaire Catégorie (création + édition)
// ---------------------------------------------------------------------------

function CategoryFormModal({
  isOpen,
  category,
  categories,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  category: CategoryRow | null;
  categories: CategoryRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = category !== null;

  const [name, setName]             = useState('');
  const [parentId, setParentId]     = useState<string>('');
  const [nameError, setNameError]   = useState<string | null>(null);
  const [apiError, setApiError]     = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Initialiser le formulaire à l'ouverture
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && category) {
      setName(category.name);
      setParentId(category.parent_id ?? '');
    } else {
      setName('');
      setParentId('');
    }
    setNameError(null);
    setApiError(null);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, category?.id]);

  // Fermeture par Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Catégories disponibles comme parent : toutes sauf la catégorie en cours d'édition
  const parentOptions = useMemo(
    () => categories.filter((c) => c.id !== category?.id),
    [categories, category?.id]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setApiError(null);

    if (!name.trim()) {
      setNameError('Le nom est requis.');
      firstInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    // Ne pas inclure parent_id si vide — Zod rejette null sur un champ .optional()
    const payload: { name: string; parent_id?: string } = { name: name.trim() };
    if (parentId) payload.parent_id = parentId;

    try {
      if (isEdit && category) {
        await apiClient.put(`/api/categories/${category.id}`, payload);
      } else {
        await apiClient.post('/api/categories', payload);
      }
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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="category-form-title" className="text-base font-medium text-textMain">
            {isEdit ? 'Modifier la catégorie' : 'Créer une catégorie'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* Nom */}
            <div className="flex flex-col gap-1">
              <label htmlFor="cat-name" className="text-xs font-medium text-textSecondary">
                Nom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="cat-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                className={inputCls + (nameError ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={nameError ? 'cat-name-err' : undefined}
              />
              {nameError && (
                <p id="cat-name-err" role="alert" className="text-xs text-danger">
                  {nameError}
                </p>
              )}
            </div>

            {/* Catégorie parente */}
            <div className="flex flex-col gap-1">
              <label htmlFor="cat-parent" className="text-xs font-medium text-textSecondary">
                Catégorie parente
              </label>
              <select
                id="cat-parent"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className={inputCls}
              >
                <option value="">— Aucune (catégorie racine) —</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Erreur API */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation de suppression de catégorie
// ---------------------------------------------------------------------------

function DeleteCategoryModal({
  category,
  onClose,
  onSuccess,
}: {
  category: CategoryRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!category) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [category]);

  useEffect(() => {
    if (!category) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [category, onClose]);

  async function handleConfirm() {
    if (!category) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.delete(`/api/categories/${category.id}`);
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 409) {
          setApiError(
            'Cette catégorie ne peut pas être supprimée car elle contient des produits ou des sous-catégories.'
          );
        } else {
          setApiError(err.response?.data?.message ?? 'Une erreur est survenue.');
        }
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!category) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-category-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="delete-category-title" className="text-base font-medium text-textMain">
            Supprimer la catégorie
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
            Voulez-vous supprimer définitivement{' '}
            <strong className="text-textMain">{category.name}</strong> ?
          </p>
          <p className="text-sm text-textMuted">
            Cette action est irréversible. La catégorie doit être vide
            (aucun produit, aucune sous-catégorie).
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
            Supprimer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// MODALE — FORMATS DE CONDITIONNEMENT
// ===========================================================================

interface PackagingFormatRow {
  id:                string;
  product_id:        string;
  label:             string;
  units_per_package: number;
  is_base_unit:      boolean;
}

function PackagingFormatsModal({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const [formats,       setFormats]       = useState<PackagingFormatRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState<string | null>(null);

  // Formulaire ajout
  const [addLabel,      setAddLabel]      = useState('');
  const [addUnits,      setAddUnits]      = useState('1');
  const [addIsBase,     setAddIsBase]     = useState(false);
  const [addSaving,     setAddSaving]     = useState(false);
  const [addError,      setAddError]      = useState<string | null>(null);

  // Édition inline
  const [editId,        setEditId]        = useState<string | null>(null);
  const [editLabel,     setEditLabel]     = useState('');
  const [editUnits,     setEditUnits]     = useState('');
  const [editIsBase,    setEditIsBase]    = useState(false);
  const [editSaving,    setEditSaving]    = useState(false);
  const [editError,     setEditError]     = useState<string | null>(null);

  // Suppression
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setFetchError(null);
    apiClient.get(`/api/products/${product.id}/packaging-formats`)
      .then(({ data }) => setFormats(data.formats as PackagingFormatRow[]))
      .catch(() => setFetchError('Impossible de charger les formats.'))
      .finally(() => setLoading(false));
  }, [product]);

  useEffect(() => {
    if (!product) return;
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const units = parseInt(addUnits, 10);
    if (!addLabel.trim()) { setAddError('Le libellé est obligatoire.'); return; }
    if (isNaN(units) || units < 1) { setAddError('Le coefficient doit être ≥ 1.'); return; }

    setAddSaving(true);
    try {
      const { data } = await apiClient.post(`/api/products/${product!.id}/packaging-formats`, {
        label:             addLabel.trim(),
        units_per_package: units,
        is_base_unit:      addIsBase,
      });
      setFormats((prev) => [...prev, data.format as PackagingFormatRow].sort(
        (a, b) => a.units_per_package - b.units_per_package
      ));
      setAddLabel('');
      setAddUnits('1');
      setAddIsBase(false);
    } catch (err) {
      if (axios.isAxiosError(err)) setAddError(err.response?.data?.message ?? 'Erreur.');
      else setAddError('Erreur inattendue.');
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(fmt: PackagingFormatRow) {
    setEditId(fmt.id);
    setEditLabel(fmt.label);
    setEditUnits(String(fmt.units_per_package));
    setEditIsBase(fmt.is_base_unit);
    setEditError(null);
  }

  async function handleEditSave() {
    if (!editId) return;
    setEditError(null);
    const units = parseInt(editUnits, 10);
    if (!editLabel.trim()) { setEditError('Le libellé est obligatoire.'); return; }
    if (isNaN(units) || units < 1) { setEditError('Le coefficient doit être ≥ 1.'); return; }

    setEditSaving(true);
    try {
      const { data } = await apiClient.put(
        `/api/products/${product!.id}/packaging-formats/${editId}`,
        { label: editLabel.trim(), units_per_package: units, is_base_unit: editIsBase },
      );
      setFormats((prev) =>
        prev.map((f) => {
          if (f.id === editId) return data.format as PackagingFormatRow;
          // Si ce format est devenu la nouvelle unité de base, désactiver les autres
          if ((data.format as PackagingFormatRow).is_base_unit && f.is_base_unit) {
            return { ...f, is_base_unit: false };
          }
          return f;
        }).sort((a, b) => a.units_per_package - b.units_per_package)
      );
      setEditId(null);
    } catch (err) {
      if (axios.isAxiosError(err)) setEditError(err.response?.data?.message ?? 'Erreur.');
      else setEditError('Erreur inattendue.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await apiClient.delete(`/api/products/${product!.id}/packaging-formats/${id}`);
      setFormats((prev) => prev.filter((f) => f.id !== id));
      if (editId === id) setEditId(null);
    } catch (err) {
      if (axios.isAxiosError(err)) setFetchError(err.response?.data?.message ?? 'Erreur suppression.');
    } finally {
      setDeletingId(null);
    }
  }

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-formats-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight flex-shrink-0">
          <div>
            <h2 id="modal-formats-title" className="text-base font-medium text-textMain">
              Formats de conditionnement
            </h2>
            <p className="text-xs text-textMuted mt-0.5">
              {product.name}{' '}
              <span className="font-mono">{product.sku}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-6 py-5 gap-5">

          {fetchError && (
            <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
              {fetchError}
            </p>
          )}

          {/* Liste des formats existants */}
          <section>
            <p className="text-xs font-medium text-textSecondary mb-2 uppercase tracking-wide">
              Formats définis
            </p>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((n) => (
                  <div key={n} className="h-10 bg-borderLight rounded animate-pulse" />
                ))}
              </div>
            ) : formats.length === 0 ? (
              <p className="text-sm text-textMuted italic py-2">
                Aucun format défini pour ce produit.
              </p>
            ) : (
              <div className="divide-y divide-borderLight border border-borderLight rounded overflow-hidden">
                {formats.map((fmt) => (
                  <div key={fmt.id} className="bg-background">
                    {editId === fmt.id ? (
                      /* Ligne en mode édition */
                      <div className="px-4 py-3 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className={inputCls + ' flex-1'}
                            placeholder="Libellé…"
                          />
                          <input
                            type="number"
                            min={1}
                            value={editUnits}
                            onChange={(e) => setEditUnits(e.target.value)}
                            className={inputCls + ' w-24'}
                            placeholder="Coeff."
                          />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-textMuted cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editIsBase}
                            onChange={(e) => setEditIsBase(e.target.checked)}
                            className="rounded"
                          />
                          Unité de base (coefficient = 1)
                        </label>
                        {editError && (
                          <p className="text-xs text-danger">{editError}</p>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button variant="secondary" size="sm" onClick={() => setEditId(null)}>
                            Annuler
                          </Button>
                          <Button size="sm" onClick={handleEditSave} disabled={editSaving}>
                            {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      /* Ligne affichage */
                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-textMain">{fmt.label}</span>
                          <span className="ml-2 text-xs text-textMuted">
                            ×{fmt.units_per_package} unité{fmt.units_per_package > 1 ? 's' : ''}
                          </span>
                          {fmt.is_base_unit && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                              Base
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => startEdit(fmt)}
                            aria-label={`Modifier ${fmt.label}`}
                          >
                            Modifier
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(fmt.id)}
                            disabled={deletingId === fmt.id}
                            aria-label={`Supprimer ${fmt.label}`}
                          >
                            {deletingId === fmt.id ? '…' : 'Supprimer'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Formulaire ajout */}
          <section>
            <p className="text-xs font-medium text-textSecondary mb-2 uppercase tracking-wide">
              Ajouter un format
            </p>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-textSecondary">Libellé</label>
                  <input
                    type="text"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className={inputCls}
                    placeholder="ex. Carton, Pack ×6, Palette…"
                  />
                </div>
                <div className="flex flex-col gap-1 w-28">
                  <label className="text-xs text-textSecondary">Coefficient</label>
                  <input
                    type="number"
                    min={1}
                    value={addUnits}
                    onChange={(e) => setAddUnits(e.target.value)}
                    className={inputCls}
                    placeholder="ex. 24"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-textMuted cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={addIsBase}
                  onChange={(e) => setAddIsBase(e.target.checked)}
                  className="rounded"
                />
                Unité de base — coefficient obligatoirement 1
              </label>
              {addError && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded px-3 py-2">
                  {addError}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={addSaving}>
                  {addSaving ? 'Ajout…' : '+ Ajouter'}
                </Button>
              </div>
            </form>
          </section>
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-end flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// MODALES — PRODUITS
// ===========================================================================

// ---------------------------------------------------------------------------
// Modale : Formulaire Produit (création + édition)
// ---------------------------------------------------------------------------

interface ProductFormData {
  sku: string;
  name: string;
  price: string;
  unit: ProductUnit;
  category_id: string;
  description: string;
}

function ProductFormModal({
  isOpen,
  product,
  categories,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  product: ProductRow | null;
  categories: CategoryRow[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = product !== null;

  const emptyForm: ProductFormData = {
    sku:         '',
    name:        '',
    price:       '',
    unit:        'PIECE',
    category_id: '',
    description: '',
  };

  const [form, setForm]       = useState<ProductFormData>(emptyForm);
  const [errors, setErrors]   = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && product) {
      setForm({
        sku:         product.sku,
        name:        product.name,
        price:       parseFloat(product.price).toString(),
        unit:        product.unit,
        category_id: product.category_id,
        description: product.description ?? '',
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    setApiError(null);
    setTimeout(() => firstInputRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, product?.id]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  function validate(): boolean {
    const next: Partial<Record<keyof ProductFormData, string>> = {};
    if (!form.sku.trim())         next.sku  = 'Le SKU est requis.';
    if (!form.name.trim())        next.name = 'Le nom est requis.';
    if (!form.category_id)        next.category_id = 'La catégorie est requise.';
    const priceVal = parseFloat(form.price);
    if (!form.price.trim() || isNaN(priceVal) || priceVal <= 0) {
      next.price = 'Le prix doit être un nombre positif.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    const payload: Record<string, string | number> = {
      name:        form.name.trim(),
      price:       parseFloat(form.price),
      unit:        form.unit,
      category_id: form.category_id,
    };
    // Champs optionnels — omis si vides (Zod rejette null sur .optional())
    if (form.description.trim()) payload.description = form.description.trim();
    // SKU uniquement en création (immuable en édition)
    if (!isEdit) payload.sku = form.sku.trim();

    try {
      if (isEdit && product) {
        await apiClient.put(`/api/products/${product.id}`, payload);
      } else {
        await apiClient.post('/api/products', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 409) {
          setErrors((prev) => ({ ...prev, sku: 'Ce SKU est déjà utilisé.' }));
        } else if (status === 422) {
          setErrors((prev) => ({
            ...prev,
            category_id: 'Catégorie introuvable.',
          }));
        } else {
          setApiError(err.response?.data?.message ?? 'Une erreur est survenue.');
        }
      } else {
        setApiError('Une erreur inattendue est survenue.');
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
      aria-labelledby="product-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-surface border border-borderLight rounded shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="product-form-title" className="text-base font-medium text-textMain">
            {isEdit ? 'Modifier le produit' : 'Créer un produit'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 flex flex-col gap-4">

            {/* SKU */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-sku" className="text-xs font-medium text-textSecondary">
                SKU <span className="text-danger" aria-hidden="true">*</span>
                {isEdit && (
                  <span className="ml-1 text-textMuted font-normal">(non modifiable)</span>
                )}
              </label>
              <input
                ref={firstInputRef}
                id="prod-sku"
                type="text"
                value={form.sku}
                onChange={(e) => {
                  if (isEdit) return; // immuable en édition
                  setForm((f) => ({ ...f, sku: e.target.value }));
                  if (errors.sku) setErrors((prev) => ({ ...prev, sku: undefined }));
                }}
                readOnly={isEdit}
                className={
                  inputCls +
                  (errors.sku ? ' border-danger' : '') +
                  (isEdit ? ' bg-background text-textMuted cursor-not-allowed' : '')
                }
                aria-required={!isEdit}
                aria-describedby={errors.sku ? 'prod-sku-err' : undefined}
              />
              {errors.sku && (
                <p id="prod-sku-err" role="alert" className="text-xs text-danger">
                  {errors.sku}
                </p>
              )}
            </div>

            {/* Nom */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-name" className="text-xs font-medium text-textSecondary">
                Nom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="prod-name"
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={inputCls + (errors.name ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.name ? 'prod-name-err' : undefined}
              />
              {errors.name && (
                <p id="prod-name-err" role="alert" className="text-xs text-danger">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Prix */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-price" className="text-xs font-medium text-textSecondary">
                Prix (FCFA) <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="prod-price"
                type="number"
                min="0.01"
                step="0.01"
                value={form.price}
                onChange={(e) => {
                  setForm((f) => ({ ...f, price: e.target.value }));
                  if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                }}
                className={inputCls + (errors.price ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.price ? 'prod-price-err' : undefined}
              />
              {errors.price && (
                <p id="prod-price-err" role="alert" className="text-xs text-danger">
                  {errors.price}
                </p>
              )}
            </div>

            {/* Unité */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-unit" className="text-xs font-medium text-textSecondary">
                Unité de stock <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <select
                id="prod-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as ProductUnit }))}
                className={inputCls}
              >
                {PRODUCT_UNITS.map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>

            {/* Catégorie */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-category" className="text-xs font-medium text-textSecondary">
                Catégorie <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <select
                id="prod-category"
                value={form.category_id}
                onChange={(e) => {
                  setForm((f) => ({ ...f, category_id: e.target.value }));
                  if (errors.category_id) setErrors((prev) => ({ ...prev, category_id: undefined }));
                }}
                className={inputCls + (errors.category_id ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.category_id ? 'prod-cat-err' : undefined}
              >
                <option value="">— Sélectionner une catégorie —</option>
                {(() => {
                  // Catégories racines avec sous-catégories → optgroup (non sélectionnables)
                  // Catégories racines sans enfants → option sélectionnable
                  // Sous-catégories → regroupées dans l'optgroup de leur parent
                  const roots    = categories.filter((c) => c.parent_id === null);
                  const children = categories.filter((c) => c.parent_id !== null);

                  return roots.map((root) => {
                    const subs = children.filter((c) => c.parent_id === root.id);
                    if (subs.length > 0) {
                      // Catégorie parente → repère visuel, sous-catégories sélectionnables
                      return (
                        <optgroup key={root.id} label={root.name}>
                          {subs.map((sub) => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </optgroup>
                      );
                    }
                    // Catégorie feuille (pas d'enfants) → sélectionnable directement
                    return <option key={root.id} value={root.id}>{root.name}</option>;
                  });
                })()}
              </select>
              {errors.category_id && (
                <p id="prod-cat-err" role="alert" className="text-xs text-danger">
                  {errors.category_id}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label htmlFor="prod-desc" className="text-xs font-medium text-textSecondary">
                Description
              </label>
              <textarea
                id="prod-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Description optionnelle du produit…"
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* Erreur API générique */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-borderLight flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
              {isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Désactivation produit
// ---------------------------------------------------------------------------

function DeactivateProductModal({
  product,
  onClose,
  onSuccess,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!product) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  async function handleConfirm() {
    if (!product) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/products/${product.id}/deactivate`);
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

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-product-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="deactivate-product-title" className="text-base font-medium text-textMain">
            Désactiver le produit
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
            Voulez-vous désactiver{' '}
            <strong className="text-textMain">{product.name}</strong>{' '}
            <span className="text-textMuted font-mono text-xs">({product.sku})</span> ?
          </p>
          <p className="text-sm text-textMuted">
            Le produit ne sera plus disponible à la vente mais ses données seront conservées.
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
// Modale : Réactivation produit
// ---------------------------------------------------------------------------

function ReactivateProductModal({
  product,
  onClose,
  onSuccess,
}: {
  product: ProductRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!product) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [product, onClose]);

  async function handleConfirm() {
    if (!product) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/products/${product.id}/reactivate`);
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

  if (!product) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-product-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="reactivate-product-title" className="text-base font-medium text-textMain">
            Réactiver le produit
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
            Voulez-vous réactiver{' '}
            <strong className="text-textMain">{product.name}</strong>{' '}
            <span className="text-textMuted font-mono text-xs">({product.sku})</span> ?
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

// ===========================================================================
// ONGLET CATÉGORIES
// ===========================================================================

function CategoriesTab({
  categories,
  isLoading,
  fetchError,
  isSA,
  onReload,
}: {
  categories: CategoryRow[];
  isLoading: boolean;
  fetchError: string | null;
  isSA: boolean;
  onReload: () => void;
}) {
  const [modalCreate, setModalCreate]             = useState(false);
  const [categoryToEdit, setCategoryToEdit]       = useState<CategoryRow | null>(null);
  const [categoryToDelete, setCategoryToDelete]   = useState<CategoryRow | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête onglet */}
      {isSA && (
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
            Créer une catégorie
          </Button>
        </div>
      )}

      {/* Compteur */}
      {!isLoading && !fetchError && (
        <p className="text-xs text-textMuted -mt-2">
          {categories.length === 0
            ? 'Aucune catégorie.'
            : `${categories.length} catégorie${categories.length > 1 ? 's' : ''}`}
        </p>
      )}

      {/* Erreur */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Liste des catégories"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Nom', 'Catégorie parente', 'Produits directs', 'Sous-catégories', ...(isSA ? ['Actions'] : [])].map((col) => (
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
              <SkeletonRows cols={isSA ? 5 : 4} />
            ) : categories.length === 0 ? (
              <tr>
                <td
                  colSpan={isSA ? 5 : 4}
                  className="px-4 py-10 text-center text-sm text-textMuted"
                >
                  Aucune catégorie trouvée.
                </td>
              </tr>
            ) : (
              categories.map((cat) => {
                const canDelete =
                  cat._count.products === 0 && cat._count.children === 0;
                return (
                  <tr
                    key={cat.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                      {cat.name}
                    </td>
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {cat.parent ? cat.parent.name : (
                        <span className="text-textMuted/50 italic text-xs">Racine</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-textMuted text-center">
                      {cat._count.products}
                    </td>
                    <td className="px-4 py-3 text-textMuted text-center">
                      {cat._count.children}
                    </td>
                    {isSA && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setCategoryToEdit(cat)}
                            aria-label={`Modifier ${cat.name}`}
                          >
                            Modifier
                          </Button>
                          {canDelete && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setCategoryToDelete(cat)}
                              aria-label={`Supprimer ${cat.name}`}
                            >
                              Supprimer
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

      {/* Modales catégories */}
      <CategoryFormModal
        isOpen={modalCreate}
        category={null}
        categories={categories}
        onClose={() => setModalCreate(false)}
        onSuccess={onReload}
      />
      <CategoryFormModal
        isOpen={categoryToEdit !== null}
        category={categoryToEdit}
        categories={categories}
        onClose={() => setCategoryToEdit(null)}
        onSuccess={onReload}
      />
      <DeleteCategoryModal
        category={categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        onSuccess={onReload}
      />
    </div>
  );
}

// ===========================================================================
// ONGLET PRODUITS
// ===========================================================================

function ProductsTab({
  products,
  categories,
  isLoading,
  fetchError,
  isSA,
  canEditProducts,
  onReload,
}: {
  products: ProductRow[];
  categories: CategoryRow[];
  isLoading: boolean;
  fetchError: string | null;
  isSA: boolean;
  canEditProducts: boolean;
  onReload: () => void;
}) {
  // Filtres
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory]   = useState('');
  const [filterStatus, setFilterStatus]       = useState<'ACTIVE' | 'INACTIVE' | ''>('');

  // Modales
  const [modalCreate, setModalCreate]                     = useState(false);
  const [productToEdit, setProductToEdit]                 = useState<ProductRow | null>(null);
  const [productToDeactivate, setProductToDeactivate]     = useState<ProductRow | null>(null);
  const [productToReactivate, setProductToReactivate]     = useState<ProductRow | null>(null);
  const [productForFormats, setProductForFormats]         = useState<ProductRow | null>(null);

  // Debounce 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filtrage client-side
  const filteredProducts = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku  = p.sku.toLowerCase().includes(q);
        if (!matchName && !matchSku) return false;
      }
      if (filterCategory && p.category_id !== filterCategory) return false;
      if (filterStatus === 'ACTIVE'   && !p.is_active) return false;
      if (filterStatus === 'INACTIVE' &&  p.is_active) return false;
      return true;
    });
  }, [products, debouncedSearch, filterCategory, filterStatus]);

  const hasActiveFilters = search !== '' || filterCategory !== '' || filterStatus !== '';

  function handleReset() {
    setSearch('');
    setFilterCategory('');
    setFilterStatus('');
  }

  const colCount = canEditProducts ? 7 : 6;  // SKU Nom Catégorie Unité Prix Statut [Actions]
  // Note : isSA ajoute le bouton "Formats" dans la colonne Actions existante

  return (
    <div className="flex flex-col gap-6">
      {/* En-tête onglet */}
      {canEditProducts && (
        <div className="flex justify-end">
          <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
            Créer un produit
          </Button>
        </div>
      )}

      {/* Barre de filtres */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">
        {/* Recherche */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label htmlFor="search-products" className="text-xs font-medium text-textSecondary">
            Recherche
          </label>
          <input
            id="search-products"
            type="search"
            placeholder="Nom ou SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Filtre catégorie */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-cat" className="text-xs font-medium text-textSecondary">
            Catégorie
          </label>
          <select
            id="filter-cat"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={inputCls}
          >
            <option value="">Toutes les catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Filtre statut */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status-prod" className="text-xs font-medium text-textSecondary">
            Statut
          </label>
          <select
            id="filter-status-prod"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | '')}
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INACTIVE">Inactifs</option>
          </select>
        </div>

        {/* Réinitialiser */}
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
          {filteredProducts.length === 0
            ? 'Aucun produit ne correspond aux filtres.'
            : filteredProducts.length === products.length
              ? `${products.length} produit${products.length > 1 ? 's' : ''}`
              : `${filteredProducts.length} produit${filteredProducts.length > 1 ? 's' : ''} affiché${filteredProducts.length > 1 ? 's' : ''} sur ${products.length}`}
        </p>
      )}

      {/* Erreur */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Liste des produits"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['SKU', 'Nom', 'Catégorie', 'Unité', 'Prix', 'Statut', ...(canEditProducts ? ['Actions'] : [])].map((col) => (
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
              <SkeletonRows cols={colCount} />
            ) : filteredProducts.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-10 text-center text-sm text-textMuted"
                >
                  {products.length === 0
                    ? 'Aucun produit trouvé.'
                    : 'Aucun produit ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-textMuted whitespace-nowrap">
                    {product.sku}
                  </td>
                  <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                    {product.name}
                  </td>
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {product.category.name}
                  </td>
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {UNIT_LABELS[product.unit] ?? product.unit}
                  </td>
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap tabular-nums">
                    {formatPrice(product.price)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge isActive={product.is_active} />
                  </td>
                  {canEditProducts && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setProductToEdit(product)}
                          aria-label={`Modifier ${product.name}`}
                        >
                          Modifier
                        </Button>
                        {isSA && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setProductForFormats(product)}
                            aria-label={`Formats de conditionnement — ${product.name}`}
                          >
                            Formats
                          </Button>
                        )}
                        {isSA && product.is_active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setProductToDeactivate(product)}
                            aria-label={`Désactiver ${product.name}`}
                          >
                            Désactiver
                          </Button>
                        )}
                        {isSA && !product.is_active && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setProductToReactivate(product)}
                            aria-label={`Réactiver ${product.name}`}
                          >
                            Réactiver
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modales produits */}
      <ProductFormModal
        isOpen={modalCreate}
        product={null}
        categories={categories}
        onClose={() => setModalCreate(false)}
        onSuccess={onReload}
      />
      <ProductFormModal
        isOpen={productToEdit !== null}
        product={productToEdit}
        categories={categories}
        onClose={() => setProductToEdit(null)}
        onSuccess={onReload}
      />
      <DeactivateProductModal
        product={productToDeactivate}
        onClose={() => setProductToDeactivate(null)}
        onSuccess={onReload}
      />
      <ReactivateProductModal
        product={productToReactivate}
        onClose={() => setProductToReactivate(null)}
        onSuccess={onReload}
      />
      <PackagingFormatsModal
        product={productForFormats}
        onClose={() => setProductForFormats(null)}
      />
    </div>
  );
}

// ===========================================================================
// COMPOSANT PRINCIPAL
// ===========================================================================

export default function CataloguePage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection si rôle non autorisé
  useEffect(() => {
    if (sessionLoading || sessionUser === null) return;
    const role = sessionUser.roleName;
    if (role !== ROLE_SA && role !== ROLE_ADMIN) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  const isSA             = !sessionLoading && sessionUser?.roleName === ROLE_SA;
  const canEditProducts  = !sessionLoading && (
    sessionUser?.roleName === ROLE_SA || sessionUser?.roleName === ROLE_ADMIN
  );

  // Onglet actif — Produits par défaut
  const [activeTab, setActiveTab] = useState<ActiveTab>('products');

  // Données
  const [categories, setCategories]   = useState<CategoryRow[]>([]);
  const [products, setProducts]       = useState<ProductRow[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [prodsLoading, setProdsLoading] = useState(true);
  const [catsError, setCatsError]     = useState<string | null>(null);
  const [prodsError, setProdsError]   = useState<string | null>(null);

  // Chargement des catégories (partagé entre les deux onglets)
  const loadCategories = useCallback(async () => {
    setCatsLoading(true);
    setCatsError(null);
    try {
      const res = await apiClient.get<{ success: boolean; categories: CategoryRow[] }>(
        '/api/categories'
      );
      setCategories(res.data.categories ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setCatsError(err.response?.data?.message ?? 'Impossible de charger les catégories.');
      } else {
        setCatsError('Une erreur inattendue est survenue.');
      }
    } finally {
      setCatsLoading(false);
    }
  }, []);

  // Chargement des produits
  const loadProducts = useCallback(async () => {
    setProdsLoading(true);
    setProdsError(null);
    try {
      const res = await apiClient.get<{ success: boolean; products: ProductRow[] }>(
        '/api/products'
      );
      setProducts(res.data.products ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setProdsError(err.response?.data?.message ?? 'Impossible de charger les produits.');
      } else {
        setProdsError('Une erreur inattendue est survenue.');
      }
    } finally {
      setProdsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!sessionUser) return;
    const role = sessionUser.roleName;
    if (role !== ROLE_SA && role !== ROLE_ADMIN) return;
    // Chargement parallèle au montage
    loadCategories();
    loadProducts();
  }, [sessionLoading, sessionUser, loadCategories, loadProducts]);

  // ---------------------------------------------------------------------------
  // Garde de rendu — session en cours ou rôle non autorisé
  // ---------------------------------------------------------------------------

  if (
    sessionLoading ||
    !sessionUser ||
    (sessionUser.roleName !== ROLE_SA && sessionUser.roleName !== ROLE_ADMIN)
  ) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-56 bg-borderLight rounded animate-pulse" aria-hidden="true" />
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

  // ---------------------------------------------------------------------------
  // Rendu principal
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6">

      {/* En-tête de page */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-textMain">Catalogue</h1>
      </div>

      {/* Onglets */}
      <div
        role="tablist"
        aria-label="Sections du catalogue"
        className="flex gap-1 border-b border-borderLight"
      >
        {(
          [
            { id: 'products',   label: 'Produits'   },
            { id: 'categories', label: 'Catégories' },
          ] as { id: ActiveTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-textMuted hover:text-textMain',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Panneau actif */}
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'categories' ? (
          <CategoriesTab
            categories={categories}
            isLoading={catsLoading}
            fetchError={catsError}
            isSA={isSA}
            onReload={loadCategories}
          />
        ) : (
          <ProductsTab
            products={products}
            categories={categories}
            isLoading={prodsLoading}
            fetchError={prodsError}
            isSA={isSA}
            canEditProducts={canEditProducts}
            onReload={loadProducts}
          />
        )}
      </div>
    </div>
  );
}
