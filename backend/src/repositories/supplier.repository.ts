// src/repositories/supplier.repository.ts
//
// Couche d'accès aux données pour les fournisseurs (Supplier).
//
// Responsabilités :
//   - CRUD Prisma pur — aucune logique métier ici
//   - Sélecteur partagé SUPPLIER_SELECT pour garantir une forme constante
//   - Recherche textuelle sur name, contact_name, email

import { PaymentTerms } from '@prisma/client';
import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés — contrat entre repository et service
// ---------------------------------------------------------------------------

/**
 * Un fournisseur tel que retourné par toutes les fonctions du repository.
 */
export interface SupplierRow {
  id: string;
  organization_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: PaymentTerms;
  is_international: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Données requises pour créer un fournisseur.
 */
export interface CreateSupplierData {
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_terms?: PaymentTerms;
  is_international?: boolean;
}

/**
 * Données pour la mise à jour d'un fournisseur — tous les champs optionnels.
 */
export interface UpdateSupplierData {
  name?: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  payment_terms?: PaymentTerms;
  is_international?: boolean;
}

/**
 * Filtres acceptés par findAll.
 */
export interface SupplierFilters {
  isActive?: boolean;
  search?: string;
}

// ---------------------------------------------------------------------------
// Sélecteur Prisma partagé — garantit que toutes les fonctions retournent
// exactement la même forme de données (SupplierRow).
// ---------------------------------------------------------------------------

const SUPPLIER_SELECT = {
  id:               true,
  organization_id:  true,
  name:             true,
  contact_name:     true,
  email:            true,
  phone:            true,
  address:          true,
  payment_terms:    true,
  is_international: true,
  is_active:        true,
  created_at:       true,
  updated_at:       true,
} as const;

// ---------------------------------------------------------------------------
// Fonctions du repository
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des fournisseurs avec filtres optionnels.
 *
 * Filtre isActive : si non précisé, retourne tous les fournisseurs (actifs et inactifs).
 * Filtre search   : recherche partielle insensible à la casse sur name, contact_name, email.
 * Tri             : alphabétique sur le nom.
 *
 * @param filters - { isActive?, search? }
 * @returns Tableau de SupplierRow, potentiellement vide
 */
export async function findAll(orgId: string, filters: SupplierFilters = {}): Promise<SupplierRow[]> {
  const { isActive, search } = filters;

  return prisma.supplier.findMany({
    where: {
      organization_id: orgId,
      ...(isActive !== undefined ? { is_active: isActive } : {}),
      ...(search
        ? {
            OR: [
              { name:         { contains: search, mode: 'insensitive' } },
              { contact_name: { contains: search, mode: 'insensitive' } },
              { email:        { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select:  SUPPLIER_SELECT,
    orderBy: { name: 'asc' },
  });
}

/**
 * Retourne un fournisseur par son UUID, ou null s'il n'existe pas.
 *
 * @param id - UUID du fournisseur
 */
export async function findById(orgId: string, id: string): Promise<SupplierRow | null> {
  return prisma.supplier.findUnique({
    where:  { id, organization_id: orgId },
    select: SUPPLIER_SELECT,
  });
}

/**
 * Retourne un fournisseur par son adresse email, ou null s'il n'existe pas.
 * Utilisé pour la vérification d'unicité de l'email avant création/mise à jour.
 *
 * @param email - Adresse email à rechercher
 */
export async function findByEmail(orgId: string, email: string): Promise<SupplierRow | null> {
  return prisma.supplier.findFirst({
    where:  { organization_id: orgId, email },
    select: SUPPLIER_SELECT,
  });
}

/**
 * Crée un nouveau fournisseur en base.
 *
 * @param data - Données du fournisseur à créer
 * @returns Le fournisseur créé
 */
export async function create(orgId: string, data: CreateSupplierData): Promise<SupplierRow> {
  return prisma.supplier.create({
    data: {
      organization_id:  orgId,
      name:             data.name,
      contact_name:     data.contact_name     ?? null,
      email:            data.email            ?? null,
      phone:            data.phone            ?? null,
      address:          data.address          ?? null,
      payment_terms:    data.payment_terms    ?? 'NET30',
      is_international: data.is_international ?? false,
    },
    select: SUPPLIER_SELECT,
  });
}

/**
 * Met à jour les champs fournis d'un fournisseur existant.
 * Seuls les champs présents dans data sont mis à jour (PATCH sémantique).
 *
 * @param id   - UUID du fournisseur à mettre à jour
 * @param data - Champs à modifier
 * @returns Le fournisseur mis à jour
 * @throws Prisma P2025 si le fournisseur n'existe pas
 */
export async function update(orgId: string, id: string, data: UpdateSupplierData): Promise<SupplierRow> {
  const updateData: Record<string, unknown> = {};
  if (data.name             !== undefined) updateData.name             = data.name;
  if (data.contact_name     !== undefined) updateData.contact_name     = data.contact_name;
  if (data.email            !== undefined) updateData.email            = data.email;
  if (data.phone            !== undefined) updateData.phone            = data.phone;
  if (data.address          !== undefined) updateData.address          = data.address;
  if (data.payment_terms    !== undefined) updateData.payment_terms    = data.payment_terms;
  if (data.is_international !== undefined) updateData.is_international = data.is_international;

  return prisma.supplier.update({
    where:  { id, organization_id: orgId },
    data:   updateData,
    select: SUPPLIER_SELECT,
  });
}

/**
 * Active ou désactive un fournisseur (soft delete).
 *
 * @param id       - UUID du fournisseur
 * @param isActive - true pour activer, false pour désactiver
 * @returns Le fournisseur mis à jour
 */
export async function setActive(orgId: string, id: string, isActive: boolean): Promise<SupplierRow> {
  return prisma.supplier.update({
    where:  { id, organization_id: orgId },
    data:   { is_active: isActive },
    select: SUPPLIER_SELECT,
  });
}
