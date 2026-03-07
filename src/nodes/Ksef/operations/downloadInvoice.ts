import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getAccessToken } from '../../../lib/auth';
import { handleKsefError } from '../../../lib/errors';
import { parseStringPromise } from 'xml2js';

export async function downloadInvoice(
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const credentials = await context.getCredentials('ksefApi');
  const baseUrl = credentials.environment as string;
  const ksefNumber = context.getNodeParameter(
    'ksefNumber',
    itemIndex,
  ) as string;
  const parseXml = context.getNodeParameter(
    'parseXml',
    itemIndex,
    false,
  ) as boolean;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(context, baseUrl, credentials as IDataObject);
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

  const result: IDataObject = { ksefNumber, xml };

  if (parseXml) {
    try {
      const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [(name: string) => name.replace(/^.*:/, '')],
      });
      result.parsed = parsed as IDataObject;
    } catch {
      result.parseError = 'Failed to parse invoice XML';
    }
  }

  return [{ json: result }];
}
