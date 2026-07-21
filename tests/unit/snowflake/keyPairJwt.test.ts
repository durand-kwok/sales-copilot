import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildKeyPairJwt } from '../../../src/snowflake/keyPairJwt.js';

function generateTestKeyPair(passphrase?: string) {
  const cipherOptions = passphrase
    ? { cipher: 'aes-256-cbc' as const, passphrase }
    : {};
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', ...cipherOptions },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}

function expectedFingerprint(publicKeyPem: string): string {
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('base64');
}

function decodeJwt(jwt: string) {
  const [headerB64, payloadB64, signatureB64] = jwt.split('.');
  const header = JSON.parse(Buffer.from(headerB64!, 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
  return { header, payload, signingInput: `${headerB64}.${payloadB64}`, signature: signatureB64! };
}

describe('buildKeyPairJwt', () => {
  it('produces a JWT with the correct header, claims, and a cryptographically valid signature', () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair();
    const jwt = buildKeyPairJwt({ account: 'myaccount', username: 'myuser', privateKeyPem });

    const { header, payload, signingInput, signature } = decodeJwt(jwt);

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe(`MYACCOUNT.MYUSER.SHA256:${expectedFingerprint(publicKeyPem)}`);
    expect(payload.sub).toBe('MYACCOUNT.MYUSER');
    expect(payload.exp - payload.iat).toBe(3600);

    const verified = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      publicKeyPem,
      Buffer.from(signature, 'base64url'),
    );
    expect(verified).toBe(true);
  });

  it('uppercases account and username regardless of input case', () => {
    const { privateKeyPem } = generateTestKeyPair();
    const jwt = buildKeyPairJwt({ account: 'MyAccount-123', username: 'john', privateKeyPem });
    const { payload } = decodeJwt(jwt);
    expect(payload.sub).toBe('MYACCOUNT-123.JOHN');
  });

  it('honors a custom lifetimeSeconds', () => {
    const { privateKeyPem } = generateTestKeyPair();
    const jwt = buildKeyPairJwt({ account: 'a', username: 'u', privateKeyPem, lifetimeSeconds: 60 });
    const { payload } = decodeJwt(jwt);
    expect(payload.exp - payload.iat).toBe(60);
  });

  it('supports a passphrase-protected private key', () => {
    const { privateKeyPem, publicKeyPem } = generateTestKeyPair('correct-horse');
    const jwt = buildKeyPairJwt({
      account: 'a',
      username: 'u',
      privateKeyPem,
      privateKeyPassphrase: 'correct-horse',
    });
    const { signingInput, signature } = decodeJwt(jwt);
    const verified = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signingInput),
      publicKeyPem,
      Buffer.from(signature, 'base64url'),
    );
    expect(verified).toBe(true);
  });
});
