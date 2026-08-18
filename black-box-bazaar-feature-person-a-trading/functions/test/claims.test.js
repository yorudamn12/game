const mockGetUser = jest.fn();
const mockCreateUser = jest.fn();
const mockSetCustomUserClaims = jest.fn();

jest.mock('../src/config', () => ({
  auth: {
    getUser: mockGetUser,
    createUser: mockCreateUser,
    setCustomUserClaims: mockSetCustomUserClaims,
  },
}));

const { getOrCreateTeamAuthUser, setTeamIdClaim } = require('../src/auth/claims');

describe('claims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getOrCreateTeamAuthUser returns the existing user when found', async () => {
    mockGetUser.mockResolvedValue({ uid: 'TEAM-01' });

    const user = await getOrCreateTeamAuthUser('TEAM-01');

    expect(user).toEqual({ uid: 'TEAM-01' });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('getOrCreateTeamAuthUser creates a deterministic user when missing', async () => {
    mockGetUser.mockRejectedValue({ code: 'auth/user-not-found' });
    mockCreateUser.mockResolvedValue({ uid: 'TEAM-01' });

    const user = await getOrCreateTeamAuthUser('TEAM-01');

    expect(mockCreateUser).toHaveBeenCalledWith({ uid: 'TEAM-01', disabled: false });
    expect(user).toEqual({ uid: 'TEAM-01' });
  });

  test('getOrCreateTeamAuthUser rethrows unexpected errors', async () => {
    mockGetUser.mockRejectedValue({ code: 'auth/internal-error' });

    await expect(getOrCreateTeamAuthUser('TEAM-01')).rejects.toMatchObject({
      code: 'auth/internal-error',
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  test('setTeamIdClaim sets only the teamId claim', async () => {
    mockSetCustomUserClaims.mockResolvedValue();

    await setTeamIdClaim('TEAM-01', 'TEAM-01');

    expect(mockSetCustomUserClaims).toHaveBeenCalledWith('TEAM-01', { teamId: 'TEAM-01' });
  });
});
