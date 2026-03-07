import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { queryInvoices } from './operations/queryInvoices';
import { downloadInvoice } from './operations/downloadInvoice';
import { startSession } from './operations/startSession';
import { checkStatus } from './operations/checkStatus';
import { closeSession } from '../../lib/auth';

export class Ksef implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'KSeF',
    name: 'ksef',
    icon: 'file:ksef.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{ $parameter["resource"] + ": " + $parameter["operation"] }}',
    description:
      "Interact with Poland's KSeF (Krajowy System e-Faktur) e-invoicing system",
    defaults: {
      name: 'KSeF',
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'ksefApi',
        required: true,
      },
    ],
    properties: [
      // Resource
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Invoice', value: 'invoice' },
          { name: 'Session', value: 'session' },
        ],
        default: 'invoice',
      },

      // --- Invoice operations ---
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['invoice'] } },
        options: [
          {
            name: 'Query Metadata',
            value: 'queryMetadata',
            description: 'Search for invoices by date range and filters',
            action: 'Query invoice metadata',
          },
          {
            name: 'Download',
            value: 'download',
            description: 'Download invoice XML by KSeF number',
            action: 'Download invoice XML',
          },
        ],
        default: 'queryMetadata',
      },

      // --- Session operations ---
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['session'] } },
        options: [
          {
            name: 'Start',
            value: 'start',
            description: 'Authenticate and start a KSeF session',
            action: 'Start KSeF session',
          },
          {
            name: 'Check Status',
            value: 'checkStatus',
            description: 'List active sessions and their status',
            action: 'Check active sessions',
          },
        ],
        default: 'start',
      },

      // --- Query Metadata parameters ---

      {
        displayName: 'Subject Type',
        name: 'subjectType',
        type: 'options',
        displayOptions: { show: { operation: ['queryMetadata'] } },
        options: [
          { name: 'Buyer (Invoices TO You)', value: 'Subject2' },
          { name: 'Seller (Invoices FROM You)', value: 'Subject1' },
          { name: 'Third Party', value: 'Subject3' },
          { name: 'Authorized Subject', value: 'SubjectAuthorized' },
        ],
        default: 'Subject2',
        description: 'Your role on the invoice',
      },
      {
        displayName: 'Date From',
        name: 'dateFrom',
        type: 'dateTime',
        displayOptions: { show: { operation: ['queryMetadata'] } },
        default: '',
        required: true,
        description: 'Start of date range (ISO 8601). Max range is 3 months.',
      },
      {
        displayName: 'Date To',
        name: 'dateTo',
        type: 'dateTime',
        displayOptions: { show: { operation: ['queryMetadata'] } },
        default: '',
        description:
          'End of date range. If empty, defaults to the current time.',
      },
      {
        displayName: 'Date Type',
        name: 'dateType',
        type: 'options',
        displayOptions: { show: { operation: ['queryMetadata'] } },
        options: [
          { name: 'Permanent Storage Date', value: 'PermanentStorage' },
          { name: 'Issue Date', value: 'Issue' },
          { name: 'Invoicing Date (KSeF Receipt)', value: 'Invoicing' },
        ],
        default: 'PermanentStorage',
        description: 'Which date field to filter by',
      },
      {
        displayName: 'Return All',
        name: 'returnAll',
        type: 'boolean',
        displayOptions: { show: { operation: ['queryMetadata'] } },
        default: true,
        description: 'Whether to return all results or limit the count',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        displayOptions: {
          show: { operation: ['queryMetadata'], returnAll: [false] },
        },
        default: 50,
        typeOptions: { minValue: 1, maxValue: 10000 },
        description: 'Max number of invoices to return',
      },

      // --- Download parameters ---

      {
        displayName: 'KSeF Number',
        name: 'ksefNumber',
        type: 'string',
        displayOptions: { show: { operation: ['download'] } },
        default: '',
        required: true,
        description:
          'KSeF invoice number (e.g., 1177422689-20260215-1A2B3C-4D5E6F-01)',
        placeholder: '={{ $json.ksefNumber }}',
      },
      {
        displayName: 'Parse XML',
        name: 'parseXml',
        type: 'boolean',
        displayOptions: { show: { operation: ['download'] } },
        default: false,
        description:
          'Whether to parse invoice XML into structured JSON (returned alongside raw XML)',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    try {
      for (let i = 0; i < items.length; i++) {
        try {
          if (resource === 'invoice') {
            if (operation === 'queryMetadata') {
              const results = await queryInvoices(this, i);
              returnData.push(...results);
            } else if (operation === 'download') {
              const results = await downloadInvoice(this, i);
              returnData.push(...results);
            }
          } else if (resource === 'session') {
            if (operation === 'start') {
              const results = await startSession(this, i);
              returnData.push(...results);
            } else if (operation === 'checkStatus') {
              const results = await checkStatus(this, i);
              returnData.push(...results);
            }
          }
        } catch (error) {
          if (this.continueOnFail()) {
            returnData.push({
              json: { error: (error as Error).message },
              pairedItem: { item: i },
            });
            continue;
          }
          throw error;
        }
      }
    } finally {
      try {
        const credentials = await this.getCredentials('ksefApi');
        await closeSession(this, credentials.environment as string);
      } catch {
        // Best effort cleanup
      }
    }

    return [returnData];
  }
}
