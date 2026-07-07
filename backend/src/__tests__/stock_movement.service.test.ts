/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockStoreFindUnique = jest.fn() as jest.Mock<any>;
const mockProductFindUnique = jest.fn() as jest.Mock<any>;
const mockPackagingFormatFindUnique = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    store: { findUnique: mockStoreFindUnique },
    product: { findUnique: mockProductFindUnique },
    packagingFormat: { findUnique: mockPackagingFormatFindUnique },
  },
}));

const mockCreateConversion = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/stock_movement.repository', () => ({
  createConversion: mockCreateConversion,
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as stockMovementService from '../services/stock_movement.service';

const FORMATS: Record<string, { id: string; label: string; product_id: string; units_per_package: number }> = {
  'fmt-unit':   { id: 'fmt-unit',   label: 'Unité',  product_id: 'prod-001', units_per_package: 1 },
  'fmt-carton': { id: 'fmt-carton', label: 'Carton', product_id: 'prod-001', units_per_package: 24 },
  'fmt-pack5':  { id: 'fmt-pack5',  label: 'Pack ×5', product_id: 'prod-001', units_per_package: 5 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreFindUnique.mockResolvedValue({ id: 'store-001' });
  mockProductFindUnique.mockResolvedValue({ id: 'prod-001', name: 'Produit test' });
  mockPackagingFormatFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(FORMATS[where.id] ?? null),
  );
  mockCreateConversion.mockResolvedValue({ id: 'movement-001' });
});

describe('createConversion — équivalence server-side', () => {
  it('rejette une conversion vers le même format', async () => {
    await expect(
      stockMovementService.createConversion(
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-carton',
          from_packages_count: 1,
          to_packaging_format_id: 'fmt-carton',
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('SAME_FORMAT_CONVERSION');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });

  it('calcule to_packages_count côté serveur quand le client ne le fournit pas', async () => {
    await stockMovementService.createConversion(
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1, // 1 carton × 24 = 24 unités
        to_packaging_format_id: 'fmt-unit',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({ to_packages_count: 24, total_units: 24 }),
    );
  });

  it('rejette une conversion non divisible en un nombre entier de colis destination', async () => {
    await expect(
      stockMovementService.createConversion(
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-carton',
          from_packages_count: 1, // 24 unités, non divisible par 5
          to_packaging_format_id: 'fmt-pack5',
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('NON_DIVISIBLE_CONVERSION');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });

  it('rejette quand to_packages_count fourni par le client ne correspond pas à l\'équivalence calculée', async () => {
    await expect(
      stockMovementService.createConversion(
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-carton',
          from_packages_count: 1, // devrait donner 24 unités
          to_packaging_format_id: 'fmt-unit',
          to_packages_count: 100, // falsifié par le client
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('CONVERSION_MISMATCH');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });

  it('accepte to_packages_count fourni par le client quand il correspond à l\'équivalence calculée', async () => {
    await stockMovementService.createConversion(
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1,
        to_packaging_format_id: 'fmt-unit',
        to_packages_count: 24,
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({ to_packages_count: 24, total_units: 24 }),
    );
  });
});
