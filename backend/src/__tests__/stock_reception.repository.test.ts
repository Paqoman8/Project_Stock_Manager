/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrismaTransaction = jest.fn() as jest.Mock<any>;

const mockStockReceptionUpdate = jest.fn() as jest.Mock<any>;
const mockInventoryUpsert = jest.fn() as jest.Mock<any>;
const mockInventoryBreakdownUpsert = jest.fn() as jest.Mock<any>;
const mockConfirmedReceptionsFindMany = jest.fn() as jest.Mock<any>;
const mockPurchaseOrderItemFindMany = jest.fn() as jest.Mock<any>;
const mockPurchaseOrderUpdate = jest.fn() as jest.Mock<any>;
const mockSupplierProductFindUnique = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    $transaction: mockPrismaTransaction,
  },
}));

import { confirm } from '../repositories/stock_reception.repository';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('confirm', () => {
  it('keeps the order PARTIALLY_RECEIVED when one packaging line is still short', async () => {
    mockPrismaTransaction.mockImplementation(async (callback: any) => callback({
      stockReception: {
        update: mockStockReceptionUpdate.mockResolvedValue({
          id: 'reception-001',
          order_id: 'order-001',
          order: { id: 'order-001', reference: 'BC-2026-0001', destination_store_id: 'store-001' },
          items: [
            {
              id: 'reception-item-001',
              product_id: 'prod-001',
              stock_units_added: 24,
              packaging_format_id: 'fmt-small',
              packages_received: 2,
            },
          ],
        }),
        findMany: mockConfirmedReceptionsFindMany.mockResolvedValue([
          {
            items: [
              { product_id: 'prod-001', packaging_format_id: 'fmt-small', stock_units_added: 24 },
              { product_id: 'prod-001', packaging_format_id: 'fmt-large', stock_units_added: 30 },
            ],
          },
        ]),
      },
      inventory: { upsert: mockInventoryUpsert.mockResolvedValue({}) },
      inventoryBreakdown: { upsert: mockInventoryBreakdownUpsert.mockResolvedValue({}) },
      purchaseOrderItem: {
        findMany: mockPurchaseOrderItemFindMany.mockResolvedValue([
          {
            id: 'order-item-small',
            ordered_qty: 2,
            packaging_format_id: 'fmt-small',
            supplier_product_id: 'sp-small',
            supplier_product: {
              product_id: 'prod-001',
              packaging_format: { units_per_package: 12 },
            },
          },
          {
            id: 'order-item-large',
            ordered_qty: 2,
            packaging_format_id: 'fmt-large',
            supplier_product_id: 'sp-large',
            supplier_product: {
              product_id: 'prod-001',
              packaging_format: { units_per_package: 24 },
            },
          },
        ]),
      },
      purchaseOrder: { update: mockPurchaseOrderUpdate.mockResolvedValue({}) },
      supplierProduct: { findUnique: mockSupplierProductFindUnique },
    }));

    await confirm('reception-001');

    expect(mockPurchaseOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'PARTIALLY_RECEIVED' },
      }),
    );
  });

  it('does not query supplierProduct again for each order item', async () => {
    mockPrismaTransaction.mockImplementation(async (callback: any) => callback({
      stockReception: {
        update: mockStockReceptionUpdate.mockResolvedValue({
          id: 'reception-001',
          order_id: 'order-001',
          order: { id: 'order-001', reference: 'BC-2026-0001', destination_store_id: 'store-001' },
          items: [],
        }),
        findMany: mockConfirmedReceptionsFindMany.mockResolvedValue([]),
      },
      inventory: { upsert: mockInventoryUpsert.mockResolvedValue({}) },
      inventoryBreakdown: { upsert: mockInventoryBreakdownUpsert.mockResolvedValue({}) },
      purchaseOrderItem: {
        findMany: mockPurchaseOrderItemFindMany.mockResolvedValue([]),
      },
      purchaseOrder: { update: mockPurchaseOrderUpdate.mockResolvedValue({}) },
      supplierProduct: { findUnique: mockSupplierProductFindUnique },
    }));

    await confirm('reception-001');

    expect(mockSupplierProductFindUnique).not.toHaveBeenCalled();
  });
});
