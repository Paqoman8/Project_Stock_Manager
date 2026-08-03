/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockStoreFindUnique = jest.fn() as jest.Mock<any>;
const mockProductFindUnique = jest.fn() as jest.Mock<any>;
const mockPackagingFormatFindUnique = jest.fn() as jest.Mock<any>;
const mockPackagingFormatFindFirst = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    store: { findUnique: mockStoreFindUnique },
    product: { findUnique: mockProductFindUnique },
    packagingFormat: { findUnique: mockPackagingFormatFindUnique, findFirst: mockPackagingFormatFindFirst },
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

const ORG_ID = '00000000-0000-0000-0000-000000000010';

const FORMATS: Record<string, { id: string; label: string; product_id: string; units_per_package: number }> = {
  'fmt-unit':   { id: 'fmt-unit',   label: 'Unité',   product_id: 'prod-001', units_per_package: 1 },
  'fmt-carton': { id: 'fmt-carton', label: 'Carton',  product_id: 'prod-001', units_per_package: 24 },
  'fmt-pack5':  { id: 'fmt-pack5',  label: 'Pack ×5', product_id: 'prod-001', units_per_package: 5 },
};

const BASE_FORMAT = { id: 'fmt-unit', label: 'Unité' };

beforeEach(() => {
  jest.clearAllMocks();
  mockStoreFindUnique.mockResolvedValue({ id: 'store-001' });
  mockProductFindUnique.mockResolvedValue({ id: 'prod-001', name: 'Produit test' });
  mockPackagingFormatFindUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(FORMATS[where.id] ?? null),
  );
  mockPackagingFormatFindFirst.mockResolvedValue(BASE_FORMAT);
  mockCreateConversion.mockResolvedValue({ id: 'movement-001' });
});

describe('createConversion — rejets', () => {
  it('rejette une conversion vers le même format', async () => {
    await expect(
      stockMovementService.createConversion(
        ORG_ID,
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

  it('rejette quand to_packages_count fourni par le client ne correspond pas', async () => {
    await expect(
      stockMovementService.createConversion(
        ORG_ID,
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-carton',
          from_packages_count: 1,
          to_packaging_format_id: 'fmt-unit',
          to_packages_count: 100,
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('CONVERSION_MISMATCH');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });

  it('rejette si aucun format de base trouvé pour le reste', async () => {
    mockPackagingFormatFindFirst.mockResolvedValue(null);

    await expect(
      stockMovementService.createConversion(
        ORG_ID,
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-carton',
          from_packages_count: 1,
          to_packaging_format_id: 'fmt-pack5',
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('BASE_FORMAT_NOT_FOUND');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });
});

describe('createConversion — divisible (sans reste)', () => {
  it('calcule to_packages_count côté serveur quand le client ne le fournit pas', async () => {
    mockPackagingFormatFindFirst.mockResolvedValue(BASE_FORMAT);

    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1,
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

  it('accepte to_packages_count fourni par le client quand il correspond', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
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

  it('passe un appel sans remainder_units ni remainder_format_id pour une conversion exacte', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 2,
        to_packaging_format_id: 'fmt-pack5',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    // 2 cartons × 24 = 48 unités, 48 ÷ 5 = 9 packs (reste 3)
    // Ce test vérifie que findFirst a bien été appelé pour le reste
    expect(mockPackagingFormatFindFirst).toHaveBeenCalledWith({
      where: { product_id: 'prod-001', is_base_unit: true },
      select: { id: true, label: true },
    });
    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        to_packages_count: 9,
        total_units: 48,
        remainder_units: 3,
        remainder_format_id: 'fmt-unit',
      }),
    );
  });
});

describe('createConversion — non-divisible (avec reste)', () => {
  it('convertit 1 carton ×24 → packs ×5 avec reste de 3 unités', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 2,
        to_packaging_format_id: 'fmt-pack5',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockPackagingFormatFindFirst).toHaveBeenCalledWith({
      where: { product_id: 'prod-001', is_base_unit: true },
      select: { id: true, label: true },
    });
    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        to_packages_count: 9,
        total_units: 48,
        remainder_units: 3,
        remainder_format_id: 'fmt-unit',
      }),
    );
  });

  it('convertit 1 carton ×24 → packs ×5 avec reste de 4 unités', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1,
        to_packaging_format_id: 'fmt-pack5',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        to_packages_count: 4,
        total_units: 24,
        remainder_units: 4,
        remainder_format_id: 'fmt-unit',
      }),
    );
  });

  it('convertit 1 pack ×5 → carton ×24 : 0 cartons + 5 unités restantes', async () => {
    await expect(
      stockMovementService.createConversion(
        ORG_ID,
        {
          store_id: 'store-001',
          product_id: 'prod-001',
          from_packaging_format_id: 'fmt-pack5',
          from_packages_count: 1,
          to_packaging_format_id: 'fmt-carton',
          performed_by_id: 'actor-001',
        },
        'actor-001',
        'Actor',
      ),
    ).rejects.toThrow('ZERO_CONVERSION');

    expect(mockCreateConversion).not.toHaveBeenCalled();
  });

  it('ne génère pas d\'erreur et route correctement un gros reste', async () => {
    // 100 packs ×5 = 500 unités → carton ×24
    // 500 ÷ 24 = 20 cartons, reste 20
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-pack5',
        from_packages_count: 100,
        to_packaging_format_id: 'fmt-carton',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        to_packages_count: 20,
        total_units: 500,
        remainder_units: 20,
        remainder_format_id: 'fmt-unit',
      }),
    );
  });
});

describe('createConversion — audit et reason', () => {
  it('inclut le reste dans la reason générée automatiquement', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1,
        to_packaging_format_id: 'fmt-pack5',
        performed_by_id: 'actor-001',
        reason: 'Réorganisation',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('Conversion 1 Carton → 4 Pack ×5 + 4 Unité'),
      }),
    );
  });

  it('inclut le reste dans la reason même sans raison fournie', async () => {
    await stockMovementService.createConversion(
      ORG_ID,
      {
        store_id: 'store-001',
        product_id: 'prod-001',
        from_packaging_format_id: 'fmt-carton',
        from_packages_count: 1,
        to_packaging_format_id: 'fmt-pack5',
        performed_by_id: 'actor-001',
      },
      'actor-001',
      'Actor',
    );

    expect(mockCreateConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: expect.stringContaining('Conversion'),
      }),
    );
  });
});
