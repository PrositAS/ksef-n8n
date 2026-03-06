import { IExecuteFunctions, NodeApiError, JsonObject } from 'n8n-workflow';
import type { KsefExceptionResponse, KsefForbiddenResponse, StatusInfo } from './types';

const REASON_SUGGESTIONS: Record<string, string> = {
  'missing-permissions':
    'Check that your KSeF token has the required permissions (InvoiceRead) in MCU.',
  'ip-not-allowed':
    'Your IP address is not allowed. Check IP restrictions in your KSeF session settings.',
  'insufficient-resource-access': 'You do not have access to this resource.',
  'auth-method-not-allowed':
    'This operation is not available for token-based authentication.',
  'security-service-blocked':
    'Your request was blocked by KSeF security. Contact the Ministry of Finance.',
};

const AUTH_STATUS_MESSAGES: Record<number, string> = {
  415: 'No permissions assigned to this token. Check your KSeF token permissions in MCU.',
  425: 'Session has been revoked.',
  450: 'Token authentication failed. Check that your KSeF token is valid and not expired.',
  460: 'Certificate error. This may indicate a KSeF infrastructure issue.',
  470: 'Authentication blocked: credentials associated with a deceased person.',
  480: 'Security incident detected. Contact the Ministry of Finance.',
  500: 'Unknown KSeF server error. Try again later.',
  550: 'Operation cancelled by the system. Try again.',
};

export function translateAuthStatus(status: StatusInfo): string {
  const base = AUTH_STATUS_MESSAGES[status.code];
  if (base) {
    const details = status.details?.join(', ');
    return details ? `${base} (${details})` : base;
  }
  return `Authentication failed: ${status.description}`;
}

export function handleKsefError(context: IExecuteFunctions, error: unknown): never {
  const err = error as Record<string, unknown>;
  const response = err.response as Record<string, unknown> | undefined;
  const body = response?.body as Record<string, unknown> | undefined;
  const httpCode = err.httpCode as number | string | undefined;

  // 403 problem+json
  if (String(httpCode) === '403' && body?.reasonCode) {
    const forbidden = body as unknown as KsefForbiddenResponse;
    throw new NodeApiError(context.getNode(), err as JsonObject, {
      message: forbidden.detail || 'Forbidden',
      description: REASON_SUGGESTIONS[forbidden.reasonCode] || forbidden.detail,
    });
  }

  // 400 exception
  if (body?.exception) {
    const exc = body as unknown as KsefExceptionResponse;
    const detail = exc.exception.exceptionDetailList?.[0];
    if (detail) {
      throw new NodeApiError(context.getNode(), err as JsonObject, {
        message: `KSeF Error ${detail.exceptionCode}: ${detail.exceptionDescription}`,
        description: detail.details?.join(', '),
      });
    }
  }

  // 429 rate limit
  if (String(httpCode) === '429') {
    const headers = response?.headers as Record<string, string> | undefined;
    const retryAfter = headers?.['retry-after'] || 'unknown';
    throw new NodeApiError(context.getNode(), err as JsonObject, {
      message: 'KSeF rate limit exceeded',
      description: `Too many requests. Retry after ${retryAfter} seconds.`,
    });
  }

  // 401
  if (String(httpCode) === '401') {
    throw new NodeApiError(context.getNode(), err as JsonObject, {
      message: 'KSeF authentication failed',
      description:
        'Your session is invalid or expired. The node will re-authenticate on the next run.',
    });
  }

  // Generic
  throw new NodeApiError(context.getNode(), (err as JsonObject) || {});
}
