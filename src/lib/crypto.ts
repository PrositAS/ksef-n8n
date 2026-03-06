import crypto from 'crypto';

export function encryptToken(
  token: string,
  timestampMs: number,
  certificateBase64: string,
): string {
  const plaintext = `${token}|${timestampMs}`;

  // The API returns the certificate as a single Base64 string (DER format).
  // Node.js crypto needs proper PEM with 64-char line breaks.
  const formatted = certificateBase64.match(/.{1,64}/g)!.join('\n');
  const certPem = `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;

  const encrypted = crypto.publicEncrypt(
    {
      key: certPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256', // Sets BOTH OAEP label hash AND MGF1 hash to SHA-256
    },
    Buffer.from(plaintext, 'utf-8'),
  );

  return encrypted.toString('base64');
}
