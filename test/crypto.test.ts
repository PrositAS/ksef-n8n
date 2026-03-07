import crypto from 'crypto';
import { execSync } from 'child_process';
import { encryptToken } from '../src/lib/crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

function decrypt(encrypted: string): string {
  return crypto
    .privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encrypted, 'base64'),
    )
    .toString('utf-8');
}

describe('encryptToken', () => {
  // SPKI public key in Base64 — this is what KSeF API actually returns
  const spkiBase64 = publicKey
    .export({ type: 'spki', format: 'der' })
    .toString('base64');

  // X.509 certificate in Base64 — fallback case
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const certBase64 = execSync(
    'openssl req -new -x509 -key /dev/stdin -days 1 -outform DER -subj "/CN=test" 2>/dev/null',
    { input: privPem },
  ).toString('base64');

  describe('with SPKI public key (KSeF API format)', () => {
    it('should produce valid Base64 output', () => {
      const result = encryptToken(
        'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0',
        1772801990478,
        spkiBase64,
      );
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should be decryptable with the corresponding private key', () => {
      const token =
        'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0';
      const timestamp = 1772801990478;
      const encrypted = encryptToken(token, timestamp, spkiBase64);
      expect(decrypt(encrypted)).toBe(`${token}|${timestamp}`);
    });

    it('should handle string without line breaks', () => {
      const continuous = spkiBase64.replace(/\n/g, '');
      const result = encryptToken('token', 12345, continuous);
      expect(result).toBeTruthy();
    });
  });

  describe('with X.509 certificate (fallback)', () => {
    it('should produce valid Base64 output', () => {
      const result = encryptToken('token', 12345, certBase64);
      expect(result).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('should be decryptable with the corresponding private key', () => {
      const token = 'test-token';
      const timestamp = 9999999;
      const encrypted = encryptToken(token, timestamp, certBase64);
      expect(decrypt(encrypted)).toBe(`${token}|${timestamp}`);
    });
  });

  it('should produce different ciphertext each time (OAEP is randomized)', () => {
    const a = encryptToken('token', 12345, spkiBase64);
    const b = encryptToken('token', 12345, spkiBase64);
    expect(a).not.toBe(b);
  });

  it('should throw for invalid key data', () => {
    expect(() => encryptToken('token', 123, 'notavalidkey')).toThrow();
  });
});
