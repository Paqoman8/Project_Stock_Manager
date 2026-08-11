/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockOrgFindUnique = jest.fn() as jest.Mock<any>;
const mockOrgDelete = jest.fn() as jest.Mock<any>;
const mockOrgUpdate = jest.fn() as jest.Mock<any>;
const mockUserFindMany = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    organization: {
      findUnique: mockOrgFindUnique,
      delete: mockOrgDelete,
      update: mockOrgUpdate,
    },
    user: {
      findMany: mockUserFindMany,
    },
  },
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
}));

import * as platformService from '../services/platform.service';

const ORG_ID = 'org-uuid-001';
const ACTOR_ID = 'pm-uuid-001';
const ACTOR_NAME = 'Platform Manager';
const IP = '127.0.0.1';

beforeEach(() => {
  jest.clearAllMocks();
  mockUserFindMany.mockResolvedValue([]);
});

describe('deleteOrganization', () => {
  it('throws when the organization does not exist', async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org'),
    ).rejects.toThrow('Organisation introuvable.');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws CONFIRMATION_REQUIRED when the slug is missing', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws CONFIRMATION_REQUIRED when the slug is incorrect', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'wrong-slug'),
    ).rejects.toThrow('CONFIRMATION_REQUIRED');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('throws PROTECTED_ORGANIZATION when the organization itself is protected, even with the correct slug', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: true });

    await expect(
      platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org'),
    ).rejects.toThrow('PROTECTED_ORGANIZATION');

    expect(mockOrgDelete).not.toHaveBeenCalled();
  });

  it('deletes a non-protected organization when the slug matches', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });
    mockOrgDelete.mockResolvedValue({ id: ORG_ID });

    await platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, 'my-org');

    expect(mockOrgDelete).toHaveBeenCalledWith({ where: { id: ORG_ID } });
  });

  it('accepts a slug with different casing (case-insensitive)', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', is_protected: false });
    mockOrgDelete.mockResolvedValue({ id: ORG_ID });

    await platformService.deleteOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP, '  MY-ORG  ');

    expect(mockOrgDelete).toHaveBeenCalledWith({ where: { id: ORG_ID } });
  });
});

describe('suspendOrganization', () => {
  it('throws when the organization does not exist', async () => {
    mockOrgFindUnique.mockResolvedValue(null);

    await expect(
      platformService.suspendOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('Organisation introuvable.');

    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('throws when the organization is protected, even if ACTIVE', async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: ORG_ID, name: 'Global Corp', slug: 'default', status: 'ACTIVE', is_protected: true,
    });

    await expect(
      platformService.suspendOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('Impossible de suspendre une organisation protegee.');

    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('throws when the organization is not ACTIVE', async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: ORG_ID, name: 'My Org', slug: 'my-org', status: 'SUSPENDED', is_protected: false,
    });

    await expect(
      platformService.suspendOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP),
    ).rejects.toThrow('Impossible de suspendre une organisation avec le statut "SUSPENDED".');

    expect(mockOrgUpdate).not.toHaveBeenCalled();
  });

  it('suspends a non-protected, active organization', async () => {
    mockOrgFindUnique.mockResolvedValue({
      id: ORG_ID, name: 'My Org', slug: 'my-org', status: 'ACTIVE', is_protected: false,
    });
    mockOrgUpdate.mockResolvedValue({ id: ORG_ID, status: 'SUSPENDED' });

    await platformService.suspendOrganization(ORG_ID, ACTOR_ID, ACTOR_NAME, IP);

    expect(mockOrgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { status: 'SUSPENDED' },
    });
  });
});

describe('getOrganization', () => {
  it('returns null when the organization does not exist', async () => {
    mockOrgFindUnique.mockResolvedValue(null);
    mockUserFindMany.mockResolvedValue([]);

    const result = await platformService.getOrganization(ORG_ID);

    expect(result).toBeNull();
  });

  it('returns the organization with an empty admins array when it has none', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', status: 'ACTIVE' });
    mockUserFindMany.mockResolvedValue([]);

    const result = await platformService.getOrganization(ORG_ID);

    expect(result).toEqual({ id: ORG_ID, name: 'My Org', slug: 'my-org', status: 'ACTIVE', admins: [] });
  });

  it('maps admin accounts scoped to the organization, ordered by username', async () => {
    mockOrgFindUnique.mockResolvedValue({ id: ORG_ID, name: 'My Org', slug: 'my-org', status: 'ACTIVE' });
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-1', username: 'admin.myorg', email: 'admin@my-org.com',
        is_active: true, role: { name: 'Super Administrateur' },
      },
      {
        id: 'user-2', username: 'jdupont', email: 'jdupont@my-org.com',
        is_active: false, role: { name: 'Administrateur' },
      },
    ]);

    const result = await platformService.getOrganization(ORG_ID);

    expect(mockUserFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          store_access: { some: { organization_id: ORG_ID } },
          role: { name: { in: ['Super Administrateur', 'Administrateur'] } },
        }),
      }),
    );
    expect(result?.admins).toEqual([
      { id: 'user-1', username: 'admin.myorg', email: 'admin@my-org.com', roleName: 'Super Administrateur', isActive: true },
      { id: 'user-2', username: 'jdupont', email: 'jdupont@my-org.com', roleName: 'Administrateur', isActive: false },
    ]);
  });
});
