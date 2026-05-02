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
  is_base_unit:      boolean;
  created_at:        Date;
  updated_at:        Date;
}

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export async function findAllByProduct(productId: string): Promise<PackagingFormatRow[]> {
  return prisma.packagingFormat.findMany({
    where:   { product_id: productId },
    orderBy: { units_per_package: 'asc' },
  }) as unknown as PackagingFormatRow[];
}

export async function findById(id: string): Promise<PackagingFormatRow | null> {
  return prisma.packagingFormat.findUnique({
    where: { id },
  }) as unknown as PackagingFormatRow | null;
}

export async function findBaseUnit(productId: string): Promise<PackagingFormatRow | null> {
  return prisma.packagingFormat.findFirst({
    where: { product_id: productId, is_base_unit: true },
  }) as unknown as PackagingFormatRow | null;
}

export async function countByProduct(productId: string): Promise<number> {
  return prisma.packagingFormat.count({ where: { product_id: productId } });
}

export async function create(data: {
  product_id:        string;
  label:             string;
  units_per_package: number;
  is_base_unit:      boolean;
}): Promise<PackagingFormatRow> {
  return prisma.packagingFormat.create({ data }) as unknown as PackagingFormatRow;
}

export async function update(
  id: string,
  data: {
    label?:             string;
    units_per_package?: number;
    is_base_unit?:      boolean;
  },
): Promise<PackagingFormatRow> {
  return prisma.packagingFormat.update({
    where: { id },
    data,
  }) as unknown as PackagingFormatRow;
}

export async function remove(id: string): Promise<void> {
  await prisma.packagingFormat.delete({ where: { id } });
}
