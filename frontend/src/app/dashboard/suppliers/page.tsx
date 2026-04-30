// src/app/dashboard/suppliers/page.tsx
// Page de gestion des fournisseurs — accès Super Administrateur uniquement.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement depuis GET /api/suppliers au montage
//   - Filtrage 100% client-side via useMemo (nom, contact, email, statut)
//   - Trois modales inline : création/édition (SupplierFormModal),
//     désactivation (DeactivateSupplierModal), réactivation (ReactivateSupplierModal)
//
// Sécurité UI :
//   - Vérification de rôle après hydratation → router.replace('/dashboard')
//     si non-SA. forbidden() ne fonctionne pas dans un Client Component.

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

type PaymentTerms = 'IMMEDIATE' | 'NET30' | 'NET60' | 'NET90';

interface SupplierRow {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: PaymentTerms;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface SupplierFormData {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: PaymentTerms;
}

// ---------------------------------------------------------------------------
// Labels d'affichage
// ---------------------------------------------------------------------------

const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  IMMEDIATE: 'Paiement immédiat',
  NET30:     '30 jours net',
  NET60:     '60 jours net',
  NET90:     '90 jours net',
};

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

// ---------------------------------------------------------------------------
// Lignes skeleton
// ---------------------------------------------------------------------------

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((n) => (
        <tr key={n} aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((c) => (
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
// Icône reset
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
// Classes communes aux inputs/selects
// ---------------------------------------------------------------------------

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary w-full';

// ---------------------------------------------------------------------------
// Modale : Formulaire Création / Édition
// ---------------------------------------------------------------------------

function SupplierFormModal({
  isOpen,
  supplier,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  supplier: SupplierRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = supplier !== null;

  const emptyForm: SupplierFormData = {
    name:          '',
    contact_name:  '',
    email:         '',
    phone:         '',
    address:       '',
    payment_terms: 'IMMEDIATE',
  };

  const [form, setForm]           = useState<SupplierFormData>(emptyForm);
  const [errors, setErrors]       = useState<Partial<Record<keyof SupplierFormData, string>>>({});
  const [apiError, setApiError]   = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Remplir le formulaire avec les données du fournisseur en édition
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && supplier) {
      setForm({
        name:          supplier.name,
        contact_name:  supplier.contact_name ?? '',
        email:         supplier.email ?? '',
        phone:         supplier.phone ?? '',
        address:       supplier.address ?? '',
        payment_terms: supplier.payment_terms,
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    setApiError(null);
    // Focus initial après animation
    setTimeout(() => firstInputRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, supplier?.id]);

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
    const next: Partial<Record<keyof SupplierFormData, string>> = {};
    if (!form.name.trim()) next.name = 'Le nom est requis.';
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'L\'adresse e-mail n\'est pas valide.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    const payload: Record<string, string> = {
      name:          form.name.trim(),
      payment_terms: form.payment_terms,
    };
    if (form.contact_name.trim()) payload.contact_name = form.contact_name.trim();
    if (form.email.trim())        payload.email        = form.email.trim();
    if (form.phone.trim())        payload.phone        = form.phone.trim();
    if (form.address.trim())      payload.address      = form.address.trim();

    try {
      if (isEdit && supplier) {
        await apiClient.put(`/api/suppliers/${supplier.id}`, payload);
      } else {
        await apiClient.post('/api/suppliers', payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message = err.response?.data?.message ?? 'Une erreur est survenue.';
        // Conflit d'email : afficher l'erreur sur le champ email
        if (status === 409) {
          setErrors((prev) => ({
            ...prev,
            email: 'Cet email est déjà utilisé par un autre fournisseur.',
          }));
        } else {
          setApiError(message);
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
      aria-labelledby="supplier-form-title"
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
          <h2 id="supplier-form-title" className="text-base font-medium text-textMain">
            {isEdit ? 'Modifier le fournisseur' : 'Créer un fournisseur'}
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

            {/* Nom */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-name" className="text-xs font-medium text-textSecondary">
                Nom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="supplier-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls + (errors.name ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.name ? 'supplier-name-err' : undefined}
              />
              {errors.name && (
                <p id="supplier-name-err" role="alert" className="text-xs text-danger">
                  {errors.name}
                </p>
              )}
            </div>

            {/* Nom du contact */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-contact" className="text-xs font-medium text-textSecondary">
                Nom du contact
              </label>
              <input
                id="supplier-contact"
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                placeholder="Prénom Nom"
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-email" className="text-xs font-medium text-textSecondary">
                Email
              </label>
              <input
                id="supplier-email"
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm((f) => ({ ...f, email: e.target.value }));
                  // Effacer l'erreur email dès que l'utilisateur retape
                  if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                placeholder="contact@fournisseur.fr"
                className={inputCls + (errors.email ? ' border-danger' : '')}
                aria-describedby={errors.email ? 'supplier-email-err' : undefined}
              />
              {errors.email && (
                <p id="supplier-email-err" role="alert" className="text-xs text-danger">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Téléphone */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-phone" className="text-xs font-medium text-textSecondary">
                Téléphone
              </label>
              <input
                id="supplier-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+33 1 23 45 67 89"
                className={inputCls}
              />
            </div>

            {/* Adresse */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-address" className="text-xs font-medium text-textSecondary">
                Adresse
              </label>
              <textarea
                id="supplier-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                rows={3}
                placeholder="Rue, ville, code postal…"
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* Conditions de paiement */}
            <div className="flex flex-col gap-1">
              <label htmlFor="supplier-payment-terms" className="text-xs font-medium text-textSecondary">
                Conditions de paiement
              </label>
              <select
                id="supplier-payment-terms"
                value={form.payment_terms}
                onChange={(e) =>
                  setForm((f) => ({ ...f, payment_terms: e.target.value as PaymentTerms }))
                }
                className={inputCls}
              >
                <option value="IMMEDIATE">Paiement immédiat</option>
                <option value="NET30">30 jours net</option>
                <option value="NET60">60 jours net</option>
                <option value="NET90">90 jours net</option>
              </select>
            </div>

            {/* Erreur API générique */}
            {apiError && (
              <p role="alert" className="text-sm text-danger">{apiError}</p>
            )}
          </div>

          {/* Pied */}
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
// Modale : Confirmation de désactivation
// ---------------------------------------------------------------------------

function DeactivateSupplierModal({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: SupplierRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supplier) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [supplier]);

  useEffect(() => {
    if (!supplier) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [supplier, onClose]);

  async function handleConfirm() {
    if (!supplier) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/suppliers/${supplier.id}/deactivate`);
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

  if (!supplier) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-supplier-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="deactivate-supplier-title" className="text-base font-medium text-textMain">
            Désactiver le fournisseur
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
            <strong className="text-textMain">{supplier.name}</strong> ?
          </p>
          <p className="text-sm text-textMuted">
            Le fournisseur ne sera plus visible dans les sélections de l&apos;application
            mais ses données seront conservées.
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

function ReactivateSupplierModal({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: SupplierRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError]         = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!supplier) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [supplier]);

  useEffect(() => {
    if (!supplier) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [supplier, onClose]);

  async function handleConfirm() {
    if (!supplier) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.patch(`/api/suppliers/${supplier.id}/reactivate`);
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

  if (!supplier) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reactivate-supplier-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="reactivate-supplier-title" className="text-base font-medium text-textMain">
            Réactiver le fournisseur
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
            <strong className="text-textMain">{supplier.name}</strong> ?
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

export default function SuppliersPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection si non-SA
  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && sessionUser.roleName !== ROLE_SA) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // --- Données ---
  const [suppliers, setSuppliers]     = useState<SupplierRow[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // --- Filtres client-side ---
  const [search, setSearch]               = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus]   = useState<'ACTIVE' | 'INACTIVE' | ''>('');
  const [filterPayment, setFilterPayment] = useState<PaymentTerms | ''>('');

  // Debounce 300ms sur la recherche
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // --- Contrôle des modales ---
  const [modalCreate, setModalCreate]             = useState(false);
  const [supplierToEdit, setSupplierToEdit]       = useState<SupplierRow | null>(null);
  const [supplierToDeactivate, setSupplierToDeactivate] = useState<SupplierRow | null>(null);
  const [supplierToReactivate, setSupplierToReactivate] = useState<SupplierRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await apiClient.get<{ success: boolean; suppliers: SupplierRow[] }>(
        '/api/suppliers'
      );
      setSuppliers(res.data.suppliers ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setFetchError(
          err.response?.data?.message ?? 'Impossible de charger les fournisseurs.'
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

  const filteredSuppliers = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (q) {
        const matchName    = s.name.toLowerCase().includes(q);
        const matchContact = s.contact_name?.toLowerCase().includes(q) ?? false;
        const matchEmail   = s.email?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchContact && !matchEmail) return false;
      }
      if (filterStatus === 'ACTIVE'   && !s.is_active) return false;
      if (filterStatus === 'INACTIVE' &&  s.is_active) return false;
      if (filterPayment && s.payment_terms !== filterPayment) return false;
      return true;
    });
  }, [suppliers, debouncedSearch, filterStatus, filterPayment]);

  const hasActiveFilters = search !== '' || filterStatus !== '' || filterPayment !== '';

  function handleReset() {
    setSearch('');
    setFilterStatus('');
    setFilterPayment('');
  }

  // ---------------------------------------------------------------------------
  // Garde de rendu — pendant le chargement de la session ou si non-SA
  // ---------------------------------------------------------------------------

  if (sessionLoading || !sessionUser || sessionUser.roleName !== ROLE_SA) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-56 bg-borderLight rounded animate-pulse" aria-hidden="true" />
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
        <h1 className="text-2xl font-semibold text-textMain">Fournisseurs</h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Créer un fournisseur
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

        {/* Recherche libre */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label htmlFor="search-suppliers" className="text-xs font-medium text-textSecondary">
            Recherche
          </label>
          <input
            id="search-suppliers"
            type="search"
            placeholder="Nom, contact ou email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Filtre par statut */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-status" className="text-xs font-medium text-textSecondary">
            Statut
          </label>
          <select
            id="filter-status"
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as 'ACTIVE' | 'INACTIVE' | '')
            }
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Actifs</option>
            <option value="INACTIVE">Inactifs</option>
          </select>
        </div>

        {/* Filtre par conditions de paiement */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-payment" className="text-xs font-medium text-textSecondary">
            Conditions de paiement
          </label>
          <select
            id="filter-payment"
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value as PaymentTerms | '')}
            className={inputCls}
          >
            <option value="">Toutes</option>
            <option value="IMMEDIATE">Paiement immédiat</option>
            <option value="NET30">30 jours net</option>
            <option value="NET60">60 jours net</option>
            <option value="NET90">90 jours net</option>
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
          {filteredSuppliers.length === 0
            ? 'Aucun fournisseur ne correspond aux filtres.'
            : filteredSuppliers.length === suppliers.length
              ? `${suppliers.length} fournisseur${suppliers.length > 1 ? 's' : ''}`
              : `${filteredSuppliers.length} fournisseur${filteredSuppliers.length > 1 ? 's' : ''} affiché${filteredSuppliers.length > 1 ? 's' : ''} sur ${suppliers.length}`}
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
          aria-label="Liste des fournisseurs"
        >
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Nom', 'Contact', 'Email', 'Téléphone', 'Adresse', 'Conditions de paiement', 'Actions'].map((col) => (
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
            ) : filteredSuppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-textMuted">
                  {suppliers.length === 0
                    ? 'Aucun fournisseur trouvé.'
                    : 'Aucun fournisseur ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredSuppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  className="border-b border-borderLight hover:bg-background/50 transition-colors"
                >
                  {/* Nom + badge inactif */}
                  <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                    {supplier.name}
                    {!supplier.is_active && <InactiveBadge />}
                  </td>

                  {/* Contact */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {supplier.contact_name ?? <span aria-label="Non renseigné">—</span>}
                  </td>

                  {/* Email */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {supplier.email ? (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="hover:text-primary transition-colors underline underline-offset-2"
                      >
                        {supplier.email}
                      </a>
                    ) : (
                      <span aria-label="Non renseigné">—</span>
                    )}
                  </td>

                  {/* Téléphone */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {supplier.phone ?? <span aria-label="Non renseigné">—</span>}
                  </td>

                  {/* Adresse */}
                  <td className="px-4 py-3 text-textMuted max-w-[160px] truncate">
                    {supplier.address ?? <span aria-label="Non renseignée">—</span>}
                  </td>

                  {/* Conditions de paiement */}
                  <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                    {PAYMENT_TERMS_LABELS[supplier.payment_terms]}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSupplierToEdit(supplier)}
                        aria-label={`Modifier ${supplier.name}`}
                      >
                        Modifier
                      </Button>

                      {supplier.is_active ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSupplierToDeactivate(supplier)}
                          aria-label={`Désactiver ${supplier.name}`}
                        >
                          Désactiver
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSupplierToReactivate(supplier)}
                          aria-label={`Réactiver ${supplier.name}`}
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
      <SupplierFormModal
        isOpen={modalCreate}
        supplier={null}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
      />

      <SupplierFormModal
        isOpen={supplierToEdit !== null}
        supplier={supplierToEdit}
        onClose={() => setSupplierToEdit(null)}
        onSuccess={loadData}
      />

      <DeactivateSupplierModal
        supplier={supplierToDeactivate}
        onClose={() => setSupplierToDeactivate(null)}
        onSuccess={loadData}
      />

      <ReactivateSupplierModal
        supplier={supplierToReactivate}
        onClose={() => setSupplierToReactivate(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
