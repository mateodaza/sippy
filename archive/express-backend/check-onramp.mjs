// Generate JWT manually using jose (same as CDP SDK does internally)
import * as jose from 'jose';
import crypto from 'crypto';

async function main() {
  const apiKeyId = '7b32fd41-dcba-4000-abfd-997aa4cb96a8';
  const apiKeySecret = 'PpNxFsC7s9d5ytMxOKI8v3Ae/v+ME+ZJYw7tmOxfo68RNHxYu/eYOPEo4y+EV6a7hKAGswl6l2iuRmkrETVb2w==';

  console.log('Generating JWT...');

  // Ed25519 key (64 bytes = 32 seed + 32 public)
  const decoded = Buffer.from(apiKeySecret, 'base64');
  const seed = decoded.subarray(0, 32);
  const publicKey = decoded.subarray(32);

  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    d: Buffer.from(seed).toString('base64url'),
    x: Buffer.from(publicKey).toString('base64url'),
  };

  const key = await jose.importJWK(jwk, 'EdDSA');
  const nonce = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  // Format: "METHOD host/path" (no https://)
  const uri = 'GET api.developer.coinbase.com/onramp/v1/buy/config';

  const jwt = await new jose.SignJWT({
    sub: apiKeyId,
    iss: 'cdp',
    aud: ['cdp_service'],
    uris: [uri]
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: apiKeyId, typ: 'JWT', nonce })
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);

  console.log('JWT generated, calling Onramp API...\n');

  // Call the API
  const response = await fetch('https://api.developer.coinbase.com/onramp/v1/buy/config', {
    headers: {
      'Authorization': `Bearer ${jwt}`,
      'Accept': 'application/json'
    }
  });

  console.log('Status:', response.status);

  if (response.ok) {
    const json = await response.json();
    console.log('\n========================================');
    console.log('COINBASE ONRAMP - SUPPORTED COUNTRIES');
    console.log('========================================\n');
    console.log('Total countries:', json.countries?.length || 0);

    // Look for Colombia (CO)
    const colombia = json.countries?.find(c => c.id === 'CO');
    if (colombia) {
      console.log('\n✅ COLOMBIA (CO) IS SUPPORTED!');
      console.log('Payment methods:', JSON.stringify(colombia.payment_methods, null, 2));
    } else {
      console.log('\n❌ COLOMBIA (CO) NOT FOUND');
    }

    // LATAM check
    const latam = ['CO', 'MX', 'AR', 'BR', 'CL', 'PE', 'VE', 'EC', 'UY', 'PY', 'BO', 'CR', 'PA'];
    const found = json.countries?.filter(c => latam.includes(c.id)) || [];
    console.log('\n--- LATAM Countries ---');
    if (found.length > 0) {
      found.forEach(c => {
        console.log(`${c.id}: ${c.payment_methods?.map(p => p.id).join(', ') || 'none'}`);
      });
    } else {
      console.log('No LATAM countries found');
    }

    console.log('\n--- All Countries ---');
    console.log(json.countries?.map(c => c.id).join(', '));
  } else {
    console.log('Error:', await response.text());
  }
}

main().catch(console.error);
