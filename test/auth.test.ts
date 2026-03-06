import { getAccessToken, closeSession } from '../src/lib/auth';

// Mock crypto module to avoid real RSA operations in auth tests
jest.mock('../src/lib/crypto', () => ({
  encryptToken: jest.fn(() => 'mock-encrypted-token'),
}));

function createMockContext(staticData: Record<string, unknown> = {}) {
  return {
    helpers: {
      httpRequest: jest.fn(),
    },
    getWorkflowStaticData: jest.fn(() => staticData),
    getNode: jest.fn(() => ({ name: 'KSeF', type: 'ksef' })),
    getCredentials: jest.fn(),
  };
}

const BASE_URL = 'https://api-test.ksef.mf.gov.pl/v2';
const NIP = '6423189108';
const TOKEN = 'test-ksef-token';

function setupFullAuthMocks(httpRequest: jest.Mock) {
  // Step 1: certificates
  httpRequest.mockResolvedValueOnce([
    {
      certificate: 'MIIB-test-cert-base64',
      validFrom: '2025-01-01T00:00:00Z',
      validTo: '2027-01-01T00:00:00Z',
      usage: ['KsefTokenEncryption'],
    },
  ]);

  // Step 2: challenge
  httpRequest.mockResolvedValueOnce({
    challenge: '20260306-CR-test-challenge',
    timestamp: '2026-03-06T12:00:00Z',
    timestampMs: 1772801990478,
    clientIp: '127.0.0.1',
  });

  // Step 4: init token auth
  httpRequest.mockResolvedValueOnce({
    referenceNumber: '20260306-AU-test-ref',
    authenticationToken: {
      token: 'temp-jwt-token',
      validUntil: '2026-03-06T13:00:00Z',
    },
  });

  // Step 5: poll status (immediately complete)
  httpRequest.mockResolvedValueOnce({
    status: { code: 200, description: 'Success' },
    authenticationMethod: 'Token',
    startDate: '2026-03-06T12:00:00Z',
  });

  // Step 6: redeem
  httpRequest.mockResolvedValueOnce({
    accessToken: {
      token: 'real-access-token',
      validUntil: new Date(Date.now() + 3600_000).toISOString(),
    },
    refreshToken: {
      token: 'real-refresh-token',
      validUntil: new Date(Date.now() + 7200_000).toISOString(),
    },
  });
}

describe('getAccessToken', () => {
  it('should execute all 6 auth steps in order', async () => {
    const staticData = {};
    const ctx = createMockContext(staticData);
    setupFullAuthMocks(ctx.helpers.httpRequest);

    const token = await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    expect(token).toBe('real-access-token');
    expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(5);

    const calls = ctx.helpers.httpRequest.mock.calls;
    expect(calls[0][0].url).toContain('/security/public-key-certificates');
    expect(calls[1][0].url).toContain('/auth/challenge');
    expect(calls[2][0].url).toContain('/auth/ksef-token');
    expect(calls[3][0].url).toContain('/auth/20260306-AU-test-ref');
    expect(calls[4][0].url).toContain('/auth/token/redeem');
  });

  it('should cache the session in static data', async () => {
    const staticData: Record<string, unknown> = {};
    const ctx = createMockContext(staticData);
    setupFullAuthMocks(ctx.helpers.httpRequest);

    await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    const session = staticData.ksefSession as any;
    expect(session).toBeDefined();
    expect(session.accessToken).toBe('real-access-token');
    expect(session.refreshToken).toBe('real-refresh-token');
    expect(session.baseUrl).toBe(BASE_URL);
  });

  it('should return cached token when still valid', async () => {
    const futureDate = new Date(Date.now() + 300_000).toISOString();
    const staticData = {
      ksefSession: {
        accessToken: 'cached-access-token',
        accessTokenExpiry: futureDate,
        refreshToken: 'cached-refresh-token',
        refreshTokenExpiry: futureDate,
        baseUrl: BASE_URL,
      },
    };
    const ctx = createMockContext(staticData);

    const token = await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    expect(token).toBe('cached-access-token');
    expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
  });

  it('should refresh when access token expired but refresh token valid', async () => {
    const expiredDate = new Date(Date.now() - 1000).toISOString();
    const futureDate = new Date(Date.now() + 300_000).toISOString();
    const staticData = {
      ksefSession: {
        accessToken: 'expired-access-token',
        accessTokenExpiry: expiredDate,
        refreshToken: 'valid-refresh-token',
        refreshTokenExpiry: futureDate,
        baseUrl: BASE_URL,
      },
    };
    const ctx = createMockContext(staticData);

    // Mock refresh response
    ctx.helpers.httpRequest.mockResolvedValueOnce({
      accessToken: {
        token: 'refreshed-access-token',
        validUntil: new Date(Date.now() + 3600_000).toISOString(),
      },
    });

    const token = await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    expect(token).toBe('refreshed-access-token');
    expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(1);
    expect(ctx.helpers.httpRequest.mock.calls[0][0].url).toContain(
      '/auth/token/refresh',
    );
  });

  it('should ignore cached session for different baseUrl', async () => {
    const futureDate = new Date(Date.now() + 300_000).toISOString();
    const staticData = {
      ksefSession: {
        accessToken: 'cached-token',
        accessTokenExpiry: futureDate,
        refreshToken: 'cached-refresh',
        refreshTokenExpiry: futureDate,
        baseUrl: 'https://api.ksef.mf.gov.pl/v2', // Production, not test
      },
    };
    const ctx = createMockContext(staticData);
    setupFullAuthMocks(ctx.helpers.httpRequest);

    const token = await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    // Should do full auth, not use cached production token
    expect(token).toBe('real-access-token');
    expect(ctx.helpers.httpRequest).toHaveBeenCalledTimes(5);
  });

  it('should throw on auth failure status code', async () => {
    const ctx = createMockContext();
    const httpRequest = ctx.helpers.httpRequest;

    // Steps 1-4
    httpRequest.mockResolvedValueOnce([
      { certificate: 'cert', usage: ['KsefTokenEncryption'] },
    ]);
    httpRequest.mockResolvedValueOnce({
      challenge: 'ch',
      timestampMs: 123,
    });
    httpRequest.mockResolvedValueOnce({
      referenceNumber: 'ref',
      authenticationToken: { token: 'tmp', validUntil: '2026-01-01' },
    });

    // Step 5: error status
    httpRequest.mockResolvedValueOnce({
      status: { code: 450, description: 'Token invalid' },
    });

    await expect(
      getAccessToken(ctx as any, BASE_URL, NIP, TOKEN),
    ).rejects.toThrow(/authentication failed/i);
  });

  it('should poll multiple times before success', async () => {
    const ctx = createMockContext();
    const httpRequest = ctx.helpers.httpRequest;

    // Steps 1-4
    httpRequest.mockResolvedValueOnce([
      { certificate: 'cert', usage: ['KsefTokenEncryption'] },
    ]);
    httpRequest.mockResolvedValueOnce({
      challenge: 'ch',
      timestampMs: 123,
    });
    httpRequest.mockResolvedValueOnce({
      referenceNumber: 'ref',
      authenticationToken: { token: 'tmp', validUntil: '2026-01-01' },
    });

    // Step 5: poll 3 times (100, 100, 200)
    httpRequest.mockResolvedValueOnce({
      status: { code: 100, description: 'In progress' },
    });
    httpRequest.mockResolvedValueOnce({
      status: { code: 100, description: 'In progress' },
    });
    httpRequest.mockResolvedValueOnce({
      status: { code: 200, description: 'Success' },
    });

    // Step 6: redeem
    httpRequest.mockResolvedValueOnce({
      accessToken: {
        token: 'access',
        validUntil: new Date(Date.now() + 3600_000).toISOString(),
      },
      refreshToken: {
        token: 'refresh',
        validUntil: new Date(Date.now() + 7200_000).toISOString(),
      },
    });

    const token = await getAccessToken(ctx as any, BASE_URL, NIP, TOKEN);

    expect(token).toBe('access');
    // 1 certs + 1 challenge + 1 init + 3 polls + 1 redeem = 7
    expect(httpRequest).toHaveBeenCalledTimes(7);
  }, 10_000);
});

describe('closeSession', () => {
  it('should call DELETE on /auth/sessions/current', async () => {
    const staticData = {
      ksefSession: {
        accessToken: 'access-token',
        accessTokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
        refreshToken: 'refresh-token',
        refreshTokenExpiry: new Date(Date.now() + 7200_000).toISOString(),
        baseUrl: BASE_URL,
      },
    };
    const ctx = createMockContext(staticData);
    ctx.helpers.httpRequest.mockResolvedValueOnce(undefined);

    await closeSession(ctx as any, BASE_URL);

    expect(ctx.helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'DELETE',
        url: `${BASE_URL}/auth/sessions/current`,
      }),
    );
    expect(staticData.ksefSession).toBeUndefined();
  });

  it('should not fail when session does not exist', async () => {
    const ctx = createMockContext();

    await expect(closeSession(ctx as any, BASE_URL)).resolves.not.toThrow();
    expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
  });

  it('should clear cached session even if DELETE fails', async () => {
    const staticData = {
      ksefSession: {
        accessToken: 'token',
        accessTokenExpiry: '',
        refreshToken: '',
        refreshTokenExpiry: '',
        baseUrl: BASE_URL,
      },
    };
    const ctx = createMockContext(staticData);
    ctx.helpers.httpRequest.mockRejectedValueOnce(new Error('Network error'));

    await closeSession(ctx as any, BASE_URL);

    expect(staticData.ksefSession).toBeUndefined();
  });
});
