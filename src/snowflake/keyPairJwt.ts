import crypto from 'node:crypto';

export interface BuildKeyPairJwtParams {
  account: string;
  username: string;
  privateKeyPem: string;
  privateKeyPassphrase?: string;
  /** Token lifetime in seconds. Defaults to 1 hour, matching Snowflake's own driver convention. */
  lifetimeSeconds?: number;
}

/**
 * Computes the SHA256 fingerprint of the RSA public key derived from a private key, in the exact
 * form Snowflake expects for key-pair JWT auth (base64 of the SHA256 digest of the SPKI DER
 * encoding) — verified to match `openssl rsa -pubin ... | openssl dgst -sha256 -binary | openssl enc -base64`.
 */
function computePublicKeyFingerprint(privateKey: crypto.KeyObject): string {
  const publicKey = crypto.createPublicKey(privateKey);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('base64');
}

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/**
 * Builds a Snowflake key-pair JWT for authenticating directly to Snowflake's REST APIs (e.g. an
 * MCP server endpoint) — distinct from `snowflake-sdk`'s own internal auth, which never needs a
 * hand-built JWT. Reuses the same private key file already configured for the primary Snowflake
 * connection.
 */
export function buildKeyPairJwt(params: BuildKeyPairJwtParams): string {
  const privateKey = crypto.createPrivateKey(
    params.privateKeyPassphrase
      ? { key: params.privateKeyPem, passphrase: params.privateKeyPassphrase }
      : params.privateKeyPem,
  );
  const fingerprint = computePublicKeyFingerprint(privateKey);

  const account = params.account.toUpperCase();
  const username = params.username.toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const lifetime = params.lifetimeSeconds ?? 3600;

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: `${account}.${username}.SHA256:${fingerprint}`,
    sub: `${account}.${username}`,
    iat: now,
    exp: now + lifetime,
  };

  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}
