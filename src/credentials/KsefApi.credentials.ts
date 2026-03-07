import {
  ICredentialType,
  INodeProperties,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class KsefApi implements ICredentialType {
  name = 'ksefApi';
  displayName = 'KSeF API';
  documentationUrl = 'https://github.com/PrositAS/ksef-n8n';

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.environment}}',
      url: '/auth/challenge',
      method: 'POST',
    },
  };

  properties: INodeProperties[] = [
    {
      displayName: 'Environment',
      name: 'environment',
      type: 'options',
      options: [
        { name: 'Production', value: 'https://api.ksef.mf.gov.pl/v2' },
        { name: 'Test', value: 'https://api-test.ksef.mf.gov.pl/v2' },
        { name: 'Demo', value: 'https://api-demo.ksef.mf.gov.pl/v2' },
      ],
      default: 'https://api-test.ksef.mf.gov.pl/v2',
      description: 'KSeF API environment',
    },
    {
      displayName: 'NIP',
      name: 'nip',
      type: 'string',
      default: '',
      required: true,
      description: 'Polish Tax Identification Number (10 digits, no prefix)',
      placeholder: '1177422689',
    },
    {
      displayName: 'Auth Type',
      name: 'authType',
      type: 'options',
      options: [
        { name: 'Token', value: 'token' },
        {
          name: 'Certificate (Qualified Seal/Signature)',
          value: 'certificate',
        },
      ],
      default: 'token',
      description: 'Authentication method',
    },

    // --- Token auth fields ---

    {
      displayName: 'KSeF Token',
      name: 'token',
      type: 'string',
      typeOptions: { password: true },
      displayOptions: { show: { authType: ['token'] } },
      default: '',
      required: true,
      description: 'Authorization token generated in MCU (ksef.podatki.gov.pl)',
    },

    // --- Certificate auth fields ---

    {
      displayName: 'Private Key (PEM)',
      name: 'privateKey',
      type: 'string',
      typeOptions: { rows: 10 },
      displayOptions: { show: { authType: ['certificate'] } },
      default: '',
      required: true,
      placeholder:
        '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
      description: 'Private key in PEM format (PKCS#8 or traditional)',
    },
    {
      displayName: 'Certificate (PEM)',
      name: 'certificate',
      type: 'string',
      typeOptions: { rows: 10 },
      displayOptions: { show: { authType: ['certificate'] } },
      default: '',
      required: true,
      placeholder:
        '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
      description: 'Public certificate in PEM format (X.509)',
    },
    {
      displayName: 'Private Key Passphrase',
      name: 'passphrase',
      type: 'string',
      typeOptions: { password: true },
      displayOptions: { show: { authType: ['certificate'] } },
      default: '',
      description:
        'Passphrase for encrypted private key (leave empty if not encrypted)',
    },
  ];
}
