import { IExecuteFunctions, IDataObject, NodeApiError } from 'n8n-workflow';
import { encryptToken } from './crypto';
import { signAuthRequest } from './xades';
import { translateAuthStatus } from './errors';
import type {
  PublicKeyCertificate,
  ChallengeResponse,
  AuthInitResponse,
  AuthStatusResponse,
  AuthTokensResponse,
  AuthTokenRefreshResponse,
  KsefSession,
} from './types';

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 15;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSession(
  staticData: Record<string, unknown>,
  baseUrl: string,
): KsefSession | undefined {
  const session = staticData.ksefSession as KsefSession | undefined;
  if (session && session.baseUrl === baseUrl) return session;
  return undefined;
}

async function refreshAccessToken(
  context: IExecuteFunctions,
  baseUrl: string,
  session: KsefSession,
  staticData: Record<string, unknown>,
): Promise<string> {
  const response = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/token/refresh`,
    headers: { Authorization: `Bearer ${session.refreshToken}` },
    json: true,
  })) as AuthTokenRefreshResponse;

  session.accessToken = response.accessToken.token;
  session.accessTokenExpiry = response.accessToken.validUntil;
  staticData.ksefSession = session;

  return session.accessToken;
}

// --- Shared helpers for poll + redeem (used by both token and certificate flows) ---

async function pollAuthStatus(
  context: IExecuteFunctions,
  baseUrl: string,
  referenceNumber: string,
  tempToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const statusResponse = (await context.helpers.httpRequest({
      method: 'GET',
      url: `${baseUrl}/auth/${referenceNumber}`,
      headers: { Authorization: `Bearer ${tempToken}` },
      json: true,
    })) as AuthStatusResponse;

    if (statusResponse.status.code === 200) {
      return;
    }

    if (statusResponse.status.code === 100) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    throw new NodeApiError(context.getNode(), {} as never, {
      message: `KSeF authentication failed (code ${statusResponse.status.code})`,
      description: translateAuthStatus(statusResponse.status),
    });
  }
}

async function redeemTokens(
  context: IExecuteFunctions,
  baseUrl: string,
  tempToken: string,
  staticData: Record<string, unknown>,
): Promise<string> {
  const tokensResponse = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/token/redeem`,
    headers: { Authorization: `Bearer ${tempToken}` },
    json: true,
  })) as AuthTokensResponse;

  const session: KsefSession = {
    accessToken: tokensResponse.accessToken.token,
    accessTokenExpiry: tokensResponse.accessToken.validUntil,
    refreshToken: tokensResponse.refreshToken.token,
    refreshTokenExpiry: tokensResponse.refreshToken.validUntil,
    baseUrl,
  };
  staticData.ksefSession = session;

  return session.accessToken;
}

// --- Token auth flow ---

async function authenticateWithToken(
  context: IExecuteFunctions,
  baseUrl: string,
  nip: string,
  ksefToken: string,
  staticData: Record<string, unknown>,
): Promise<string> {
  // Step 1: Get public key certificates
  const certificates = (await context.helpers.httpRequest({
    method: 'GET',
    url: `${baseUrl}/security/public-key-certificates`,
    json: true,
  })) as PublicKeyCertificate[];

  const tokenCert = certificates.find((c) =>
    c.usage.includes('KsefTokenEncryption'),
  );
  if (!tokenCert) {
    throw new NodeApiError(context.getNode(), {} as never, {
      message: 'No KsefTokenEncryption certificate found',
      description:
        'The KSeF API did not return a certificate suitable for token encryption.',
    });
  }

  // Step 2: Get challenge
  const challenge = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/challenge`,
    json: true,
  })) as ChallengeResponse;

  // Step 3: Encrypt token (local)
  const encrypted = encryptToken(
    ksefToken,
    challenge.timestampMs,
    tokenCert.certificate,
  );

  // Step 4: Init token auth
  const initResponse = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/ksef-token`,
    body: {
      challenge: challenge.challenge,
      contextIdentifier: { type: 'Nip', value: nip },
      encryptedToken: encrypted,
    },
    json: true,
  })) as AuthInitResponse;

  const tempToken = initResponse.authenticationToken.token;

  // Steps 5-6: Poll + Redeem (shared)
  await pollAuthStatus(context, baseUrl, initResponse.referenceNumber, tempToken);
  return redeemTokens(context, baseUrl, tempToken, staticData);
}

// --- Certificate / XAdES auth flow ---

async function authenticateWithCertificate(
  context: IExecuteFunctions,
  baseUrl: string,
  nip: string,
  privateKeyPem: string,
  certificatePem: string,
  passphrase: string | undefined,
  staticData: Record<string, unknown>,
): Promise<string> {
  // Step 1: Get challenge
  const challenge = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/challenge`,
    json: true,
  })) as ChallengeResponse;

  // Step 2: Build + sign XAdES XML (local)
  const signedXml = signAuthRequest(
    challenge.challenge,
    nip,
    privateKeyPem,
    certificatePem,
    passphrase || undefined,
  );

  // Step 3: Submit signed XML
  const initResponse = (await context.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/auth/xades-signature`,
    body: signedXml,
    headers: { 'Content-Type': 'application/xml' },
    json: true,
  })) as AuthInitResponse;

  const tempToken = initResponse.authenticationToken.token;

  // Steps 4-5: Poll + Redeem (shared)
  await pollAuthStatus(context, baseUrl, initResponse.referenceNumber, tempToken);
  return redeemTokens(context, baseUrl, tempToken, staticData);
}

// --- Main entry point ---

export async function getAccessToken(
  context: IExecuteFunctions,
  baseUrl: string,
  credentials: IDataObject,
): Promise<string> {
  const staticData = context.getWorkflowStaticData('global') as Record<
    string,
    unknown
  >;
  const cached = getSession(staticData, baseUrl);

  // Return cached token if still valid (with buffer)
  if (
    cached &&
    new Date(cached.accessTokenExpiry).getTime() >
      Date.now() + TOKEN_EXPIRY_BUFFER_MS
  ) {
    return cached.accessToken;
  }

  // Try refresh if access expired but refresh is still valid
  if (
    cached &&
    new Date(cached.refreshTokenExpiry).getTime() >
      Date.now() + TOKEN_EXPIRY_BUFFER_MS
  ) {
    try {
      return await refreshAccessToken(context, baseUrl, cached, staticData);
    } catch {
      delete staticData.ksefSession;
    }
  }

  // Full auth flow — dispatch by auth type
  // n8n credential storage may convert pipe characters to newlines in
  // multiline-capable fields. Normalize NIP and token to be safe.
  const nip = (credentials.nip as string).trim();
  const authType = (credentials.authType as string) || 'token';

  if (authType === 'certificate') {
    return authenticateWithCertificate(
      context,
      baseUrl,
      nip,
      credentials.privateKey as string,
      credentials.certificate as string,
      credentials.passphrase as string | undefined,
      staticData,
    );
  }

  // n8n's password field converts "|" to newlines — restore them
  const rawToken = (credentials.token as string) || '';
  const normalizedToken = rawToken.replace(/[\r\n]+/g, '|').trim();

  return authenticateWithToken(
    context,
    baseUrl,
    nip,
    normalizedToken,
    staticData,
  );
}

export async function closeSession(
  context: IExecuteFunctions,
  baseUrl: string,
): Promise<void> {
  const staticData = context.getWorkflowStaticData('global') as Record<
    string,
    unknown
  >;
  const session = getSession(staticData, baseUrl);
  if (!session) return;

  try {
    await context.helpers.httpRequest({
      method: 'DELETE',
      url: `${baseUrl}/auth/sessions/current`,
      headers: { Authorization: `Bearer ${session.accessToken}` },
      ignoreHttpStatusErrors: true,
      json: true,
    });
  } catch {
    // Best effort
  } finally {
    delete staticData.ksefSession;
  }
}
