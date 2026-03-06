import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class KsefApi implements ICredentialType {
  name = 'ksefApi';
  displayName = 'KSeF API';
  documentationUrl = 'https://github.com/PrositAS/ksef-n8n';

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
      placeholder: '6423189108',
    },
    {
      displayName: 'KSeF Token',
      name: 'token',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Authorization token generated in MCU (ksef.podatki.gov.pl)',
    },
  ];
}
