import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getAccessToken } from '../../../lib/auth';
import { handleKsefError } from '../../../lib/errors';
import type { SessionListResponse } from '../../../lib/types';

export async function checkStatus(
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const credentials = await context.getCredentials('ksefApi');
  const baseUrl = credentials.environment as string;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(context, baseUrl, credentials as IDataObject);
  } catch (error) {
    handleKsefError(context, error);
  }

  try {
    const response = (await context.helpers.httpRequest({
      method: 'GET',
      url: `${baseUrl}/auth/sessions`,
      headers: { Authorization: `Bearer ${accessToken}` },
      qs: { pageSize: 100 },
      json: true,
    })) as SessionListResponse;

    return response.items.map((item) => ({
      json: {
        referenceNumber: item.referenceNumber,
        isCurrent: item.isCurrent,
        startDate: item.startDate,
        authenticationMethod: item.authenticationMethod,
        authMethodCategory: item.authenticationMethodInfo?.category || '',
        authMethodName: item.authenticationMethodInfo?.displayName || '',
        statusCode: item.status.code,
        statusDescription: item.status.description,
        isTokenRedeemed: item.isTokenRedeemed,
        refreshTokenValidUntil: item.refreshTokenValidUntil || '',
      } as unknown as IDataObject,
    }));
  } catch (error) {
    handleKsefError(context, error);
  }
}
