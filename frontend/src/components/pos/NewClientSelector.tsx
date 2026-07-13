'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/lib/apiClient';
import { extractApiError } from '@/lib/pos';

type ClientRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type ViewState = 'idle' | 'results' | 'form';

export type ClientPayload = {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
};

type NewClientSelectorProps = {
  onClientPayloadChange: (payload: ClientPayload | null) => void;
};

const inputCls =
  'px-3 py-2 text-sm bg-background border border-borderLight rounded text-textMain ' +
  'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary';

// --- validation helpers ---

function validateName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length < 2) return 'Le nom doit contenir au moins 2 caractères';
  if (trimmed.length > 50) return 'Le nom ne doit pas dépasser 50 caractères';
  if (/^\d+$/.test(trimmed)) return 'Le nom ne peut pas contenir uniquement des chiffres';
  const letterCount = (trimmed.match(/[a-zA-ZÀ-ÿ\u00C0-\u017F]/g) || []).length;
  if (letterCount < 2) return 'Le nom doit contenir au moins 2 lettres';
  if (/\s{2,}/.test(trimmed)) return 'Le nom ne peut pas contenir d\'espaces consécutifs';
  if (!/^[a-zA-ZÀ-ÿ\u00C0-\u017F]([a-zA-ZÀ-ÿ\u00C0-\u017F' -]*[a-zA-ZÀ-ÿ\u00C0-\u017F])?$/.test(trimmed)) {
    return 'Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes';
  }
  return null;
}

function validatePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digitPattern = /^[\d\s\-\(\)\+]+$/;
  if (!digitPattern.test(trimmed)) return 'Le téléphone ne peut contenir que des chiffres, espaces, tirets, parenthèses et +';
  const digitsOnly = trimmed.replace(/[\s\-\(\)\+]/g, '');
  if (!/^\d+$/.test(digitsOnly)) return 'Le numéro doit contenir uniquement des chiffres après suppression du formatage';
  if (digitsOnly.length < 8) return 'Le numéro doit contenir au moins 8 chiffres';
  if (digitsOnly.length > 15) return 'Le numéro ne doit pas dépasser 15 chiffres';
  return null;
}

function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 320) return 'L\'email est trop long (maximum 320 caractères)';
  const emailRegex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(trimmed)) return 'Veuillez entrer un email valide (exemple@domaine.com)';
  if (trimmed.includes('..')) return 'L\'email ne peut pas contenir de points consécutifs';
  const parts = trimmed.split('@');
  if (parts.length !== 2) return 'L\'email doit contenir exactement un @';
  const [localPart, domainPart] = parts;
  if (localPart.length > 64) return 'La partie locale de l\'email est trop longue (maximum 64 caractères)';
  if (domainPart.length > 255) return 'Le domaine de l\'email est trop long (maximum 255 caractères)';
  return null;
}

export default function NewClientSelector({ onClientPayloadChange }: NewClientSelectorProps) {
  const [view, setView] = useState<ViewState>('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<ClientRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string | null; phone?: string | null; email?: string | null }>({});
  const [touched, setTouched] = useState<{ name: boolean; phone: boolean; email: boolean }>({
    name: false,
    phone: false,
    email: false,
  });
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Notify parent whenever selectedClient or form state changes
  useEffect(() => {
    if (selectedClient) {
      onClientPayloadChange({ id: selectedClient.id });
    } else if (view === 'form' && (formName.trim() || formPhone.trim() || formEmail.trim())) {
      const valid =
        (!formName.trim() || !validateName(formName)) &&
        (!formPhone.trim() || !validatePhone(formPhone)) &&
        (!formEmail.trim() || !validateEmail(formEmail));
      if (valid) {
        onClientPayloadChange({
          name: formName.trim() || undefined,
          phone: formPhone.trim() || undefined,
          email: formEmail.trim() || undefined,
        });
        return;
      }
    }
    onClientPayloadChange(null);
  }, [selectedClient, view, formName, formPhone, formEmail, onClientPayloadChange]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const { data } = await apiClient.get<{ success: boolean; clients: ClientRow[] }>('/api/transactions/clients/search', {
        params: { q: trimmed },
      });
      setResults(data.clients ?? []);
    } catch (err) {
      setSearchError(extractApiError(err, 'Erreur lors de la recherche.'));
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  function handleSearchChange(value: string) {
    setSearchQuery(value);
    setSelectedClient(null);
    setView('idle');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void doSearch(value);
    }, 300);
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    void doSearch(searchQuery);
  }

  function selectClient(client: ClientRow) {
    setSelectedClient(client);
    setView('idle');
    setSearchQuery('');
    setResults([]);
    setSearchError(null);
    setFormMode('edit');
    setFormName(client.name);
    setFormPhone(client.phone ?? '');
    setFormEmail(client.email ?? '');
    setFormErrors({});
    setTouched({ name: false, phone: false, email: false });
  }

  function removeSelectedClient() {
    setSelectedClient(null);
    setView('idle');
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormErrors({});
    setTouched({ name: false, phone: false, email: false });
  }

  function openForm() {
    setView('form');
    setSearchQuery('');
    setResults([]);
    setSearchError(null);
    setTouched({ name: false, phone: false, email: false });
    setFormErrors({});
    if (!selectedClient) {
      setFormMode('create');
      setFormName('');
      setFormPhone('');
      setFormEmail('');
    }
  }

  const hasSearchResults = results.length > 0;
  const showNoResults = searchQuery.trim().length >= 2 && !isSearching && !hasSearchResults && view === 'idle';

  return (
    <div className="rounded border border-borderLight bg-background p-3 space-y-3">
      <p className="text-sm font-medium text-textMain">Client</p>

      {/* Search field + loupe button — always visible */}
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          type="search"
          placeholder="Rechercher un client…"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className={`${inputCls} flex-1 min-w-0`}
          aria-label="Rechercher un client par nom, téléphone ou email"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="shrink-0 px-3 py-2 border border-borderLight rounded text-textMuted hover:text-textMain hover:border-primary transition-colors disabled:opacity-50"
          aria-label="Lancer la recherche"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
        </button>
      </form>

      {/* "Ajouter un acheteur" button — always visible */}
      <button
        type="button"
        onClick={openForm}
        className="w-full px-3 py-2 text-sm border border-borderLight rounded text-textMain hover:border-primary hover:bg-primary/10 transition-colors"
      >
        + Ajouter un nouveau client
      </button>

      {/* Dynamic zone: search results OR no results OR form OR selected client */}
      <div className="min-h-[60px]">
        {/* Loading */}
        {isSearching && (
          <div className="flex items-center justify-center py-4">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Search results */}
        {!isSearching && hasSearchResults && view === 'idle' && (
          <div className="space-y-2">
            <p className="text-xs text-textMuted">Client{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}</p>
            {results.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => selectClient(client)}
                className="w-full text-left border border-borderLight rounded p-3 hover:border-primary hover:bg-primary/10 transition-colors space-y-1"
              >
                <p className="text-sm font-medium text-textMain">{client.name}</p>
                {client.phone && <p className="text-xs text-textMuted">{client.phone}</p>}
                {client.email && <p className="text-xs text-textMuted">{client.email}</p>}
              </button>
            ))}
          </div>
        )}

        {/* No results */}
        {!isSearching && showNoResults && (
          <p className="text-xs text-textMuted py-2 text-center">Aucun client trouvé.</p>
        )}

        {/* Search error */}
        {searchError && (
          <p className="text-xs text-red-600 py-1">{searchError}</p>
        )}

        {/* Selected client card */}
        {selectedClient && view !== 'form' && (
          <div className="border border-borderLight rounded p-3 space-y-1 relative">
            <button
              type="button"
              onClick={removeSelectedClient}
              className="absolute top-2 right-2 text-textMuted hover:text-red-600 transition-colors text-sm"
              aria-label="Retirer le client sélectionné"
            >
              ×
            </button>
            <p className="text-sm font-medium text-textMain">{selectedClient.name}</p>
            {selectedClient.phone && <p className="text-xs text-textMuted">{selectedClient.phone}</p>}
            {selectedClient.email && <p className="text-xs text-textMuted">{selectedClient.email}</p>}
          </div>
        )}

        {/* Create/edit form */}
        {view === 'form' && (
          <div className="border border-borderLight rounded p-3 space-y-2">
            <p className="text-xs font-medium text-textMuted">
              {formMode === 'create' ? 'Nouvel acheteur' : 'Modifier l\'acheteur'}
            </p>
            <div>
              <input
                type="text"
                value={formName}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormName(v);
                  if (touched.name) setFormErrors((c) => ({ ...c, name: validateName(v) }));
                  else if (formErrors.name) setFormErrors((c) => ({ ...c, name: undefined }));
                }}
                onBlur={() => {
                  setTouched((c) => ({ ...c, name: true }));
                  setFormErrors((c) => ({ ...c, name: validateName(formName) }));
                }}
                placeholder="Nom"
                className={`${inputCls} w-full ${formErrors.name ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                aria-invalid={Boolean(formErrors.name)}
              />
              {formErrors.name && <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormPhone(v);
                    if (touched.phone) setFormErrors((c) => ({ ...c, phone: validatePhone(v) }));
                    else if (formErrors.phone) setFormErrors((c) => ({ ...c, phone: undefined }));
                  }}
                  onBlur={() => {
                    setTouched((c) => ({ ...c, phone: true }));
                    setFormErrors((c) => ({ ...c, phone: validatePhone(formPhone) }));
                  }}
                  placeholder="+229 01 XX XX XX XX"
                  className={`${inputCls} w-full ${formErrors.phone ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={Boolean(formErrors.phone)}
                />
                {formErrors.phone && <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>}
              </div>
              <div>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormEmail(v);
                    if (touched.email) setFormErrors((c) => ({ ...c, email: validateEmail(v) }));
                    else if (formErrors.email) setFormErrors((c) => ({ ...c, email: undefined }));
                  }}
                  onBlur={() => {
                    setTouched((c) => ({ ...c, email: true }));
                    setFormErrors((c) => ({ ...c, email: validateEmail(formEmail) }));
                  }}
                  placeholder="client@exemple.com"
                  className={`${inputCls} w-full ${formErrors.email ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : ''}`}
                  aria-invalid={Boolean(formErrors.email)}
                />
                {formErrors.email && <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>}
              </div>
            </div>
            {formMode === 'edit' && (
              <button
                type="button"
                onClick={removeSelectedClient}
                className="text-xs text-textMuted hover:text-red-600 transition-colors"
              >
                Retirer ce client
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
