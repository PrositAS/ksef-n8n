import crypto from 'crypto';
import { execSync } from 'child_process';
import { encryptToken } from '../src/lib/crypto';

// Generate a real self-signed X.509 certificate for testing.
// encryptToken expects a DER certificate in Base64 (as returned by KSeF API).
function generateTestCertAndKey(): {
  certificateBase64: string;
  privateKey: crypto.KeyObject;
} {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  // Use openssl to create a self-signed X.509 certificate in DER format
  const certDer = execSync(
    'openssl req -new -x509 -key /dev/stdin -days 1 -outform DER -subj "/CN=test" 2>/dev/null',
    { input: privPem },
  );

  return {
    certificateBase64: certDer.toString('base64'),
    privateKey,
  };
}

describe('encryptToken', () => {
  const { certificateBase64, privateKey } = generateTestCertAndKey();

  it('should produce valid Base64 output', () => {
    const result = encryptToken(
      '20260302-EC-2DF0785000-A9E62B332E-26|nip-6423189108|4e3a6f89eb35',
      1772801990478,
      certificateBase64,
    );
    expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('should be decryptable with the corresponding private key', () => {
    const token =
      '20260302-EC-2DF0785000-A9E62B332E-26|nip-6423189108|4e3a6f89eb35';
    const timestamp = 1772801990478;
    const encrypted = encryptToken(token, timestamp, certificateBase64);

    const decrypted = crypto
      .privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(encrypted, 'base64'),
      )
      .toString('utf-8');

    expect(decrypted).toBe(`${token}|${timestamp}`);
  });

  it('should handle certificate string without line breaks', () => {
    // KSeF API returns a single continuous Base64 string
    const continuous = certificateBase64.replace(/\n/g, '');
    const result = encryptToken('token', 12345, continuous);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it('should produce different ciphertext each time (OAEP is randomized)', () => {
    const a = encryptToken('token', 12345, certificateBase64);
    const b = encryptToken('token', 12345, certificateBase64);
    expect(a).not.toBe(b);
  });
});
