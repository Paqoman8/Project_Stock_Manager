// src/app/dashboard/stores/page.tsx
// Page de gestion des établissements — accès Super Administrateur uniquement.
//
// Architecture :
//   - Client Component (interactions, état local, appels API)
//   - Chargement depuis GET /api/stores au montage
//   - Filtrage 100% client-side via useMemo (nom, localisation, type, statut)
//   - Quatre modales inline : création/édition (StoreFormModal),
//     fermeture (CloseModal), réouverture (ReopenModal), suppression (DeleteModal)
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

const PALETTE_COLORS = [
  '#1D4ED8', '#0891B2', '#059669', '#65A30D',
  '#CA8A04', '#EA580C', '#DC2626', '#DB2777',
  '#9333EA', '#6366F1', '#374151', '#64748B',
];

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoreType   = 'MAGASIN' | 'BOUTIQUE' | 'ENTREPOT';
type StoreStatus = 'ACTIVE' | 'CLOSED';

interface StoreRow {
  id: string;
  name: string;
  location: string | null;
  color: string;
  phone: string | null;
  description: string | null;
  type: StoreType;
  status: StoreStatus;
  closed_at: string | null;
  _count: { user_access: number };
}

interface StoreFormData {
  name: string;
  type: StoreType | '';
  location: string;
  phone: string;
  description: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Labels d'affichage
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<StoreType, string> = {
  MAGASIN:  'Magasin',
  BOUTIQUE: 'Boutique',
  ENTREPOT: 'Entrepôt',
};

const STATUS_LABELS: Record<StoreStatus, string> = {
  ACTIVE: 'Ouvert',
  CLOSED: 'Fermé',
};

// ---------------------------------------------------------------------------
// Helpers visuels
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: StoreStatus }) {
  return status === 'ACTIVE' ? (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-success/10 text-success">
      Ouvert
    </span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-danger/10 text-danger">
      Fermé
    </span>
  );
}

function ColorDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border border-black/10 flex-shrink-0"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
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
          {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
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

function StoreFormModal({
  isOpen,
  store,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  store: StoreRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = store !== null;

  const emptyForm: StoreFormData = {
    name: '',
    type: '',
    location: '',
    phone: '',
    description: '',
    color: PALETTE_COLORS[0],
  };

  const [form, setForm] = useState<StoreFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof StoreFormData, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Remplir le formulaire avec les données de l'établissement en édition
  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && store) {
      setForm({
        name: store.name,
        type: store.type,
        location: store.location ?? '',
        phone: store.phone ?? '',
        description: store.description ?? '',
        color: store.color,
      });
    } else {
      setForm(emptyForm);
    }
    setErrors({});
    setApiError(null);
    // Focus initial après animation
    setTimeout(() => firstInputRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, store?.id]);

  // Fermeture par Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  function handleColorPaletteClick(hex: string) {
    setForm((f) => ({ ...f, color: hex }));
    setErrors((e) => ({ ...e, color: undefined }));
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setForm((f) => ({ ...f, color: val }));
    if (HEX_REGEX.test(val)) {
      setErrors((errs) => ({ ...errs, color: undefined }));
    }
  }

  function validate(): boolean {
    const next: Partial<Record<keyof StoreFormData, string>> = {};
    if (!form.name.trim()) next.name = 'Le nom est requis.';
    if (!form.type) next.type = 'Le type est requis.';
    if (!HEX_REGEX.test(form.color)) next.color = 'Format hex invalide (ex : #1D4ED8).';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setApiError(null);

    const payload: Record<string, string> = {
      name:  form.name.trim(),
      type:  form.type as string,
      color: form.color,
    };
    if (form.location.trim())    payload.location    = form.location.trim();
    if (form.phone.trim())       payload.phone       = form.phone.trim();
    if (form.description.trim()) payload.description = form.description.trim();

    try {
      if (isEdit && store) {
        await apiClient.patch(`/api/stores/${store.id}`, payload);
      } else {
        await apiClient.post('/api/stores', payload);
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
      aria-labelledby="store-form-title"
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
          <h2 id="store-form-title" className="text-base font-medium text-textMain">
            {isEdit ? 'Modifier l\'établissement' : 'Créer un établissement'}
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
              <label htmlFor="store-name" className="text-xs font-medium text-textSecondary">
                Nom <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                ref={firstInputRef}
                id="store-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={inputCls + (errors.name ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.name ? 'store-name-err' : undefined}
              />
              {errors.name && (
                <p id="store-name-err" role="alert" className="text-xs text-danger">{errors.name}</p>
              )}
            </div>

            {/* Type */}
            <div className="flex flex-col gap-1">
              <label htmlFor="store-type" className="text-xs font-medium text-textSecondary">
                Type <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <select
                id="store-type"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as StoreType | '' }))}
                className={inputCls + (errors.type ? ' border-danger' : '')}
                aria-required="true"
                aria-describedby={errors.type ? 'store-type-err' : undefined}
              >
                <option value="">Sélectionner un type…</option>
                <option value="MAGASIN">Magasin</option>
                <option value="BOUTIQUE">Boutique</option>
                <option value="ENTREPOT">Entrepôt</option>
              </select>
              {errors.type && (
                <p id="store-type-err" role="alert" className="text-xs text-danger">{errors.type}</p>
              )}
            </div>

            {/* Localisation */}
            <div className="flex flex-col gap-1">
              <label htmlFor="store-location" className="text-xs font-medium text-textSecondary">
                Localisation
              </label>
              <input
                id="store-location"
                type="text"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder="Ville, adresse…"
                className={inputCls}
              />
            </div>

            {/* Téléphone */}
            <div className="flex flex-col gap-1">
              <label htmlFor="store-phone" className="text-xs font-medium text-textSecondary">
                Téléphone
              </label>
              <input
                id="store-phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+33 1 23 45 67 89"
                className={inputCls}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label htmlFor="store-description" className="text-xs font-medium text-textSecondary">
                Description
              </label>
              <textarea
                id="store-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Notes internes, informations complémentaires…"
                className={inputCls + ' resize-none'}
              />
            </div>

            {/* Couleur */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-textSecondary">
                Couleur <span className="text-danger" aria-hidden="true">*</span>
              </span>

              {/* Pastille de prévisualisation */}
              <div className="flex items-center gap-2">
                <span
                  className="w-6 h-6 rounded-full border border-black/10 flex-shrink-0"
                  style={{ backgroundColor: HEX_REGEX.test(form.color) ? form.color : '#cccccc' }}
                  aria-hidden="true"
                />
                <span className="text-xs text-textMuted">Aperçu</span>
              </div>

              {/* Palette */}
              <div className="flex flex-wrap gap-2" role="group" aria-label="Palette de couleurs prédéfinies">
                {PALETTE_COLORS.map((hex) => {
                  const isSelected = form.color.toUpperCase() === hex.toUpperCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => handleColorPaletteClick(hex)}
                      aria-label={`Couleur ${hex}`}
                      aria-pressed={isSelected}
                      className={[
                        'w-7 h-7 rounded-full border-2 transition-transform',
                        isSelected
                          ? 'border-textMain scale-110'
                          : 'border-transparent hover:scale-105',
                      ].join(' ')}
                      style={{ backgroundColor: hex }}
                    />
                  );
                })}
              </div>

              {/* Champ hex libre */}
              <div className="flex flex-col gap-1">
                <label htmlFor="store-color-hex" className="text-xs text-textMuted">
                  Code hexadécimal
                </label>
                <input
                  id="store-color-hex"
                  type="text"
                  value={form.color}
                  onChange={handleHexInput}
                  placeholder="#RRGGBB"
                  maxLength={7}
                  className={inputCls + (errors.color ? ' border-danger' : '')}
                  aria-describedby={errors.color ? 'store-color-err' : undefined}
                />
                {errors.color && (
                  <p id="store-color-err" role="alert" className="text-xs text-danger">{errors.color}</p>
                )}
              </div>
            </div>

            {/* Erreur API */}
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
// Modale : Confirmation de fermeture
// ---------------------------------------------------------------------------

function CloseStoreModal({
  store,
  onClose,
  onSuccess,
}: {
  store: StoreRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!store) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [store]);

  useEffect(() => {
    if (!store) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [store, onClose]);

  async function handleConfirm() {
    if (!store) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.post(`/api/stores/${store.id}/close`);
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

  if (!store) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-store-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="close-store-title" className="text-base font-medium text-textMain">
            Fermer l&apos;établissement
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-textMuted">
            Voulez-vous fermer <strong className="text-textMain">{store.name}</strong> ?
          </p>
          {apiError && <p role="alert" className="mt-3 text-sm text-danger">{apiError}</p>}
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
            Fermer l&apos;établissement
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation de réouverture
// ---------------------------------------------------------------------------

function ReopenStoreModal({
  store,
  onClose,
  onSuccess,
}: {
  store: StoreRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!store) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [store]);

  useEffect(() => {
    if (!store) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [store, onClose]);

  async function handleConfirm() {
    if (!store) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.post(`/api/stores/${store.id}/reopen`);
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

  if (!store) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reopen-store-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="reopen-store-title" className="text-base font-medium text-textMain">
            Réouvrir l&apos;établissement
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-textMuted">
            Voulez-vous réouvrir <strong className="text-textMain">{store.name}</strong> ?
          </p>
          {apiError && <p role="alert" className="mt-3 text-sm text-danger">{apiError}</p>}
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
            Réouvrir
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale : Confirmation de suppression
// ---------------------------------------------------------------------------

function DeleteStoreModal({
  store,
  onClose,
  onSuccess,
}: {
  store: StoreRow | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!store) return;
    setApiError(null);
    setTimeout(() => confirmBtnRef.current?.focus(), 50);
  }, [store]);

  useEffect(() => {
    if (!store) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [store, onClose]);

  async function handleConfirm() {
    if (!store) return;
    setIsSubmitting(true);
    setApiError(null);
    try {
      await apiClient.delete(`/api/stores/${store.id}`);
      onSuccess();
      onClose();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Affichage du message d'erreur 409 (données existantes) dans la modale
        setApiError(err.response?.data?.message ?? 'Une erreur est survenue.');
      } else {
        setApiError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!store) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-store-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-surface border border-borderLight rounded shadow-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-borderLight">
          <h2 id="delete-store-title" className="text-base font-medium text-textMain">
            Supprimer l&apos;établissement
          </h2>
          <button onClick={onClose} aria-label="Fermer" className="text-textMuted hover:text-textMain transition-colors text-lg leading-none">
            ×
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-2">
          <p className="text-sm text-textMuted">
            Voulez-vous supprimer <strong className="text-textMain">{store.name}</strong> ?
          </p>
          <p className="text-sm font-medium text-danger">
            Cette action est irréversible.
          </p>
          {apiError && <p role="alert" className="mt-1 text-sm text-danger">{apiError}</p>}
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
            Supprimer définitivement
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function StoresPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection si non-SA (forbidden() ne fonctionne pas en Client Component)
  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && sessionUser.roleName !== ROLE_SA) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // --- Données ---
  const [stores, setStores]       = useState<StoreRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Filtres client-side ---
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // --- Contrôle des modales ---
  const [modalCreate, setModalCreate]         = useState(false);
  const [storeToEdit, setStoreToEdit]         = useState<StoreRow | null>(null);
  const [storeToClose, setStoreToClose]       = useState<StoreRow | null>(null);
  const [storeToReopen, setStoreToReopen]     = useState<StoreRow | null>(null);
  const [storeToDelete, setStoreToDelete]     = useState<StoreRow | null>(null);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await apiClient.get<{ success: boolean; stores: StoreRow[] }>('/api/stores');
      setStores(res.data.stores ?? []);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setFetchError(err.response?.data?.message ?? 'Impossible de charger les établissements.');
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

  const filteredStores = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores.filter((s) => {
      if (q) {
        const matchName     = s.name.toLowerCase().includes(q);
        const matchLocation = s.location?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchLocation) return false;
      }
      if (filterType   && s.type   !== filterType)   return false;
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    });
  }, [stores, search, filterType, filterStatus]);

  const hasActiveFilters = search !== '' || filterType !== '' || filterStatus !== '';

  function handleReset() {
    setSearch('');
    setFilterType('');
    setFilterStatus('');
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
            <tbody><SkeletonRows /></tbody>
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
        <h1 className="text-2xl font-semibold text-textMain">Établissements</h1>
        <Button variant="primary" size="md" onClick={() => setModalCreate(true)}>
          Créer un établissement
        </Button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded">

        {/* Recherche libre */}
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <label htmlFor="search-stores" className="text-xs font-medium text-textSecondary">
            Recherche
          </label>
          <input
            id="search-stores"
            type="search"
            placeholder="Nom ou localisation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Filtre par type */}
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-type" className="text-xs font-medium text-textSecondary">
            Type
          </label>
          <select
            id="filter-type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="MAGASIN">Magasin</option>
            <option value="BOUTIQUE">Boutique</option>
            <option value="ENTREPOT">Entrepôt</option>
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
            onChange={(e) => setFilterStatus(e.target.value)}
            className={inputCls}
          >
            <option value="">Tous</option>
            <option value="ACTIVE">Ouvert</option>
            <option value="CLOSED">Fermé</option>
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
          {filteredStores.length === 0
            ? 'Aucun établissement ne correspond aux filtres.'
            : filteredStores.length === stores.length
              ? `${stores.length} établissement${stores.length > 1 ? 's' : ''}`
              : `${filteredStores.length} établissement${filteredStores.length > 1 ? 's' : ''} affiché${filteredStores.length > 1 ? 's' : ''} sur ${stores.length}`}
        </p>
      )}

      {/* Erreur de chargement */}
      {fetchError && (
        <p role="alert" className="text-sm text-danger">{fetchError}</p>
      )}

      {/* Tableau */}
      <div className="bg-surface border border-borderLight rounded overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Liste des établissements">
          <thead>
            <tr className="bg-background border-b border-borderLight">
              {['Couleur', 'Nom', 'Type', 'Localisation', 'Téléphone', 'Statut', 'Utilisateurs', 'Actions'].map((col) => (
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
            ) : filteredStores.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-textMuted">
                  {stores.length === 0
                    ? 'Aucun établissement trouvé.'
                    : 'Aucun établissement ne correspond aux filtres.'}
                </td>
              </tr>
            ) : (
              filteredStores.map((store) => {
                const canDelete =
                  store.status === 'CLOSED' && store._count.user_access === 0;

                return (
                  <tr
                    key={store.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    {/* Couleur */}
                    <td className="px-4 py-3">
                      <ColorDot color={store.color} />
                    </td>

                    {/* Nom */}
                    <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                      {store.name}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {TYPE_LABELS[store.type]}
                    </td>

                    {/* Localisation */}
                    <td className="px-4 py-3 text-textMuted max-w-[160px]">
                      {store.location ?? <span aria-label="Non renseignée">—</span>}
                    </td>

                    {/* Téléphone */}
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {store.phone ?? <span aria-label="Non renseigné">—</span>}
                    </td>

                    {/* Statut */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={store.status} />
                    </td>

                    {/* Utilisateurs assignés */}
                    <td className="px-4 py-3 text-textMuted text-center">
                      {store._count.user_access}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setStoreToEdit(store)}
                          aria-label={`Modifier ${store.name}`}
                        >
                          Modifier
                        </Button>

                        {store.status === 'ACTIVE' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setStoreToClose(store)}
                            aria-label={`Fermer ${store.name}`}
                          >
                            Fermer
                          </Button>
                        )}

                        {store.status === 'CLOSED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setStoreToReopen(store)}
                            aria-label={`Réouvrir ${store.name}`}
                          >
                            Réouvrir
                          </Button>
                        )}

                        {canDelete && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setStoreToDelete(store)}
                            aria-label={`Supprimer ${store.name}`}
                          >
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      <StoreFormModal
        isOpen={modalCreate}
        store={null}
        onClose={() => setModalCreate(false)}
        onSuccess={loadData}
      />

      <StoreFormModal
        isOpen={storeToEdit !== null}
        store={storeToEdit}
        onClose={() => setStoreToEdit(null)}
        onSuccess={loadData}
      />

      <CloseStoreModal
        store={storeToClose}
        onClose={() => setStoreToClose(null)}
        onSuccess={loadData}
      />

      <ReopenStoreModal
        store={storeToReopen}
        onClose={() => setStoreToReopen(null)}
        onSuccess={loadData}
      />

      <DeleteStoreModal
        store={storeToDelete}
        onClose={() => setStoreToDelete(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
