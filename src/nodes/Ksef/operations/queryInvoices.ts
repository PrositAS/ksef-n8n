import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getAccessToken } from '../../../lib/auth';
import { handleKsefError } from '../../../lib/errors';
import type {
  QueryMetadataResponse,
  InvoiceMetadata,
  FlattenedInvoice,
} from '../../../lib/types';

const PAGE_SIZE = 250;
const PAGE_DELAY_MS = 200;

function flattenInvoice(inv: InvoiceMetadata): FlattenedInvoice {
  return {
    ksefNumber: inv.ksefNumber,
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate,
    invoicingDate: inv.invoicingDate,
    acquisitionDate: inv.acquisitionDate,
    permanentStorageDate: inv.permanentStorageDate,
    sellerNip: inv.seller.nip,
    sellerName: inv.seller.name || '',
    buyerIdentifierType: inv.buyer.identifier.type,
    buyerNip: inv.buyer.identifier.value || '',
    buyerName: inv.buyer.name || '',
    netAmount: inv.netAmount,
    grossAmount: inv.grossAmount,
    vatAmount: inv.vatAmount,
    currency: inv.currency,
    invoiceType: inv.invoiceType,
    formCode: inv.formCode.value,
    invoicingMode: inv.invoicingMode,
    isSelfInvoicing: inv.isSelfInvoicing,
    hasAttachment: inv.hasAttachment,
    invoiceHash: inv.invoiceHash,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queryInvoices(
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const credentials = await context.getCredentials('ksefApi');
  const baseUrl = credentials.environment as string;

  const subjectType = context.getNodeParameter('subjectType', itemIndex) as string;
  const dateFrom = context.getNodeParameter('dateFrom', itemIndex) as string;
  const dateTo = context.getNodeParameter('dateTo', itemIndex, '') as string;
  const dateType = context.getNodeParameter('dateType', itemIndex) as string;
  const returnAll = context.getNodeParameter('returnAll', itemIndex) as boolean;
  const limit = returnAll
    ? 10_000
    : (context.getNodeParameter('limit', itemIndex) as number);

  let accessToken: string;
  try {
    accessToken = await getAccessToken(context, baseUrl, credentials as IDataObject);
  } catch (error) {
    handleKsefError(context, error);
  }

  const allInvoices: InvoiceMetadata[] = [];
  let pageOffset = 0;

  try {
    while (true) {
      const response = (await context.helpers.httpRequest({
        method: 'POST',
        url: `${baseUrl}/invoices/query/metadata`,
        qs: { pageSize: PAGE_SIZE, pageOffset, sortOrder: 'Desc' },
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          subjectType,
          dateRange: {
            dateType,
            from: dateFrom,
            ...(dateTo ? { to: dateTo } : {}),
          },
        },
        json: true,
      })) as QueryMetadataResponse;

      allInvoices.push(...response.invoices);

      if (!returnAll && allInvoices.length >= limit) {
        allInvoices.length = limit;
        break;
      }

      if (!response.hasMore || response.isTruncated) {
        break;
      }

      pageOffset++;
      await sleep(PAGE_DELAY_MS);
    }
  } catch (error) {
    handleKsefError(context, error);
  }

  return allInvoices.map((inv) => ({
    json: flattenInvoice(inv) as unknown as IDataObject,
  }));
}
