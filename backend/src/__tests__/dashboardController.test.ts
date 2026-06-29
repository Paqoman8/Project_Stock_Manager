/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRoleFindUnique = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    role: { findUnique: mockRoleFindUnique },
  },
}));

const mockGetDashboardOverview = jest.fn() as jest.Mock<any>;

jest.mock('../services/dashboard.service', () => ({
  getDashboardOverview: mockGetDashboardOverview,
}));

import { getDashboardOverview } from '../controllers/dashboardController';

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('getDashboardOverview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRoleFindUnique.mockResolvedValue({ name: 'Manager Magasin' });
  });

  it('returns 400 for invalid date ranges', async () => {
    const req = {
      user: { storeId: 'store-001', roleId: 'role-001' },
      query: { from: '2026-06-10', to: '2026-06-01' },
    } as any;
    const res = createResponse();

    await getDashboardOverview(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGetDashboardOverview).not.toHaveBeenCalled();
  });

  it('passes validated date bounds to the dashboard service', async () => {
    const req = {
      user: { storeId: 'store-001', roleId: 'role-001' },
      query: { from: '2026-06-01', to: '2026-06-07' },
    } as any;
    const res = createResponse();
    mockGetDashboardOverview.mockResolvedValue({ stat_cards: [], recent_actions: [], visibility: {}, donut: null, bar: null, line: null });

    await getDashboardOverview(req, res);

    expect(mockGetDashboardOverview).toHaveBeenCalledWith(
      'store-001',
      'Manager Magasin',
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      }),
    );
    const period = mockGetDashboardOverview.mock.calls[0][2];
    expect(period.from.getFullYear()).toBe(2026);
    expect(period.from.getMonth()).toBe(5);
    expect(period.from.getDate()).toBe(1);
    expect(period.from.getHours()).toBe(0);
    expect(period.to.getDate()).toBe(7);
    expect(period.to.getHours()).toBe(23);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
