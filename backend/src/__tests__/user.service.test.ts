/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */

const mockRoleFindUnique = jest.fn() as jest.Mock<any>;
const mockUserFindUnique = jest.fn() as jest.Mock<any>;
const mockUserFindFirst = jest.fn() as jest.Mock<any>;
const mockStoreFindMany = jest.fn() as jest.Mock<any>;

jest.mock('../config/database', () => ({
  prisma: {
    role: { findUnique: mockRoleFindUnique },
    user: { findUnique: mockUserFindUnique, findFirst: mockUserFindFirst },
    store: { findMany: mockStoreFindMany },
  },
}));

const mockFindByUsername = jest.fn() as jest.Mock<any>;
const mockBelongsToOrganization = jest.fn() as jest.Mock<any>;
const mockRepoUpdate = jest.fn() as jest.Mock<any>;

jest.mock('../repositories/user.repository', () => ({
  findByUsername: mockFindByUsername,
  belongsToOrganization: mockBelongsToOrganization,
  update: mockRepoUpdate,
}));

jest.mock('../services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(void 0),
  resolveActorName: jest.fn().mockResolvedValue('Testeur'),
  resolveStoreName: jest.fn().mockResolvedValue('Magasin Test'),
}));

import * as userService from '../services/user.service';

const ORG_ID = 'org-uuid-001';
const HUB_STORE_ID = 'hub-store-001';
const OTHER_STORE_ID = 'store-002';
const SA_ID = 'user-sa-001';
const TARGET_ID = 'user-target-001';
const REQUESTER = { id: 'requester-001', roleId: 'role-admin', storeId: 'store-002', ipAddress: '127.0.0.1' };

const VALID_PASSWORD = 'Aa1!aaaa';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createUser — garde "Platform Manager"', () => {
  it('rejette la création avec le message générique "Rôle introuvable" quand le rôle cible est Platform Manager', async () => {
    mockRoleFindUnique.mockResolvedValue({ id: 'role-pm', name: 'Platform Manager' });

    await expect(
      userService.createUser(
        ORG_ID,
        { username: 'jean.dupont', email: 'jean@example.com', password: VALID_PASSWORD, roleId: 'role-pm', storeIds: [HUB_STORE_ID] },
        REQUESTER,
      ),
    ).rejects.toThrow('Rôle introuvable');

    // Le rejet doit intervenir avant toute vérification d'unicité — aucun effet de bord.
    expect(mockFindByUsername).not.toHaveBeenCalled();
  });
});

describe('updateUser — garde "Platform Manager"', () => {
  it('rejette le changement de rôle avec le message générique "Rôle introuvable" quand le rôle visé est Platform Manager', async () => {
    mockUserFindUnique.mockResolvedValue({
      id: TARGET_ID,
      username: 'op.test',
      email: 'op@example.com',
      role_id: 'role-operateur',
      role: { name: 'Opérateur' },
      store_access: [],
    });
    mockBelongsToOrganization.mockResolvedValue(true);
    mockRoleFindUnique.mockResolvedValue({ name: 'Platform Manager' });

    await expect(
      userService.updateUser(ORG_ID, TARGET_ID, { roleId: 'role-pm' }, REQUESTER),
    ).rejects.toThrow('Rôle introuvable');

    expect(mockRepoUpdate).not.toHaveBeenCalled();
  });
});

describe('updateUser — protection des stores protégés du SA, scopée à son organisation', () => {
  const SA_EXISTANT = {
    id: SA_ID,
    username: 'admin.org',
    email: 'admin@example.com',
    role_id: 'role-sa',
    role: { name: 'Super Administrateur' },
    store_access: [{ store: { name: 'Hub Central' } }],
  };
  const SA_REQUESTER = { id: SA_ID, roleId: 'role-sa', storeId: HUB_STORE_ID, ipAddress: '127.0.0.1' };

  it('n\'échoue plus quand seul le Hub Central de SA PROPRE organisation est protégé (régression du bug non-scopé)', async () => {
    mockUserFindUnique.mockResolvedValue(SA_EXISTANT);
    mockBelongsToOrganization.mockResolvedValue(true);
    mockStoreFindMany
      .mockResolvedValueOnce([{ id: HUB_STORE_ID }, { id: OTHER_STORE_ID }]) // Étape 5 : existence des magasins demandés
      .mockResolvedValueOnce([{ id: HUB_STORE_ID }])                        // Étape 5b : stores protégés SCOPÉS à orgId
      .mockResolvedValueOnce([{ name: 'Hub Central' }, { name: 'Autre Magasin' }]); // diff d'audit
    mockRepoUpdate.mockResolvedValue({ ...SA_EXISTANT, store_access: [] });

    await expect(
      userService.updateUser(ORG_ID, SA_ID, { storeIds: [HUB_STORE_ID, OTHER_STORE_ID] }, SA_REQUESTER),
    ).resolves.toBeDefined();

    // Assertion clé : la requête des stores protégés est bien scopée à l'organisation du SA.
    expect(mockStoreFindMany).toHaveBeenNthCalledWith(2, {
      where: { is_protected: true, organization_id: ORG_ID },
      select: { id: true },
    });
  });

  it('échoue toujours si le Hub Central de SA PROPRE organisation est retiré des storeIds', async () => {
    mockUserFindUnique.mockResolvedValue(SA_EXISTANT);
    mockBelongsToOrganization.mockResolvedValue(true);
    mockStoreFindMany
      .mockResolvedValueOnce([{ id: OTHER_STORE_ID }]) // Étape 5 : le magasin demandé existe
      .mockResolvedValueOnce([{ id: HUB_STORE_ID }]);  // Étape 5b : le Hub Central de l'org n'est pas dans storeIds

    await expect(
      userService.updateUser(ORG_ID, SA_ID, { storeIds: [OTHER_STORE_ID] }, SA_REQUESTER),
    ).rejects.toThrow('SA_PROTECTED_STORE_REQUIRED');

    expect(mockRepoUpdate).not.toHaveBeenCalled();
  });
});
