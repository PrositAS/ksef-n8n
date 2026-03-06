import { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { getAccessToken } from '../../../lib/auth';
import { handleKsefError } from '../../../lib/errors';

export async function downloadInvoice(
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const credentials = await context.getCredentials('ksefApi');
  const baseUrl = credentials.environment as string;
  const nip = credentials.nip as string;
  const ksefToken = credentials.token as string;
  const ksefNumber = context.getNodeParameter(
    'ksefNumber',
    itemIndex,
  ) as string;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(context, baseUrl, nip, ksefToken);
  } catch (error) {
    handleKsefError(context, error);
  }

  let xml: string;
  try {
    xml = (await context.helpers.httpRequest({
      method: 'GET',
      url: `${baseUrl}/invoices/ksef/${ksefNumber}`,
      headers: { Authorization: `Bearer ${accessToken}` },
      json: false,
      returnFullResponse: false,
    })) as string;
  } catch (error) {
    handleKsefError(context, error);
  }

  return [
    {
      json: { xml, ksefNumber },
    },
  ];
}
