import crypto from 'crypto';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const AUTH_NS = 'http://ksef.mf.gov.pl/auth/token/2.0';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const C14N_ALGO = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const SIG_ALGO = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const DIGEST_ALGO = 'http://www.w3.org/2001/04/xmlenc#sha256';

function stripPemHeaders(pem: string): string {
  return pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
}

function buildUnsignedXml(challenge: string, nip: string): string {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<AuthTokenRequest xmlns="${AUTH_NS}">`,
    `  <Challenge>${challenge}</Challenge>`,
    '  <ContextIdentifier>',
    `    <Nip>${nip}</Nip>`,
    '  </ContextIdentifier>',
    '  <SubjectIdentifierType>certificateSubject</SubjectIdentifierType>',
    '</AuthTokenRequest>',
  ].join('\n');
}

function buildXadesObject(
  signatureId: string,
  certDer: Buffer,
  issuerName: string,
  serialNumber: string,
): string {
  const certDigest = crypto.createHash('sha256').update(certDer).digest('base64');
  const signingTime = new Date().toISOString();
  const signedPropsId = `${signatureId}-SignedProperties`;

  return [
    `<ds:Object xmlns:ds="${DSIG_NS}">`,
    `  <xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureId}">`,
    `    <xades:SignedProperties Id="${signedPropsId}">`,
    '      <xades:SignedSignatureProperties>',
    `        <xades:SigningTime>${signingTime}</xades:SigningTime>`,
    '        <xades:SigningCertificate>',
    '          <xades:Cert>',
    '            <xades:CertDigest>',
    `              <ds:DigestMethod Algorithm="${DIGEST_ALGO}"/>`,
    `              <ds:DigestValue>${certDigest}</ds:DigestValue>`,
    '            </xades:CertDigest>',
    '            <xades:IssuerSerial>',
    `              <ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`,
    `              <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>`,
    '            </xades:IssuerSerial>',
    '          </xades:Cert>',
    '        </xades:SigningCertificate>',
    '      </xades:SignedSignatureProperties>',
    '    </xades:SignedProperties>',
    '  </xades:QualifyingProperties>',
    '</ds:Object>',
  ].join('\n');
}

function extractCertInfo(certPem: string): {
  certDer: Buffer;
  issuerName: string;
  serialNumber: string;
} {
  const certDer = Buffer.from(stripPemHeaders(certPem), 'base64');
  const x509 = new crypto.X509Certificate(certPem);
  return {
    certDer,
    issuerName: x509.issuer.split('\n').reverse().join(', '),
    serialNumber: BigInt(`0x${x509.serialNumber}`).toString(),
  };
}

export function signAuthRequest(
  challenge: string,
  nip: string,
  privateKeyPem: string,
  certificatePem: string,
  passphrase?: string,
): string {
  const unsignedXml = buildUnsignedXml(challenge, nip);
  const signatureId = `Signature-${Date.now()}`;
  const certBase64 = stripPemHeaders(certificatePem);
  const { certDer, issuerName, serialNumber } = extractCertInfo(certificatePem);

  const resolvedKey = passphrase
    ? crypto.createPrivateKey({ key: privateKeyPem, passphrase, format: 'pem' })
        .export({ type: 'pkcs8', format: 'pem' }) as string
    : privateKeyPem;

  const sig = new SignedXml({
    privateKey: resolvedKey,
    publicCert: certificatePem,
    canonicalizationAlgorithm: C14N_ALGO,
    signatureAlgorithm: SIG_ALGO,
    getKeyInfoContent(): string {
      return `<ds:X509Data xmlns:ds="${DSIG_NS}"><ds:X509Certificate>${certBase64}</ds:X509Certificate></ds:X509Data>`;
    },
  });

  sig.addReference({
    xpath: '/*',
    digestAlgorithm: DIGEST_ALGO,
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      C14N_ALGO,
    ],
  });

  sig.computeSignature(unsignedXml, {
    location: { reference: '/*', action: 'append' },
    attrs: { Id: signatureId },
  });

  // Parse the signed XML and inject XAdES QualifyingProperties into the Signature
  const signedDoc = new DOMParser().parseFromString(
    sig.getSignedXml(),
    'text/xml',
  );
  const signatureNode = signedDoc.getElementsByTagNameNS(DSIG_NS, 'Signature')[0];

  if (signatureNode) {
    const xadesXml = buildXadesObject(
      signatureId,
      certDer,
      issuerName,
      serialNumber,
    );
    const xadesDoc = new DOMParser().parseFromString(xadesXml, 'text/xml');
    const objectNode = xadesDoc.documentElement;
    signatureNode.appendChild(signedDoc.importNode(objectNode, true));
  }

  return new XMLSerializer().serializeToString(signedDoc);
}
