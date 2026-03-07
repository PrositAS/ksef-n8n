import { IExecuteFunctions, INodeExecutionData, IDataObject } from 'n8n-workflow';
import { getAccessToken } from '../../../lib/auth';
import { handleKsefError } from '../../../lib/errors';

export async function startSession(
  context: IExecuteFunctions,
  itemIndex: number,
): Promise<INodeExecutionData[]> {
  const credentials = await context.getCredentials('ksefApi');
  const baseUrl = credentials.environment as string;

  try {
    const accessToken = await getAccessToken(context, baseUrl, credentials as IDataObject);

    const staticData = context.getWorkflowStaticData('global') as Record<
      string,
      unknown
    >;
    const session = staticData.ksefSession as Record<string, unknown> | undefined;

    return [
      {
        json: {
          status: 'authenticated',
          accessTokenExpiry: session?.accessTokenExpiry || '',
          refreshTokenExpiry: session?.refreshTokenExpiry || '',
          authType: (credentials.authType as string) || 'token',
          environment: baseUrl,
        },
      },
    ];
  } catch (error) {
    handleKsefError(context, error);
  }
}
