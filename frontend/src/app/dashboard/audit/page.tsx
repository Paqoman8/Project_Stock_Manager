'use client';

// src/app/dashboard/audit/page.tsx
//
// Journal d'audit — liste paginée et filtrable de toutes les actions de la plateforme.
//
// Accès :
//   SA    → tous les logs sans restriction
//   Admin → uniquement les logs de ses magasins associés
//
// Chaque ligne dispose d'un bouton "Voir" qui ouvre une modale de détail
// affichant l'intégralité des informations de l'événement.
//
// Filtre "Type d'action" : dropdown multi-sélection avec cases à cocher,
// groupé par catégorie. Quand aucune action n'est cochée = pas de filtre.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/contexts/SessionContext';
import apiClient from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'STORE_CREATED'
  | 'STORE_UPDATED'
  | 'STORE_CLOSED'
  | 'STORE_REOPENED'
  | 'STORE_DELETED'
  | 'SUPPLIER_CREATED'
  | 'SUPPLIER_UPDATED'
  | 'SUPPLIER_DEACTIVATED'
  | 'SUPPLIER_REACTIVATED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_DELETED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DEACTIVATED'
  | 'PRODUCT_REACTIVATED'
  | 'SUPPLIER_PRODUCT_CREATED'
  | 'SUPPLIER_PRODUCT_UPDATED'
  | 'SUPPLIER_PRODUCT_DELETED'
  | 'PURCHASE_ORDER_CREATED'
  | 'PURCHASE_ORDER_UPDATED'
  | 'PURCHASE_ORDER_SENT'
  | 'PURCHASE_ORDER_CANCELLED'
  | 'RECEPTION_CREATED'
  | 'RECEPTION_CONFIRMED'
  | 'RECEPTION_CANCELLED'
  | 'INVOICE_CREATED'
  | 'INVOICE_UPDATED'
  | 'INVOICE_PAID'
  | 'INVOICE_DISPUTED'
  | 'STOCK_MOVEMENT_CREATED'
  | 'INVENTORY_REPORT_CREATED'
  | 'INVENTORY_REPORT_SUBMITTED'
  | 'INVENTORY_REPORT_VALIDATED'
  | 'INVENTORY_REPORT_REJECTED'
  | 'INVENTORY_REPORT_ADJUSTED';

interface AuditLog {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  store_id: string | null;
  store_name: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
}

interface AuditLogsResponse {
  success: boolean;
  logs: AuditLog[];
  total: number;
  page: number;
  totalPages: number;
}

interface StoreOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Libellés et couleurs des actions
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<AuditAction, string> = {
  USER_LOGIN:        'Connexion',
  USER_LOGIN_FAILED: 'Échec de connexion',
  USER_LOGOUT:       'Déconnexion',
  USER_CREATED:      'Utilisateur créé',
  USER_UPDATED:      'Utilisateur modifié',
  USER_DEACTIVATED:  'Utilisateur désactivé',
  USER_REACTIVATED:  'Utilisateur réactivé',
  STORE_CREATED:       'Établissement créé',
  STORE_UPDATED:       'Établissement modifié',
  STORE_CLOSED:        'Établissement fermé',
  STORE_REOPENED:      'Établissement réouvert',
  STORE_DELETED:       'Établissement supprimé',
  SUPPLIER_CREATED:    'Fournisseur créé',
  SUPPLIER_UPDATED:    'Fournisseur modifié',
  SUPPLIER_DEACTIVATED:'Fournisseur désactivé',
  SUPPLIER_REACTIVATED:'Fournisseur réactivé',
  CATEGORY_CREATED:    'Catégorie créée',
  CATEGORY_UPDATED:    'Catégorie modifiée',
  CATEGORY_DELETED:    'Catégorie supprimée',
  PRODUCT_CREATED:     'Produit créé',
  PRODUCT_UPDATED:     'Produit modifié',
  PRODUCT_DEACTIVATED: 'Produit désactivé',
  PRODUCT_REACTIVATED: 'Produit réactivé',
  SUPPLIER_PRODUCT_CREATED: 'Entrée catalogue créée',
  SUPPLIER_PRODUCT_UPDATED: 'Entrée catalogue modifiée',
  SUPPLIER_PRODUCT_DELETED: 'Entrée catalogue désactivée',
  PURCHASE_ORDER_CREATED:   'Commande créée',
  PURCHASE_ORDER_UPDATED:   'Commande modifiée',
  PURCHASE_ORDER_SENT:      'Commande envoyée',
  PURCHASE_ORDER_CANCELLED: 'Commande annulée',
  RECEPTION_CREATED:        'Réception créée',
  RECEPTION_CONFIRMED:      'Réception confirmée',
  RECEPTION_CANCELLED:      'Réception annulée',
  INVOICE_CREATED:          'Facture créée',
  INVOICE_UPDATED:          'Facture modifiée',
  INVOICE_PAID:             'Facture payée',
  INVOICE_DISPUTED:         'Facture contestée',
  STOCK_MOVEMENT_CREATED:       'Mouvement de stock',
  INVENTORY_REPORT_CREATED:     'Rapport créé',
  INVENTORY_REPORT_SUBMITTED:   'Rapport soumis',
  INVENTORY_REPORT_VALIDATED:   'Rapport validé',
  INVENTORY_REPORT_REJECTED:    'Rapport rejeté',
  INVENTORY_REPORT_ADJUSTED:    'Ajustements appliqués',
};

const ACTION_COLORS: Record<AuditAction, string> = {
  USER_LOGIN:        'bg-success/10 text-success border border-success/20',
  USER_LOGIN_FAILED: 'bg-danger/10 text-danger border border-danger/20',
  USER_LOGOUT:       'bg-[#E9ECEF] text-textMuted border border-borderLight',
  USER_CREATED:      'bg-primary/10 text-primary border border-primary/20',
  USER_UPDATED:      'bg-warning/20 text-warning border border-warning/30',
  USER_DEACTIVATED:  'bg-danger/10 text-danger border border-danger/20',
  USER_REACTIVATED:  'bg-success/10 text-success border border-success/20',
  STORE_CREATED:        'bg-primary/10 text-primary border border-primary/20',
  STORE_UPDATED:        'bg-warning/20 text-warning border border-warning/30',
  STORE_CLOSED:         'bg-danger/10 text-danger border border-danger/20',
  STORE_REOPENED:       'bg-success/10 text-success border border-success/20',
  STORE_DELETED:        'bg-danger/10 text-danger border border-danger/20',
  SUPPLIER_CREATED:     'bg-primary/10 text-primary border border-primary/20',
  SUPPLIER_UPDATED:     'bg-warning/20 text-warning border border-warning/30',
  SUPPLIER_DEACTIVATED: 'bg-danger/10 text-danger border border-danger/20',
  SUPPLIER_REACTIVATED: 'bg-success/10 text-success border border-success/20',
  CATEGORY_CREATED:     'bg-primary/10 text-primary border border-primary/20',
  CATEGORY_UPDATED:     'bg-warning/20 text-warning border border-warning/30',
  CATEGORY_DELETED:     'bg-danger/10 text-danger border border-danger/20',
  PRODUCT_CREATED:      'bg-primary/10 text-primary border border-primary/20',
  PRODUCT_UPDATED:      'bg-warning/20 text-warning border border-warning/30',
  PRODUCT_DEACTIVATED:  'bg-danger/10 text-danger border border-danger/20',
  PRODUCT_REACTIVATED:  'bg-success/10 text-success border border-success/20',
  SUPPLIER_PRODUCT_CREATED: 'bg-primary/10 text-primary border border-primary/20',
  SUPPLIER_PRODUCT_UPDATED: 'bg-warning/20 text-warning border border-warning/30',
  SUPPLIER_PRODUCT_DELETED: 'bg-danger/10 text-danger border border-danger/20',
  PURCHASE_ORDER_CREATED:   'bg-primary/10 text-primary border border-primary/20',
  PURCHASE_ORDER_UPDATED:   'bg-warning/20 text-warning border border-warning/30',
  PURCHASE_ORDER_SENT:      'bg-blue-50 text-blue-700 border border-blue-200',
  PURCHASE_ORDER_CANCELLED: 'bg-danger/10 text-danger border border-danger/20',
  RECEPTION_CREATED:        'bg-primary/10 text-primary border border-primary/20',
  RECEPTION_CONFIRMED:      'bg-success/10 text-success border border-success/20',
  RECEPTION_CANCELLED:      'bg-danger/10 text-danger border border-danger/20',
  INVOICE_CREATED:          'bg-primary/10 text-primary border border-primary/20',
  INVOICE_UPDATED:          'bg-warning/20 text-warning border border-warning/30',
  INVOICE_PAID:             'bg-success/10 text-success border border-success/20',
  INVOICE_DISPUTED:         'bg-orange-50 text-orange-700 border border-orange-200',
  STOCK_MOVEMENT_CREATED:       'bg-blue-50 text-blue-700 border border-blue-200',
  INVENTORY_REPORT_CREATED:     'bg-primary/10 text-primary border border-primary/20',
  INVENTORY_REPORT_SUBMITTED:   'bg-blue-50 text-blue-700 border border-blue-200',
  INVENTORY_REPORT_VALIDATED:   'bg-success/10 text-success border border-success/20',
  INVENTORY_REPORT_REJECTED:    'bg-danger/10 text-danger border border-danger/20',
  INVENTORY_REPORT_ADJUSTED:    'bg-orange-50 text-orange-700 border border-orange-200',
};

// ---------------------------------------------------------------------------
// Groupes pour le dropdown multi-sélection
// ---------------------------------------------------------------------------

interface ActionGroup {
  label: string;
  actions: AuditAction[];
}

const ACTION_GROUPS: ActionGroup[] = [
  {
    label: 'Authentification',
    actions: ['USER_LOGIN', 'USER_LOGIN_FAILED', 'USER_LOGOUT'],
  },
  {
    label: 'Utilisateurs',
    actions: ['USER_CREATED', 'USER_UPDATED', 'USER_DEACTIVATED', 'USER_REACTIVATED'],
  },
  {
    label: 'Établissements',
    actions: ['STORE_CREATED', 'STORE_UPDATED', 'STORE_CLOSED', 'STORE_REOPENED', 'STORE_DELETED'],
  },
  {
    label: 'Fournisseurs',
    actions: ['SUPPLIER_CREATED', 'SUPPLIER_UPDATED', 'SUPPLIER_DEACTIVATED', 'SUPPLIER_REACTIVATED'],
  },
  {
    label: 'Catalogue — Catégories',
    actions: ['CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_DELETED'],
  },
  {
    label: 'Catalogue — Produits',
    actions: ['PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DEACTIVATED', 'PRODUCT_REACTIVATED'],
  },
  {
    label: 'Catalogue fournisseur',
    actions: ['SUPPLIER_PRODUCT_CREATED', 'SUPPLIER_PRODUCT_UPDATED', 'SUPPLIER_PRODUCT_DELETED'],
  },
  {
    label: 'Commandes fournisseurs',
    actions: ['PURCHASE_ORDER_CREATED', 'PURCHASE_ORDER_UPDATED', 'PURCHASE_ORDER_SENT', 'PURCHASE_ORDER_CANCELLED'],
  },
  {
    label: 'Réceptions',
    actions: ['RECEPTION_CREATED', 'RECEPTION_CONFIRMED', 'RECEPTION_CANCELLED'],
  },
  {
    label: 'Factures fournisseurs',
    actions: ['INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_PAID', 'INVOICE_DISPUTED'],
  },
  {
    label: 'Mouvements de stock',
    actions: ['STOCK_MOVEMENT_CREATED'],
  },
  {
    label: 'Rapports d\'inventaire',
    actions: [
      'INVENTORY_REPORT_CREATED',
      'INVENTORY_REPORT_SUBMITTED',
      'INVENTORY_REPORT_VALIDATED',
      'INVENTORY_REPORT_REJECTED',
      'INVENTORY_REPORT_ADJUSTED',
    ],
  },
];

const ROLES_AUTORISES = ['Super Administrateur', 'Administrateur'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Retourne la date du début de la journée en cours au format datetime-local
 * (YYYY-MM-DDTHH:MM), utilisé comme valeur par défaut du filtre "Du".
 *
 * Choix : "journée en cours" plutôt que "24 dernières heures" car Stock Manager est
 * un ERP retail dont les shifts et les bilans sont calés sur des jours calendaires.
 * Les managers raisonnent en "qu'est-ce qui s'est passé aujourd'hui", pas
 * en fenêtre glissante.
 */
// ---------------------------------------------------------------------------
// Gestion des périodes prédéfinies
// ---------------------------------------------------------------------------

type DatePeriod =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'this_year' | 'last_year'
  | 'custom';

const PERIOD_LABELS: Record<DatePeriod, string> = {
  today:      "Aujourd'hui",
  yesterday:  'Hier',
  this_week:  'Semaine en cours',
  last_week:  'Semaine dernière',
  this_month: 'Mois en cours',
  last_month: 'Mois dernier',
  this_year:  'Année en cours',
  last_year:  'Année dernière',
  custom:     'Personnalisé',
};

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getPeriodDates(period: Exclude<DatePeriod, 'custom'>): { start: string; end: string } {
  const now = new Date();

  const startOfDay = (d: Date) => { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; };
  const endOfDay   = (d: Date) => { const r = new Date(d); r.setHours(23, 59, 0, 0); return r; };

  switch (period) {
    case 'today':
      return { start: toDatetimeLocal(startOfDay(now)), end: toDatetimeLocal(endOfDay(now)) };

    case 'yesterday': {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { start: toDatetimeLocal(startOfDay(d)), end: toDatetimeLocal(endOfDay(d)) };
    }

    case 'this_week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { start: toDatetimeLocal(startOfDay(monday)), end: toDatetimeLocal(endOfDay(now)) };
    }

    case 'last_week': {
      const day = now.getDay();
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate() + 6);
      return { start: toDatetimeLocal(startOfDay(lastMonday)), end: toDatetimeLocal(endOfDay(lastSunday)) };
    }

    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: toDatetimeLocal(startOfDay(start)), end: toDatetimeLocal(endOfDay(now)) };
    }

    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toDatetimeLocal(startOfDay(start)), end: toDatetimeLocal(endOfDay(end)) };
    }

    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: toDatetimeLocal(startOfDay(start)), end: toDatetimeLocal(endOfDay(now)) };
    }

    case 'last_year': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end   = new Date(now.getFullYear() - 1, 11, 31);
      return { start: toDatetimeLocal(startOfDay(start)), end: toDatetimeLocal(endOfDay(end)) };
    }
  }
}


function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Dropdown multi-sélection des actions — sous-composant inline
// ---------------------------------------------------------------------------

function ActionMultiSelect({
  selectedActions,
  onChange,
}: {
  selectedActions: string[];
  onChange: (actions: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Fermeture par Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  function toggleAction(action: string) {
    if (selectedActions.includes(action)) {
      onChange(selectedActions.filter((a) => a !== action));
    } else {
      onChange([...selectedActions, action]);
    }
  }

  // Libellé du bouton trigger
  const triggerLabel =
    selectedActions.length === 0
      ? 'Toutes les actions'
      : `${selectedActions.length} sélectionnée${selectedActions.length > 1 ? 's' : ''}`;

  return (
    <div ref={wrapperRef} className="relative flex flex-col gap-1">
      <label className="text-xs font-medium text-textSecondary" id="action-filter-label">
        Type d&apos;action
      </label>

      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby="action-filter-label"
        onClick={() => setIsOpen((v) => !v)}
        className={[
          'px-3 py-2 text-sm bg-background border rounded text-left',
          'focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary',
          'flex items-center justify-between gap-2 min-w-[200px]',
          isOpen ? 'border-primary' : 'border-borderLight',
          selectedActions.length > 0 ? 'text-textMain' : 'text-textMuted',
        ].join(' ')}
      >
        <span>{triggerLabel}</span>
        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={['transition-transform', isOpen ? 'rotate-180' : ''].join(' ')}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Panel dropdown */}
      {isOpen && (
        <div
          role="listbox"
          aria-multiselectable="true"
          aria-label="Filtrer par type d'action"
          className={[
            'absolute top-full left-0 z-20 mt-1 w-64',
            'bg-surface border border-borderLight rounded shadow-lg',
            'overflow-y-auto max-h-80',
          ].join(' ')}
        >
          {ACTION_GROUPS.map((group, gi) => (
            <div key={group.label}>
              {/* Séparateur entre groupes */}
              {gi > 0 && <div className="border-t border-borderLight" />}

              {/* En-tête de groupe */}
              <div className="px-3 py-2 text-xs font-semibold text-textMuted uppercase tracking-wide bg-background">
                {group.label}
              </div>

              {/* Actions du groupe */}
              {group.actions.map((action) => {
                const isChecked = selectedActions.includes(action);
                return (
                  // onClick sur le label + e.preventDefault() évite le double-fire :
                  // sans ça, cliquer sur la checkbox déclenche onChange (1) puis le
                  // label re-dispatche le clic sur la checkbox → onChange (2) → toggle
                  // deux fois = état net inchangé.
                  <label
                    key={action}
                    role="option"
                    aria-selected={isChecked}
                    className={[
                      'flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer',
                      'hover:bg-background/80 transition-colors',
                      isChecked ? 'text-textMain' : 'text-textMuted',
                    ].join(' ')}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleAction(action);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      readOnly
                      className="accent-primary w-3.5 h-3.5 flex-shrink-0 cursor-pointer"
                    />
                    {ACTION_LABELS[action]}
                  </label>
                );
              })}
            </div>
          ))}

          {/* Pied : bouton "Tout effacer" si des actions sont sélectionnées */}
          {selectedActions.length > 0 && (
            <div className="border-t border-borderLight px-3 py-2">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded px-1"
              >
                Tout effacer
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modale de détail d'un événement
// ---------------------------------------------------------------------------

function AuditDetailModal({
  log,
  onClose,
}: {
  log: AuditLog;
  onClose: () => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTimeout(() => closeBtnRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const modifications = log.metadata &&
    typeof log.metadata === 'object' &&
    'modifications' in log.metadata
      ? (log.metadata.modifications as Record<string, unknown>)
      : null;

  // Métadonnées hors "modifications" (raison, magasins, rôle, etc.)
  const autresMetadata = log.metadata
    ? Object.entries(log.metadata).filter(([k]) => k !== 'modifications')
    : [];

  const labelsMeta: Record<string, string> = {
    // Auth
    reason:                    'Raison',
    attempted_username:        'Identifiant tenté',
    store_id:                  'Magasin tenté (ID)',
    // Utilisateurs
    role:                      'Rôle attribué',
    magasins:                  'Magasins associés',
    // Commandes fournisseurs
    updated_fields:            'Champs modifiés',
    new_destination_store_id:  'Nouvel établissement (ID)',
    items_count:               'Nombre de lignes',
    // Réceptions
    order_reference:           'Référence commande',
    received_items:            'Articles reçus',
    // Mouvements de stock & rapports d'inventaire
    type:                      'Type',
    qty:                       'Quantité',
    period_start:              'Début de période',
    period_end:                'Fin de période',
    adjustments_count:         'Ajustements appliqués',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-detail-title"
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
          <h2 id="audit-detail-title" className="text-base font-medium text-textMain">
            Détails de l&apos;événement
          </h2>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Fermer"
            className="text-textMuted hover:text-textMain transition-colors text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* Corps */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Action */}
          <Row label="Action">
            <span className={[
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
              ACTION_COLORS[log.action] ?? 'bg-[#E9ECEF] text-textMuted border border-borderLight',
            ].join(' ')}>
              {ACTION_LABELS[log.action] ?? log.action}
            </span>
          </Row>

          {/* Date */}
          <Row label="Date / Heure">
            <span className="font-mono text-sm">{formatDate(log.created_at)}</span>
          </Row>

          {/* Acteur */}
          <Row label="Effectué par">
            <span className="font-medium text-textMain">{log.actor_name}</span>
            {log.actor_id && (
              <span className="text-xs text-textMuted ml-2 font-mono">{log.actor_id}</span>
            )}
          </Row>

          {/* Adresse IP */}
          {log.ip_address && (
            <Row label="Adresse IP">
              <span className="font-mono text-sm">{log.ip_address}</span>
            </Row>
          )}

          {/* Cible */}
          {log.target_name && (
            <Row label="Cible">
              {log.target_type && (
                <span className="text-xs text-textMuted mr-1.5">{log.target_type}</span>
              )}
              <span className="font-medium text-textMain">{log.target_name}</span>
              {log.target_id && (
                <span className="text-xs text-textMuted ml-2 font-mono">{log.target_id}</span>
              )}
            </Row>
          )}

          {/* Magasin */}
          {log.store_name && (
            <Row label="Magasin">
              <span>{log.store_name}</span>
            </Row>
          )}

          {/* Modifications (USER_UPDATED diff) */}
          {modifications && Object.keys(modifications).length > 0 && (
            <section>
              <p className="text-xs font-medium text-textSecondary mb-2">Modifications</p>
              <div className="rounded border border-borderLight overflow-hidden">
                {Object.entries(modifications).map(([champ, valeur]) => {
                  const labels: Record<string, string> = {
                    identifiant:  'Identifiant',
                    email:        'Email',
                    mot_de_passe: 'Mot de passe',
                    role:         'Rôle',
                    magasins:     'Magasins',
                  };
                  const v = valeur as Record<string, unknown>;
                  return (
                    <div
                      key={champ}
                      className="flex items-start gap-3 px-3 py-2 text-sm border-b border-borderLight last:border-0 bg-background"
                    >
                      <span className="w-28 flex-shrink-0 font-medium text-textSecondary text-xs pt-0.5">
                        {labels[champ] ?? champ}
                      </span>
                      {v.modifie ? (
                        <span className="text-textMuted italic text-xs">Modifié</span>
                      ) : (
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs text-danger line-through">
                            {Array.isArray(v.avant) ? (v.avant as string[]).join(', ') : String(v.avant ?? '—')}
                          </span>
                          <span className="text-xs text-success">
                            {Array.isArray(v.apres) ? (v.apres as string[]).join(', ') : String(v.apres ?? '—')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Autres métadonnées (raison, magasins créés, etc.) */}
          {autresMetadata.length > 0 && (
            <section>
              <p className="text-xs font-medium text-textSecondary mb-2">Informations complémentaires</p>
              <div className="flex flex-col gap-1">
                {autresMetadata.map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-sm">
                    <span className="text-xs font-medium text-textSecondary w-28 flex-shrink-0 pt-0.5">
                      {labelsMeta[key] ?? key}
                    </span>
                    <span className="text-sm text-textMain">
                      {Array.isArray(value)
                        ? (value as string[]).join(', ')
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Pied */}
        <div className="px-6 py-4 border-t border-borderLight flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Ligne d'information dans la modale */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs font-medium text-textSecondary w-28 flex-shrink-0 pt-0.5">
        {label}
      </span>
      <div className="flex items-center flex-wrap gap-1 min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function AuditPage() {
  const { user: sessionUser, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  // Redirection côté client si l'utilisateur n'a pas les droits.
  // On utilise useEffect plutôt que forbidden() (qui est réservé aux Server
  // Components et Route Handlers — il échoue silencieusement dans un
  // Client Component car process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS
  // n'est pas exposé dans le bundle browser).
  useEffect(() => {
    if (!sessionLoading && sessionUser !== null && !ROLES_AUTORISES.includes(sessionUser.roleName)) {
      router.replace('/dashboard');
    }
  }, [sessionLoading, sessionUser, router]);

  // filterActions remplace l'ancien filterAction (string → string[])
  // Quand le tableau est vide, aucun filtre action n'est appliqué (= toutes les actions)
  const [filterActions, setFilterActions]     = useState<string[]>([]);
  const [filterStoreId, setFilterStoreId]     = useState('');
  const [filterPeriod, setFilterPeriod]       = useState<DatePeriod>('today');
  const [filterStartDate, setFilterStartDate] = useState(() => getPeriodDates('today').start);
  const [filterEndDate, setFilterEndDate]     = useState(() => getPeriodDates('today').end);

  // Ref pour exposer les valeurs courantes des filtres à loadLogs sans en faire des dépendances.
  const filtersRef = useRef({
    filterActions:   [] as string[],
    filterStoreId:   '',
    filterStartDate: getPeriodDates('today').start,
    filterEndDate:   getPeriodDates('today').end,
  });
  // Synchronisation à chaque render (avant tout useEffect)
  filtersRef.current = { filterActions, filterStoreId, filterStartDate, filterEndDate };

  const [stores, setStores]       = useState<StoreOption[]>([]);
  const [logs, setLogs]           = useState<AuditLog[]>([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage]           = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Log sélectionné pour la modale de détail
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const LIMIT = 20;

  // Chargement de la liste des magasins accessibles pour le filtre
  useEffect(() => {
    if (!sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) return;

    apiClient
      .get<{ success: boolean; stores: StoreOption[] }>('/api/auth/accessible-stores?activeOnly=false')
      .then((res) => setStores(res.data.stores))
      .catch(() => { /* non-critique : le filtre magasin reste vide */ });
  }, [sessionUser]);

  const loadLogs = useCallback(async (p: number) => {
    // Lit les filtres depuis la ref (toujours à jour) plutôt que depuis la closure.
    // La ref est synchronisée à chaque render avant que cet effet ne s'exécute.
    const { filterActions, filterStoreId, filterStartDate, filterEndDate } = filtersRef.current;

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', String(LIMIT));

      // Actions : transmises comme paramètres multiples ?action=X&action=Y
      // Quand filterActions est vide, aucun paramètre action n'est ajouté → pas de filtre
      filterActions.forEach((action) => params.append('action', action));

      if (filterStoreId)   params.set('storeId',   filterStoreId);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate)   params.set('endDate',   filterEndDate);

      const res = await apiClient.get<AuditLogsResponse>(`/api/audit?${params.toString()}`);
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
      setPage(res.data.page);
    } catch {
      setError('Impossible de charger le journal d\'audit.');
    } finally {
      setIsLoading(false);
    }
  // Référence stable (deps vide) : les filtres sont lus depuis filtersRef.current.
  // Cela empêche le rechargement automatique à chaque changement de filtre —
  // le rechargement n'a lieu qu'à l'action explicite de l'utilisateur (Filtrer / Reset).
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Ne charge les logs que lorsque la session est prête et l'accès confirmé.
  // Sans cette garde, des requêtes inutiles (et rejetées par le backend)
  // partiraient pendant le chargement ou pour les rôles non autorisés.
  useEffect(() => {
    if (
      !sessionLoading &&
      sessionUser !== null &&
      ROLES_AUTORISES.includes(sessionUser.roleName)
    ) {
      loadLogs(1);
    }
  }, [sessionLoading, sessionUser, loadLogs]);

  function handlePeriodChange(period: DatePeriod) {
    setFilterPeriod(period);
    if (period !== 'custom') {
      const { start, end } = getPeriodDates(period);
      setFilterStartDate(start);
      setFilterEndDate(end);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    loadLogs(1);
  }

  function handleReset() {
    const { start, end } = getPeriodDates('today');
    const defaults = {
      filterActions:   [] as string[],
      filterStoreId:   '',
      filterStartDate: start,
      filterEndDate:   end,
    };
    setFilterActions(defaults.filterActions);
    setFilterStoreId(defaults.filterStoreId);
    setFilterPeriod('today');
    setFilterStartDate(defaults.filterStartDate);
    setFilterEndDate(defaults.filterEndDate);
    filtersRef.current = defaults;
    loadLogs(1);
  }

  // Garde de rendu : on n'affiche rien pendant le chargement de la session
  // ou si l'utilisateur n'est pas autorisé (le useEffect gère la redirection).
  if (sessionLoading || !sessionUser || !ROLES_AUTORISES.includes(sessionUser.roleName)) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Modale de détail */}
      {selectedLog && (
        <AuditDetailModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}

      {/* En-tête */}
      <div>
        <h1 className="text-xl font-semibold text-textMain">Journal d&apos;audit</h1>
        <p className="text-sm text-textMuted mt-1">
          Historique complet des actions effectuées sur la plateforme.
          {sessionUser?.roleName === 'Administrateur' && (
            <span> Vous voyez uniquement les actions relatives à vos magasins.</span>
          )}
        </p>
      </div>

      {/* Filtres */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap items-end gap-3 p-4 bg-surface border border-borderLight rounded"
      >
        {/* Type d'action — dropdown multi-sélection */}
        <ActionMultiSelect
          selectedActions={filterActions}
          onChange={setFilterActions}
        />

        {/* Filtre magasin — masqué si l'utilisateur n'a accès qu'à un seul magasin */}
        {stores.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-textSecondary">Magasin</label>
            <select
              value={filterStoreId}
              onChange={(e) => setFilterStoreId(e.target.value)}
              className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
            >
              <option value="">Tous les magasins</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Raccourci de période */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-textSecondary">Période</label>
          <select
            value={filterPeriod}
            onChange={(e) => handlePeriodChange(e.target.value as DatePeriod)}
            className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          >
            {(Object.keys(PERIOD_LABELS) as DatePeriod[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {/* Plage personnalisée — visible uniquement en mode "Personnalisé" */}
        {filterPeriod === 'custom' && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Du</label>
              <input
                type="datetime-local"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-textSecondary">Au</label>
              <input
                type="datetime-local"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="px-3 py-2 text-sm bg-background border border-borderLight rounded text-textPrimary focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="sm">Filtrer</Button>
          <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
            Réinitialiser
          </Button>
        </div>
      </form>

      {/* Compteur */}
      {!isLoading && !error && (
        <p className="text-xs text-textMuted">
          {total === 0
            ? 'Aucun événement trouvé.'
            : `${total} événement${total > 1 ? 's' : ''} — page ${page} / ${totalPages}`}
        </p>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {/* Tableau */}
      {isLoading ? (
        <p className="text-sm text-textMuted">Chargement…</p>
      ) : (
        <div className="overflow-x-auto border border-borderLight rounded">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borderLight bg-background">
                <th className="px-4 py-3 text-left font-medium text-textSecondary whitespace-nowrap">
                  Date / Heure
                </th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">Acteur</th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">Action</th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">Cible</th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">Magasin</th>
                <th className="px-4 py-3 text-left font-medium text-textSecondary">Détails</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-textMuted">
                    Aucun événement trouvé.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-borderLight hover:bg-background/50 transition-colors"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-textMuted font-mono text-xs">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-textMain whitespace-nowrap">
                      {log.actor_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={[
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                        ACTION_COLORS[log.action] ?? 'bg-[#E9ECEF] text-textMuted border border-borderLight',
                      ].join(' ')}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {log.target_name
                        ? <span className="font-medium text-textMain">{log.target_name}</span>
                        : <span aria-label="Sans cible">—</span>}
                    </td>
                    <td className="px-4 py-3 text-textMuted whitespace-nowrap">
                      {log.store_name ?? <span aria-label="Sans magasin">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs font-medium text-primary hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded px-1"
                      >
                        Voir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadLogs(page - 1)}
            disabled={page <= 1 || isLoading}
          >
            ← Précédent
          </Button>
          <span className="text-sm text-textMuted px-2">{page} / {totalPages}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadLogs(page + 1)}
            disabled={page >= totalPages || isLoading}
          >
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}
