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

describe('createReception', () => {
  it('rejects a reception that exceeds the remaining quantity for an order line', async () => {
    mockPurchaseOrderFindUnique.mockResolvedValue({
      id: 'order-001',
      reference: 'BC-2026-0001',
      status: 'SENT',
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
    });
    mockConfirmedReceptionsFindMany.mockResolvedValue([
      {
        items: [
          {
            order_item_id: 'order-item-001',
            received_qty: 4,
          },
        ],
      },
    ]);

    await expect(
      stockReceptionService.createReception(
        {
          order_id: 'order-001',
          items: [{ order_item_id: 'order-item-001', received_qty: 2 }],
        },
        'actor-001',
        'Receiver',
      ),
    ).rejects.toThrow('RECEPTION_QTY_EXCEEDS_REMAINING');

    expect(mockReceptionCreate).not.toHaveBeenCalled();
  });
});
