/**
 * Unit tests for transaction.service.ts
 *
 * All database access is mocked — tests run without a real Postgres instance.
 * Covers: nominal sale, insufficient stock, unknown product, DB rollback,
 * refund flow (happy path + error cases), and daily summary aggregation.
 */


// ---------------------------------------------------------------------------
// MOCK SETUP — PRISMA CLIENT                                              
// Must be defined before any module imports                               
// ---------------------------------------------------------------------------

/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockProductFindMany      = jest.fn() as jest.Mock<any>;
const mockInventoryFindMany    = jest.fn() as jest.Mock<any>;
const mockInventoryUpdate      = jest.fn() as jest.Mock<any>;
const mockInventoryUpsert      = jest.fn() as jest.Mock<any>;
const mockMovementCreate       = jest.fn() as jest.Mock<any>;
const mockPackagingFindUnique  = jest.fn() as jest.Mock<any>;
const mockClientFindMany       = jest.fn() as jest.Mock<any>;
const mockClientFindUnique     = jest.fn() as jest.Mock<any>;
const mockClientCreate         = jest.fn() as jest.Mock<any>;
const mockClientUpdate         = jest.fn() as jest.Mock<any>;
const mockTransactionFindMany  = jest.fn() as jest.Mock<any>;
const mockTxFindFirst          = jest.fn() as jest.Mock<any>;
const mockTransactionAggregate = jest.fn() as jest.Mock<any>;
const mockPrismaTransaction    = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    product:       { findMany: mockProductFindMany },
    packagingFormat: { findUnique: mockPackagingFindUnique },
    client: {
      findMany: mockClientFindMany,
      findUnique: mockClientFindUnique,
      create: mockClientCreate,
      update: mockClientUpdate,
    },
    inventory:     {
      findMany: mockInventoryFindMany,
      update:   mockInventoryUpdate,
      upsert:   mockInventoryUpsert,
    },
    stockMovement: { create: mockMovementCreate },
    transaction:   {
      findFirst: mockTxFindFirst,
      findMany: mockTransactionFindMany,
      aggregate: mockTransactionAggregate,
    },
    $transaction:  mockPrismaTransaction,
  },
}));

// ---------------------------------------------------------------------------
// Mock the repository
// ---------------------------------------------------------------------------

const mockCreateTransaction  = jest.fn() as jest.Mock<any>;
const mockListTransactions   = jest.fn() as jest.Mock<any>;
const mockListTransactionsPaginated = jest.fn() as jest.Mock<any>;
const mockGetTransactionById = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/transaction.repository', () => ({
  createTransaction:  mockCreateTransaction,
  listTransactions:   mockListTransactions,
  listTransactionsPaginated: mockListTransactionsPaginated,
  getTransactionById: mockGetTransactionById,
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));


// ---------------------------------------------------------------------------
// SYSTEM UNDER TEST (SUT)                                                 
// Imported after all mocks are in place                                    
// ---------------------------------------------------------------------------

import * as transactionService from '../services/transaction.service';


// ---------------------------------------------------------------------------
// TEST FIXTURES                                                            
// ---------------------------------------------------------------------------

const ACTOR_ID   = 'actor-uuid-001';
const ACTOR_NAME = 'Test Caissier';
const STORE_ID   = 'store-uuid-001';

const SALE_INPUT: transactionService.CreateSaleInput = {
  payment_method: 'CASH',
  items: [
    { product_id: 'prod-001', qty: 2, price_at_sale: 500 },
    { product_id: 'prod-002', qty: 1, price_at_sale: 1200 },
  ],
};

const MOCK_TRANSACTION = {
  id:             'tx-uuid-001',
  store_id:       STORE_ID,
  user_id:        ACTOR_ID,
  type:           'SALE' as const,
  payment_method: 'CASH' as const,
  total_amount:   '2200',
  refund_of_id:   null,
  created_at:     new Date(),
  store:          { id: STORE_ID, name: 'Test Store' },
  user:           { id: ACTOR_ID, username: 'caissier' },
  items: [
    {
      id:                  'item-001',
      product_id:          'prod-001',
      qty:                 2,
      price_at_sale:       '500',
      packaging_format_id: null,
      product:             { id: 'prod-001', name: 'Produit A', sku: 'SKU-A', unit: 'PIECE' },
      packaging_format:    null,
    },
    {
      id:                  'item-002',
      product_id:          'prod-002',
      qty:                 1,
      price_at_sale:       '1200',
      packaging_format_id: null,
      product:             { id: 'prod-002', name: 'Produit B', sku: 'SKU-B', unit: 'PIECE' },
      packaging_format:    null,
    },
  ],
};


// ---------------------------------------------------------------------------
// SETUP HELPERS                                                            
// ---------------------------------------------------------------------------

/**
 * Configures mocks to return all required products as found.
 */
function setupAllProductsFound(): void {
  mockProductFindMany.mockResolvedValue([{ id: 'prod-001' }, { id: 'prod-002' }]);
}

/**
 * Configures mocks to return sufficient stock for all items.
 */
function setupAdequateStock(): void {
  mockInventoryFindMany.mockResolvedValue([
    { product_id: 'prod-001', stock_physical: 10 },
    { product_id: 'prod-002', stock_physical: 5 },
  ]);
}

/**
 * Configures mocks to simulate successful Prisma transaction with callbacks.
 */
function setupSuccessfulPrismaTransaction(): void {
  mockPrismaTransaction.mockImplementation(async (callback: any) => {
    // inventory.findMany inside TX returns adequate stock (mirrors setupAdequateStock)
    const fakeTx = {
      inventory: {
        findMany: jest.fn().mockResolvedValue([
          { product_id: 'prod-001', stock_physical: 10 },
          { product_id: 'prod-002', stock_physical: 5 },
        ]),
        update: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    return callback(fakeTx);
  });
  mockCreateTransaction.mockResolvedValue(MOCK_TRANSACTION);
}


// ---------------------------------------------------------------------------
// TEST SUITES                                                              
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});


// ── createSale Tests
describe('createSale', () => {
  it('returns the created transaction on a successful sale', async () => {
    setupAllProductsFound();
    setupAdequateStock();
    setupSuccessfulPrismaTransaction();

    const result = await transactionService.createSale(
      SALE_INPUT, ACTOR_ID, ACTOR_NAME, STORE_ID,
    );

    expect(result).toBe(MOCK_TRANSACTION);
    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws PRODUCT_NOT_FOUND when a product is inactive or missing', async () => {
    // Only one of the two products exists
    mockProductFindMany.mockResolvedValue([{ id: 'prod-001' }]);

    await expect(
      transactionService.createSale(SALE_INPUT, ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('PRODUCT_NOT_FOUND');

    expect(mockPrismaTransaction).not.toHaveBeenCalled();
  });

  it('throws INSUFFICIENT_STOCK when a product has less stock than requested', async () => {
    setupAllProductsFound();
    // The stock check now runs inside the serializable TX.
    // Configure the TX mock to return insufficient stock via inventory.findMany.
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: {
          // prod-001 has only 1 unit available, but SALE_INPUT requests qty=2
          findMany: jest.fn().mockResolvedValue([
            { product_id: 'prod-001', stock_physical: 1 },
            { product_id: 'prod-002', stock_physical: 5 },
          ]),
          update: jest.fn().mockResolvedValue({}),
          upsert: jest.fn().mockResolvedValue({}),
        },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
      };
      return callback(fakeTx);
    });

    await expect(
      transactionService.createSale(SALE_INPUT, ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('INSUFFICIENT_STOCK');

    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
  });

  it('throws INSUFFICIENT_STOCK when duplicate lines exceed available stock in aggregate', async () => {
    mockProductFindMany.mockResolvedValue([{ id: 'prod-001' }]);
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: {
          findMany: jest.fn().mockResolvedValue([
            { product_id: 'prod-001', stock_physical: 5 },
          ]),
          update: jest.fn().mockResolvedValue({}),
          upsert: jest.fn().mockResolvedValue({}),
        },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        client: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue(null) },
      };
      return callback(fakeTx);
    });

    await expect(
      transactionService.createSale(
        {
          payment_method: 'CASH',
          items: [
            { product_id: 'prod-001', qty: 3, price_at_sale: 500 },
            { product_id: 'prod-001', qty: 3, price_at_sale: 500 },
          ],
        },
        ACTOR_ID,
        ACTOR_NAME,
        STORE_ID,
      ),
    ).rejects.toThrow('INSUFFICIENT_STOCK');

    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('propagates DB errors when the Prisma transaction rolls back', async () => {
    setupAllProductsFound();
    setupAdequateStock();
    mockPrismaTransaction.mockRejectedValue(new Error('DB_ROLLBACK'));

    await expect(
      transactionService.createSale(SALE_INPUT, ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('DB_ROLLBACK');

    // Repository create must NOT have been called inside the failed transaction
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('converts packages_count to base quantity and persists packaging metadata', async () => {
    mockProductFindMany.mockResolvedValue([{ id: 'prod-001' }]);
    mockPackagingFindUnique.mockResolvedValue({
      id: 'fmt-001',
      product_id: 'prod-001',
      units_per_package: 12,
    });
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: {
          findMany: jest.fn().mockResolvedValue([{ product_id: 'prod-001', stock_physical: 48 }]),
          update: jest.fn().mockResolvedValue({}),
          upsert: jest.fn().mockResolvedValue({}),
        },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        inventoryBreakdown: { findUnique: jest.fn().mockResolvedValue({ quantity: 99 }), update: jest.fn().mockResolvedValue({}) },
        client: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(null) },
      };
      return callback(fakeTx);
    });
    mockCreateTransaction.mockResolvedValue(MOCK_TRANSACTION);

    await transactionService.createSale(
      {
        payment_method: 'CASH',
        items: [
          {
            product_id: 'prod-001',
            packaging_format_id: 'fmt-001',
            packages_count: 2,
            price_at_sale: 500,
          },
        ],
      },
      ACTOR_ID,
      ACTOR_NAME,
      STORE_ID,
    );

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            product_id: 'prod-001',
            qty: 24,
            packaging_format_id: 'fmt-001',
            packages_count: 2,
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it('reuses an existing client matched by normalized phone before creating a sale', async () => {
    setupAllProductsFound();
    setupAdequateStock();
    mockClientFindMany.mockResolvedValue([
      {
        id: 'client-001',
        name: 'Alice',
        phone: '+22997000000',
        email: 'alice@example.com',
        normalized_email: 'alice@example.com',
        normalized_phone: '22997000000',
      },
    ]);
    mockClientUpdate.mockResolvedValue({
      id: 'client-001',
      name: 'Alice',
      phone: '+22997000000',
      email: 'alice@example.com',
    });
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: {
          findMany: jest.fn().mockResolvedValue([
            { product_id: 'prod-001', stock_physical: 10 },
            { product_id: 'prod-002', stock_physical: 5 },
          ]),
          update: jest.fn().mockResolvedValue({}),
          upsert: jest.fn().mockResolvedValue({}),
        },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        client: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'client-001',
              name: 'Alice',
              phone: '+22997000000',
              email: 'alice@example.com',
              normalized_email: 'alice@example.com',
              normalized_phone: '22997000000',
            },
          ]),
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({
            id: 'client-001',
            name: 'Alice',
            phone: '+22997000000',
            email: 'alice@example.com',
          }),
          create: jest.fn().mockResolvedValue({}),
        },
      };
      return callback(fakeTx);
    });
    mockCreateTransaction.mockResolvedValue(MOCK_TRANSACTION);

    await transactionService.createSale(
      {
        ...SALE_INPUT,
        client: {
          name: 'Alice',
          phone: '97 00 00 00',
          email: 'alice@example.com',
        },
      },
      ACTOR_ID,
      ACTOR_NAME,
      STORE_ID,
    );

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'client-001',
      }),
      expect.anything(),
    );
    expect(mockClientCreate).not.toHaveBeenCalled();
  });
});


// ── refundSale Tests
describe('refundSale', () => {
  it('throws TRANSACTION_NOT_FOUND when the original transaction does not exist', async () => {
    mockGetTransactionById.mockResolvedValue(null);

    await expect(
      transactionService.refundSale('non-existent', ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('TRANSACTION_NOT_FOUND');
  });

  it('throws ONLY_SALES_CAN_BE_REFUNDED when the target is itself a REFUND', async () => {
    mockGetTransactionById.mockResolvedValue({
      ...MOCK_TRANSACTION,
      type:     'REFUND',
      store_id: STORE_ID,
    });

    await expect(
      transactionService.refundSale('tx-refund-001', ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('ONLY_SALES_CAN_BE_REFUNDED');
  });

  it('throws TRANSACTION_ALREADY_REFUNDED when a refund already exists', async () => {
    mockGetTransactionById.mockResolvedValue({ ...MOCK_TRANSACTION, store_id: STORE_ID });
    mockTransactionFindMany.mockResolvedValue([
      {
        items: [
          {
            product_id: 'prod-001',
            packaging_format_id: null,
            packages_count: null,
            qty: 2,
          },
          {
            product_id: 'prod-002',
            packaging_format_id: null,
            packages_count: null,
            qty: 1,
          },
        ],
      },
    ]);
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory:         { upsert: jest.fn().mockResolvedValue({}) },
        stockMovement:     { create: jest.fn().mockResolvedValue({}) },
        inventoryBreakdown:{ upsert: jest.fn().mockResolvedValue({}) },
        transaction:       { findMany: mockTransactionFindMany },
      };
      return callback(fakeTx);
    });

    await expect(
      transactionService.refundSale(MOCK_TRANSACTION.id, ACTOR_ID, ACTOR_NAME, STORE_ID),
    ).rejects.toThrow('TRANSACTION_ALREADY_REFUNDED');
  });

  it('creates a REFUND transaction when all checks pass', async () => {
    mockGetTransactionById.mockResolvedValue({ ...MOCK_TRANSACTION, store_id: STORE_ID });
    mockTransactionFindMany.mockResolvedValue([]);

    const refundTx = { ...MOCK_TRANSACTION, id: 'tx-refund-001', type: 'REFUND' as const };
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory:     { upsert: jest.fn().mockResolvedValue({}) },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        transaction:   { findMany: mockTransactionFindMany },
      };
      return callback(fakeTx);
    });
    mockCreateTransaction.mockResolvedValue(refundTx);

    const result = await transactionService.refundSale(
      MOCK_TRANSACTION.id, ACTOR_ID, ACTOR_NAME, STORE_ID,
    );

    expect(result.type).toBe('REFUND');
    expect(mockPrismaTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
  });

  it('creates a partial refund for selected full lines only', async () => {
    mockGetTransactionById.mockResolvedValue({ ...MOCK_TRANSACTION, store_id: STORE_ID });
    mockTransactionFindMany.mockResolvedValue([]);
    const refundTx = { ...MOCK_TRANSACTION, id: 'tx-refund-002', type: 'REFUND' as const };
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: { upsert: jest.fn().mockResolvedValue({}) },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        transaction:   { findMany: mockTransactionFindMany },
      };
      return callback(fakeTx);
    });
    mockCreateTransaction.mockResolvedValue(refundTx);

    await transactionService.refundSale(
      MOCK_TRANSACTION.id,
      ACTOR_ID,
      ACTOR_NAME,
      STORE_ID,
      undefined,
      undefined,
      [{ transaction_item_id: MOCK_TRANSACTION.items[0].id }],
    );

    expect(mockCreateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        total_amount: 1000,
        items: [
          expect.objectContaining({
            product_id: 'prod-001',
            qty: 2,
          }),
        ],
      }),
      expect.anything(),
    );
  });

  it('allows refunding the second identical line when only the first identical line was already refunded', async () => {
    const duplicatedTransaction = {
      ...MOCK_TRANSACTION,
      store_id: STORE_ID,
      items: [
        {
          id: 'item-dup-001',
          product_id: 'prod-001',
          qty: 2,
          price_at_sale: '500',
          packaging_format_id: null,
          packages_count: null,
          product: { id: 'prod-001', name: 'Produit A', sku: 'SKU-A', unit: 'PIECE' },
          packaging_format: null,
        },
        {
          id: 'item-dup-002',
          product_id: 'prod-001',
          qty: 2,
          price_at_sale: '500',
          packaging_format_id: null,
          packages_count: null,
          product: { id: 'prod-001', name: 'Produit A', sku: 'SKU-A', unit: 'PIECE' },
          packaging_format: null,
        },
      ],
    };
    mockGetTransactionById.mockResolvedValue(duplicatedTransaction);
    mockTransactionFindMany.mockResolvedValue([
      {
        items: [
          {
            original_transaction_item_id: 'item-dup-001',
            product_id: 'prod-001',
            packaging_format_id: null,
            packages_count: null,
            qty: 2,
          },
        ],
      },
    ]);
    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: { upsert: jest.fn().mockResolvedValue({}) },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        transaction:   { findMany: mockTransactionFindMany },
      };
      return callback(fakeTx);
    });
    mockCreateTransaction.mockResolvedValue({ ...MOCK_TRANSACTION, id: 'tx-refund-003', type: 'REFUND' as const });

    await expect(
      transactionService.refundSale(
        duplicatedTransaction.id,
        ACTOR_ID,
        ACTOR_NAME,
        STORE_ID,
        undefined,
        undefined,
        [{ transaction_item_id: 'item-dup-002' }],
      ),
    ).resolves.toMatchObject({ type: 'REFUND' });
  });

  it('throws TRANSACTION_LINE_ALREADY_REFUNDED when a second partial refund on the same line would exceed the original quantity', async () => {
    const transactionWithQty3 = {
      ...MOCK_TRANSACTION,
      store_id: STORE_ID,
      items: [
        {
          ...MOCK_TRANSACTION.items[0],
          qty: 3,
        },
      ],
    };
    mockGetTransactionById.mockResolvedValue(transactionWithQty3);

    // First refund already returned 2 of the 3 units for item-001
    mockTransactionFindMany.mockResolvedValue([
      {
        items: [
          {
            original_transaction_item_id: 'item-001',
            product_id: 'prod-001',
            packaging_format_id: null,
            packages_count: null,
            qty: 2,
          },
        ],
      },
    ]);

    mockPrismaTransaction.mockImplementation(async (callback: any) => {
      const fakeTx = {
        inventory: { upsert: jest.fn().mockResolvedValue({}) },
        stockMovement: { create: jest.fn().mockResolvedValue({}) },
        transaction: { findMany: mockTransactionFindMany },
      };
      return callback(fakeTx);
    });

    // Second refund tries to return 2 more — only 1 remains
    await expect(
      transactionService.refundSale(
        transactionWithQty3.id,
        ACTOR_ID,
        ACTOR_NAME,
        STORE_ID,
        undefined,
        undefined,
        [{ transaction_item_id: 'item-001', qty: 2 }],
      ),
    ).rejects.toThrow('TRANSACTION_LINE_ALREADY_REFUNDED');
  });
});


// ── getDailySummary Tests
describe('getDailySummary', () => {
  it('returns zero totals when no sales exist for the day', async () => {
    mockTransactionAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { total_amount: null } });

    const summary = await transactionService.getDailySummary(STORE_ID);

    expect(summary.total_sales).toBe(0);
    expect(summary.total_amount).toBe(0);
  });

  it('sums total_amount correctly across multiple sales', async () => {
    mockTransactionAggregate.mockResolvedValue({ _count: { id: 2 }, _sum: { total_amount: '3000' } });

    const summary = await transactionService.getDailySummary(STORE_ID);

    expect(summary.total_sales).toBe(2);
    expect(summary.total_amount).toBe(3000);
  });

  it('returns the date in YYYY-MM-DD format', async () => {
    mockTransactionAggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { total_amount: null } });
    // Force local midnight to a known UTC date. Use a noon UTC time so that
    // setHours(0,0,0,0) in any UTC-offset timezone still lands on the same calendar day.
    const target = new Date('2026-06-02T12:00:00Z');

    const summary = await transactionService.getDailySummary(STORE_ID, target);

    expect(summary.date).toBe('2026-06-02');
  });
});

// ── listTransactionsForStore Tests
describe('listTransactionsForStore', () => {
  it('returns paginated transactions with default page and limit', async () => {
    mockListTransactionsPaginated.mockResolvedValue({
      transactions: [{ id: 'tx-001' }],
      total: 1,
      page: 1,
      totalPages: 1,
    });

    const result = await transactionService.listTransactionsForStore({
      storeId: STORE_ID,
      page: 1,
      limit: 10,
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(mockListTransactionsPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ store_id: STORE_ID, page: 1, limit: 10 }),
    );
  });

  it('forwards search, type and payment_method filters to the repository', async () => {
    mockListTransactionsPaginated.mockResolvedValue({
      transactions: [],
      total: 0,
      page: 2,
      totalPages: 0,
    });

    await transactionService.listTransactionsForStore({
      storeId: STORE_ID,
      search: 'caissier',
      type: 'SALE',
      paymentMethod: 'CASH',
      page: 2,
      limit: 5,
    });

    expect(mockListTransactionsPaginated).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: STORE_ID,
        search: 'caissier',
        type: 'SALE',
        payment_method: 'CASH',
        page: 2,
        limit: 5,
      }),
    );
  });

  it('computes totalPages from repository result', async () => {
    mockListTransactionsPaginated.mockResolvedValue({
      transactions: [],
      total: 25,
      page: 1,
      totalPages: 3,
    });

    const result = await transactionService.listTransactionsForStore({
      storeId: STORE_ID,
      page: 1,
      limit: 10,
    });

    expect(result.totalPages).toBe(3);
  });
});
