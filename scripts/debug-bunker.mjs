/**
 * Standalone script to debug NIP-46 bunker connection flow.
 * Run: pnpm run debug:bunker
 *
 * Tries different connect() param orders to see what the bunker expects.
 * Note: Many bunkers use one-time secrets; replace BUNKER_URI with a fresh
 * URI from your bunker for each test run.
 */

const BUNKER_URI =
  'bunker://27b256db6e19c0245f3b9b62c5a2bfd9a90964bd1bc6d20b56107c78203010d0?relay=wss%3A%2F%2Frelay.nsec.app&relay=wss%3A%2F%2Frelay.damus.io&relay=wss%3A%2F%2Fnos.lol&secret=587ab0c368f4301ef4b45bf0b9ad9378';

async function main() {
  const { generateSecretKey, getPublicKey, SimplePool } = await import('nostr-tools');
  const { BunkerSigner, parseBunkerInput } = await import('nostr-tools/nip46');

  console.log('=== Bunker URI ===');
  console.log(BUNKER_URI);
  console.log('');

  const bp = await parseBunkerInput(BUNKER_URI);
  if (!bp) {
    console.error('parseBunkerInput returned null');
    process.exit(1);
  }
  console.log('=== Parsed BunkerPointer ===');
  console.log(JSON.stringify(bp, null, 2));
  console.log('  relays:', bp.relays?.length, bp.relays);
  console.log('  pubkey (remote):', bp.pubkey);
  console.log('  secret length:', bp.secret?.length ?? 0);
  console.log('');

  const clientSecret = generateSecretKey();
  const clientPubkey = getPublicKey(clientSecret);
  console.log('=== Client (ours) ===');
  console.log('  client pubkey:', clientPubkey);
  console.log('');

  const pool = new SimplePool();
  const signer = BunkerSigner.fromBunker(clientSecret, bp, { pool });
  const sendRequest = signer.sendRequest.bind(signer);

  const attempts = [
    {
      name: 'A) [clientPubkey, remotePubkey, secret] (NIP-46 style)',
      params: [clientPubkey, bp.pubkey, bp.secret ?? ''],
    },
    {
      name: 'B) [remotePubkey, secret] (nostr-tools default)',
      params: [bp.pubkey, bp.secret ?? ''],
    },
    {
      name: 'C) [clientPubkey, secret]',
      params: [clientPubkey, bp.secret ?? ''],
    },
    {
      name: 'D) [secret] only',
      params: [bp.secret ?? ''],
    },
  ];

  for (const { name, params } of attempts) {
    console.log('--- Try', name, '---');
    console.log(
      '  params:',
      params.map((p) => (p.length > 20 ? p.slice(0, 16) + '...' : p))
    );
    try {
      const result = await sendRequest('connect', params);
      console.log('  SUCCESS result:', JSON.stringify(result));
      // Bunker may return "ack", "", or the secret string — all mean success
      const isSuccess = result === 'ack' || result === '' || result === (bp.secret ?? '');
      if (isSuccess) {
        console.log('  (connect accepted)');
        const userPubkey = await signer.getPublicKey();
        console.log('  get_public_key:', userPubkey);
        await signer.close();
        console.log('');
        console.log('>>> Working param order:', name);
        process.exit(0);
      }
    } catch (e) {
      console.log('  ERROR:', e?.message ?? String(e));
    }
    console.log('');
  }

  console.log('>>> No param order succeeded. Check bunker docs for connect() params.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
