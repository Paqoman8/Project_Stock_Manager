/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPurchaseOrderFindUnique = jest.fn() as jest.Mock<any>;
const mockConfirmedReceptionsFindMany = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    purchaseOrder: { findUnique: mockPurchaseOrderFindUnique },
    stockReception: { findMany: mockConfirmedReceptionsFindMany },
  },
}));

const mockReceptionCreate = jest.fn() as jest.Mock<any>;
const mockReceptionFindById = jest.fn() as jest.Mock<any>;
const mockReceptionConfirm = jest.fn() as jest.Mock<any>;
const mockReceptionCancel = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/stock_reception.repository', () => ({
  create: mockReceptionCreate,
  findById: mockReceptionFindById,
  findByOrderId: jest.fn(),
  confirm: mockReceptionConfirm,
  cancel: mockReceptionCancel,
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as stockReceptionService from '../services/stock_reception.service';

beforeEach(() => {
  jest.clearAllMocks();
});

function mockOrder(overrides: Record<string, unknown> = {}) {
  mockPurchaseOrderFindUnique.mockResolvedValue({
    id: 'order-001',
    reference: 'BC-2026-0001',
    status: 'SENT',
    destination_store_id: 'store-001',
    items: [
      {
        id: 'order-item-001',
        ordered_qty: 5,
        supplier_product: {
          product_id: 'prod-001',
          packaging_format_id: 'fmt-001',
          packaging_format: { units_per_package: 12 },
        },
      },
    ],
    ...overrides,
  });
}

describe('createReception — garde de surplus', () => {
  it('rejette un surplus (quantité reçue > reliquat) sans note', async () => {
    mockOrder();
    mockConfirmedReceptionsFindMany.mockResolvedValue([
      { items: [{ order_item_id: 'order-item-001', received_qty: 4 }] },
    ]);

    await expect(
      stockReceptionService.createReception(
        { order_id: 'order-001', items: [{ order_item_id: 'order-item-001', received_qty: 2 }] },
        'actor-001',
        'Receiver',
      ),
    ).rejects.toThrow('SURPLUS_REQUIRES_NOTE');

    expect(mockReceptionCreate).not.toHaveBeenCalled();
  });

  it('accepte un surplus dès lors qu\'une note est fournie', async () => {
    mockOrder();
    mockConfirmedReceptionsFindMany.mockResolvedValue([
      { items: [{ order_item_id: 'order-item-001', received_qty: 4 }] },
    ]);
    mockReceptionCreate.mockResolvedValue({ id: 'reception-001' });

    await expect(
      stockReceptionService.createReception(
        {
          order_id: 'order-001',
          notes: 'Le fournisseur a livré un carton supplémentaire par erreur',
          items: [{ order_item_id: 'order-item-001', received_qty: 2 }],
        },
        'actor-001',
        'Receiver',
      ),
    ).resolves.toEqual({ id: 'reception-001' });

    expect(mockReceptionCreate).toHaveBeenCalled();
  });

  it('n\'exige pas de note quand la quantité reçue reste dans le reliquat', async () => {
    mockOrder();
    mockConfirmedReceptionsFindMany.mockResolvedValue([
      { items: [{ order_item_id: 'order-item-001', received_qty: 2 }] },
    ]);
    mockReceptionCreate.mockResolvedValue({ id: 'reception-002' });

    await expect(
      stockReceptionService.createReception(
        { order_id: 'order-001', items: [{ order_item_id: 'order-item-001', received_qty: 3 }] },
        'actor-001',
        'Receiver',
      ),
    ).resolves.toEqual({ id: 'reception-002' });

    expect(mockReceptionCreate).toHaveBeenCalled();
  });

  it('détecte un surplus fractionné sur plusieurs lignes de la même order_item_id sans note (régression agrégation)', async () => {
    mockOrder();
    mockConfirmedReceptionsFindMany.mockResolvedValue([]); // reliquat = ordered_qty = 5

    // Deux lignes de 3 : chacune est < 5 mais la somme (6) dépasse le reliquat.
    await expect(
      stockReceptionService.createReception(
        {
          order_id: 'order-001',
          items: [
            { order_item_id: 'order-item-001', received_qty: 3 },
            { order_item_id: 'order-item-001', received_qty: 3 },
          ],
        },
        'actor-001',
        'Receiver',
      ),
    ).rejects.toThrow('SURPLUS_REQUIRES_NOTE');

    expect(mockReceptionCreate).not.toHaveBeenCalled();
  });

  it('accepte un surplus fractionné sur plusieurs lignes quand une note est fournie', async () => {
    mockOrder();
    mockConfirmedReceptionsFindMany.mockResolvedValue([]);
    mockReceptionCreate.mockResolvedValue({ id: 'reception-003' });

    await expect(
      stockReceptionService.createReception(
        {
          order_id: 'order-001',
          notes: 'Livraison groupée en deux palettes',
          items: [
            { order_item_id: 'order-item-001', received_qty: 3 },
            { order_item_id: 'order-item-001', received_qty: 3 },
          ],
        },
        'actor-001',
        'Receiver',
      ),
    ).resolves.toEqual({ id: 'reception-003' });

    expect(mockReceptionCreate).toHaveBeenCalled();
  });
});

describe('createReception — scope magasin', () => {
  it('rejette la création si restrictToOwnStore et le magasin de l\'acteur diffère de la destination', async () => {
    mockOrder({ destination_store_id: 'store-001' });
    mockConfirmedReceptionsFindMany.mockResolvedValue([]);

    await expect(
      stockReceptionService.createReception(
        { order_id: 'order-001', items: [{ order_item_id: 'order-item-001', received_qty: 1 }] },
        'actor-001',
        'Receiver',
        'store-002', // storeId de l'acteur ≠ destination_store_id de la commande
        'Autre magasin',
        undefined,
        true, // restrictToOwnStore
      ),
    ).rejects.toThrow('FORBIDDEN_STORE_SCOPE');

    expect(mockReceptionCreate).not.toHaveBeenCalled();
  });

  it('autorise la création quand le magasin de l\'acteur correspond à la destination', async () => {
    mockOrder({ destination_store_id: 'store-001' });
    mockConfirmedReceptionsFindMany.mockResolvedValue([]);
    mockReceptionCreate.mockResolvedValue({ id: 'reception-004' });

    await expect(
      stockReceptionService.createReception(
        { order_id: 'order-001', items: [{ order_item_id: 'order-item-001', received_qty: 1 }] },
        'actor-001',
        'Receiver',
        'store-001',
        'Mon magasin',
        undefined,
        true,
      ),
    ).resolves.toEqual({ id: 'reception-004' });

    expect(mockReceptionCreate).toHaveBeenCalled();
  });

  it('n\'applique aucune restriction de magasin quand restrictToOwnStore est faux (SA/Admin)', async () => {
    mockOrder({ destination_store_id: 'store-001' });
    mockConfirmedReceptionsFindMany.mockResolvedValue([]);
    mockReceptionCreate.mockResolvedValue({ id: 'reception-005' });

    await expect(
      stockReceptionService.createReception(
        { order_id: 'order-001', items: [{ order_item_id: 'order-item-001', received_qty: 1 }] },
        'actor-001',
        'Receiver',
        'store-999',
        'Siège',
        undefined,
        false,
      ),
    ).resolves.toEqual({ id: 'reception-005' });
  });
});
