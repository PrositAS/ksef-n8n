// --- Auth types ---

export interface PublicKeyCertificate {
  certificate: string;
  validFrom: string;
  validTo: string;
  usage: ('KsefTokenEncryption' | 'SymmetricKeyEncryption')[];
}

export interface ChallengeResponse {
  challenge: string;
  timestamp: string;
  timestampMs: number;
  clientIp: string;
}

export interface TokenInfo {
  token: string;
  validUntil: string;
}

export interface AuthInitResponse {
  referenceNumber: string;
  authenticationToken: TokenInfo;
}

export interface StatusInfo {
  code: number;
  description: string;
  details?: string[];
}

export interface AuthStatusResponse {
  startDate: string;
  authenticationMethod: string;
  status: StatusInfo;
  isTokenRedeemed?: boolean;
}

export interface AuthTokensResponse {
  accessToken: TokenInfo;
  refreshToken: TokenInfo;
}

// OpenAPI spec confirms: refresh only returns new accessToken, NOT refreshToken
export interface AuthTokenRefreshResponse {
  accessToken: TokenInfo;
}

// --- Session cache ---

export interface KsefSession {
  accessToken: string;
  accessTokenExpiry: string;
  refreshToken: string;
  refreshTokenExpiry: string;
  baseUrl: string;
}

// --- Invoice types ---

export interface InvoiceMetadataSeller {
  nip: string;
  name?: string;
}

export interface InvoiceMetadataBuyerIdentifier {
  type: 'Nip' | 'VatUe' | 'Other' | 'None';
  value?: string;
}

export interface InvoiceMetadataBuyer {
  identifier: InvoiceMetadataBuyerIdentifier;
  name?: string;
}

export interface FormCode {
  systemCode: string;
  schemaVersion: string;
  value: string;
}

export interface InvoiceMetadata {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  seller: InvoiceMetadataSeller;
  buyer: InvoiceMetadataBuyer;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoicingMode: string;
  invoiceType: string;
  formCode: FormCode;
  isSelfInvoicing: boolean;
  hasAttachment: boolean;
  invoiceHash: string;
}

export interface QueryMetadataResponse {
  hasMore: boolean;
  isTruncated: boolean;
  permanentStorageHwmDate?: string;
  invoices: InvoiceMetadata[];
}

export interface FlattenedInvoice {
  ksefNumber: string;
  invoiceNumber: string;
  issueDate: string;
  invoicingDate: string;
  acquisitionDate: string;
  permanentStorageDate: string;
  sellerNip: string;
  sellerName: string;
  buyerIdentifierType: string;
  buyerNip: string;
  buyerName: string;
  netAmount: number;
  grossAmount: number;
  vatAmount: number;
  currency: string;
  invoiceType: string;
  formCode: string;
  invoicingMode: string;
  isSelfInvoicing: boolean;
  hasAttachment: boolean;
  invoiceHash: string;
}

// --- Error types ---

export interface KsefExceptionDetail {
  exceptionCode: number;
  exceptionDescription: string;
  details?: string[];
}

export interface KsefExceptionResponse {
  exception: {
    exceptionDetailList: KsefExceptionDetail[];
    referenceNumber?: string;
    serviceCode?: string;
    serviceCtx?: string;
    serviceName?: string;
    timestamp?: string;
  };
}

export interface KsefForbiddenResponse {
  title: string;
  status: number;
  detail: string;
  reasonCode: string;
  security?: {
    requiredAnyOfPermissions?: string[];
    presentPermissions?: string[];
  };
}
