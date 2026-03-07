import crypto from 'crypto';

/**
 * Parse Base64-encoded certificate/key data into a KeyObject.
 *
 * KSeF production API returns real X.509 certificates (~2000+ chars),
 * while the test/demo API may return SPKI public keys (~300 chars).
 * We explicitly detect and parse each format to avoid ambiguity
 * across different Node.js / OpenSSL versions.
 */
function parsePublicKey(certificateBase64: string): crypto.KeyObject {
  const formatted = certificateBase64.match(/.{1,64}/g)!.join('\n');

  // Try X.509 certificate first (production KSeF returns these)
  try {
    const certPem = `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;
    const x509 = new crypto.X509Certificate(certPem);
    return x509.publicKey;
  } catch {
    // Not an X.509 certificate — try SPKI below
  }

  // Try SPKI public key (test/demo KSeF may return these)
  try {
    const keyPem = `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
    return crypto.createPublicKey(keyPem);
  } catch {
    // Not an SPKI key either
  }

  throw new Error(
    'Failed to parse KSeF certificate: data is neither a valid X.509 certificate nor SPKI public key',
  );
}

export function encryptToken(
  token: string,
  timestampMs: number,
  certificateBase64: string,
): string {
  const plaintext = `${token}|${timestampMs}`;
  const publicKey = parsePublicKey(certificateBase64);

  const encrypted = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(plaintext, 'utf-8'),
  );

  return encrypted.toString('base64');
}
