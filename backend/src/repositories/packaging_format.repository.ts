// src/repositories/packaging_format.repository.ts
//
// Couche d'accès aux données pour les formats de conditionnement.

import { prisma } from '../config/database';

// ---------------------------------------------------------------------------
// Types exposés
// ---------------------------------------------------------------------------

export interface PackagingFormatRow {
  id:                string;
  product_id:        string;
  label:             string;
  units_per_package: number;
  price:             string | null; // Decimal serialisé — null = calculer depuis product.price × coefficient
  is_base_unit:      boolean;
  created_at:        Date;
  updated_at:        Date;
}

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

function productOrgScoped(orgId: string) {
  return { product: { organization_id: orgId } };
}

export async function findAllByProduct(orgId: string, productId: string): Promise<PackagingFormatRow[]> {
  return prisma.packagingFormat.findMany({
    where: {
      product_id: productId,
      ...productOrgScoped(orgId),
    },
    orderBy: { units_per_package: 'asc' },
  }) as unknown as PackagingFormatRow[];
}

export async function findById(orgId: string, id: string): Promise<PackagingFormatRow | null> {
  return prisma.packagingFormat.findUnique({
    where: { id, ...productOrgScoped(orgId) },
  }) as unknown as PackagingFormatRow | null;
}

export async function findBaseUnit(orgId: string, productId: string): Promise<PackagingFormatRow | null> {
  return prisma.packagingFormat.findFirst({
    where: {
      product_id: productId,
      is_base_unit: true,
      ...productOrgScoped(orgId),
    },
  }) as unknown as PackagingFormatRow | null;
}

export async function countByProduct(orgId: string, productId: string): Promise<number> {
  return prisma.packagingFormat.count({
    where: {
      product_id: productId,
      ...productOrgScoped(orgId),
    },
  });
}

export async function create(orgId: string, data: {
  product_id: string;
  label: string;
  units_per_package: number;
  price?: number | null;
  is_base_unit: boolean;
}): Promise<PackagingFormatRow> {
  return prisma.packagingFormat.create({ data }) as unknown as PackagingFormatRow;
}

export async function update(
  orgId: string,
  id: string,
  data: {
    label?: string;
    units_per_package?: number;
    price?: number | null;
    is_base_unit?: boolean;
  },
): Promise<PackagingFormatRow> {
  return prisma.packagingFormat.update({
    where: { id, ...productOrgScoped(orgId) },
    data,
  }) as unknown as PackagingFormatRow;
}

export async function remove(orgId: string, id: string): Promise<void> {
  await prisma.packagingFormat.delete({ where: { id, ...productOrgScoped(orgId) } });
}
