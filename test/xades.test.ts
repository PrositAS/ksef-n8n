import crypto from 'crypto';
import { execSync } from 'child_process';
import { signAuthRequest } from '../src/lib/xades';
import { DOMParser } from '@xmldom/xmldom';

// Generate test RSA key pair + self-signed X.509 certificate
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

const certPem = execSync(
  'openssl req -new -x509 -key /dev/stdin -days 1 -subj "/CN=Test/O=TestOrg/C=PL" 2>/dev/null',
  { input: privPem },
).toString('utf-8');

const CHALLENGE = '20260306-CR-A1B2C3D4E5-F6A7B8C9D0-01';
const NIP = '1177422689';
const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const AUTH_NS = 'http://ksef.mf.gov.pl/auth/token/2.0';

describe('signAuthRequest', () => {
  let signedXml: string;
  let doc: Document;

  beforeAll(() => {
    signedXml = signAuthRequest(CHALLENGE, NIP, privPem, certPem);
    doc = new DOMParser().parseFromString(signedXml, 'text/xml');
  });

  it('should return valid XML', () => {
    expect(signedXml).toBeTruthy();
    expect(doc.documentElement).toBeTruthy();
  });

  it('should contain the challenge value', () => {
    const challengeNodes = doc.getElementsByTagName('Challenge');
    expect(challengeNodes.length).toBe(1);
    expect(challengeNodes[0].textContent).toBe(CHALLENGE);
  });

  it('should contain the NIP in ContextIdentifier', () => {
    const nipNodes = doc.getElementsByTagName('Nip');
    expect(nipNodes.length).toBe(1);
    expect(nipNodes[0].textContent).toBe(NIP);
  });

  it('should contain SubjectIdentifierType set to certificateSubject', () => {
    const typeNodes = doc.getElementsByTagName('SubjectIdentifierType');
    expect(typeNodes.length).toBe(1);
    expect(typeNodes[0].textContent).toBe('certificateSubject');
  });

  it('should have the AuthTokenRequest root element with correct namespace', () => {
    expect(doc.documentElement.localName).toBe('AuthTokenRequest');
    expect(doc.documentElement.namespaceURI).toBe(AUTH_NS);
  });

  it('should contain a ds:Signature element', () => {
    const sigs = doc.getElementsByTagNameNS(DSIG_NS, 'Signature');
    expect(sigs.length).toBe(1);
  });

  it('should contain a ds:SignatureValue element', () => {
    const sigValues = doc.getElementsByTagNameNS(DSIG_NS, 'SignatureValue');
    expect(sigValues.length).toBe(1);
    expect(sigValues[0].textContent!.trim().length).toBeGreaterThan(0);
  });

  it('should contain a ds:Reference with enveloped-signature transform', () => {
    const refs = doc.getElementsByTagNameNS(DSIG_NS, 'Reference');
    expect(refs.length).toBeGreaterThanOrEqual(1);

    const transforms = doc.getElementsByTagNameNS(DSIG_NS, 'Transform');
    const algorithms = Array.from({ length: transforms.length }, (_, i) =>
      transforms[i].getAttribute('Algorithm'),
    );
    expect(algorithms).toContain(
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
    );
  });

  it('should contain X509Certificate in KeyInfo', () => {
    const x509Certs = doc.getElementsByTagNameNS(DSIG_NS, 'X509Certificate');
    expect(x509Certs.length).toBe(1);
    const certContent = x509Certs[0].textContent!.trim();
    expect(certContent.length).toBeGreaterThan(100);
  });

  it('should contain XAdES QualifyingProperties', () => {
    const qp = doc.getElementsByTagNameNS(XADES_NS, 'QualifyingProperties');
    expect(qp.length).toBe(1);
  });

  it('should contain XAdES SigningTime', () => {
    const st = doc.getElementsByTagNameNS(XADES_NS, 'SigningTime');
    expect(st.length).toBe(1);
    // Should be a valid ISO date
    const date = new Date(st[0].textContent!);
    expect(date.getTime()).not.toBeNaN();
  });

  it('should contain XAdES SigningCertificate with digest', () => {
    const sc = doc.getElementsByTagNameNS(XADES_NS, 'SigningCertificate');
    expect(sc.length).toBe(1);

    const certDigest = doc.getElementsByTagNameNS(XADES_NS, 'CertDigest');
    expect(certDigest.length).toBe(1);

    const digestValues = certDigest[0].getElementsByTagNameNS(
      DSIG_NS,
      'DigestValue',
    );
    expect(digestValues.length).toBe(1);
    expect(digestValues[0].textContent!.trim().length).toBeGreaterThan(0);
  });

  it('should contain IssuerSerial with issuer name and serial number', () => {
    const issuerSerial = doc.getElementsByTagNameNS(XADES_NS, 'IssuerSerial');
    expect(issuerSerial.length).toBe(1);

    const issuerName = issuerSerial[0].getElementsByTagNameNS(
      DSIG_NS,
      'X509IssuerName',
    );
    expect(issuerName.length).toBe(1);
    expect(issuerName[0].textContent).toContain('CN=Test');

    const serialNumber = issuerSerial[0].getElementsByTagNameNS(
      DSIG_NS,
      'X509SerialNumber',
    );
    expect(serialNumber.length).toBe(1);
    expect(serialNumber[0].textContent!.trim().length).toBeGreaterThan(0);
  });

  it('should use SHA-256 digest algorithm', () => {
    const digestMethods = doc.getElementsByTagNameNS(DSIG_NS, 'DigestMethod');
    expect(digestMethods.length).toBeGreaterThan(0);

    const algorithms = Array.from({ length: digestMethods.length }, (_, i) =>
      digestMethods[i].getAttribute('Algorithm'),
    );
    expect(algorithms).toContain('http://www.w3.org/2001/04/xmlenc#sha256');
  });

  it('should use RSA-SHA256 signature algorithm', () => {
    const sigMethods = doc.getElementsByTagNameNS(DSIG_NS, 'SignatureMethod');
    expect(sigMethods.length).toBe(1);
    expect(sigMethods[0].getAttribute('Algorithm')).toBe(
      'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    );
  });

  it('should produce different signatures for different challenges', () => {
    const xml1 = signAuthRequest('challenge-1', NIP, privPem, certPem);
    const xml2 = signAuthRequest('challenge-2', NIP, privPem, certPem);
    expect(xml1).not.toBe(xml2);
  });
});

describe('signAuthRequest — passphrase-protected key', () => {
  it('should sign successfully with a passphrase-protected private key', () => {
    const passphrase = 'test-passphrase-123';
    const encryptedPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase,
    }) as string;

    const result = signAuthRequest(
      CHALLENGE,
      NIP,
      encryptedPem,
      certPem,
      passphrase,
    );

    expect(result).toBeTruthy();
    const doc = new DOMParser().parseFromString(result, 'text/xml');
    const sigs = doc.getElementsByTagNameNS(DSIG_NS, 'Signature');
    expect(sigs.length).toBe(1);
  });
});
