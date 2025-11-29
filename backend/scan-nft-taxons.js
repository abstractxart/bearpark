/**
 * Scan all NFTs from the issuer and list unique taxons with counts
 * This helps identify which taxons are ultra rares
 */

const xrpl = require('xrpl');

const NFT_ISSUER = 'rBEARbo4Prn33894evmvYcAf9yAQjp4VJF';

async function scanTaxons() {
  console.log('🔍 Scanning NFT Taxons...\n');

  const client = new xrpl.Client('wss://s1.ripple.com');
  await client.connect();
  console.log('✅ Connected to XRPL\n');

  const taxonCounts = new Map(); // taxon -> count
  let marker = null;
  let totalNFTs = 0;

  do {
    const request = {
      command: 'nfts_by_issuer',
      issuer: NFT_ISSUER,
      limit: 100
    };
    if (marker) request.marker = marker;

    const response = await client.request(request);

    if (response.result?.nfts) {
      for (const nft of response.result.nfts) {
        totalNFTs++;
        const taxon = nft.nft_taxon;
        taxonCounts.set(taxon, (taxonCounts.get(taxon) || 0) + 1);
      }
      marker = response.result.marker;
    } else {
      break;
    }

    process.stdout.write(`\r   Scanned: ${totalNFTs} NFTs...`);
    await new Promise(r => setTimeout(r, 100));
  } while (marker);

  await client.disconnect();

  console.log(`\n\n📊 Results: ${totalNFTs} total NFTs across ${taxonCounts.size} unique taxons\n`);
  console.log('='.repeat(50));
  console.log('TAXON ID'.padEnd(15) + 'COUNT'.padEnd(10) + 'RARITY');
  console.log('='.repeat(50));

  // Sort by count (ascending = rarest first)
  const sorted = [...taxonCounts.entries()].sort((a, b) => a[1] - b[1]);

  for (const [taxon, count] of sorted) {
    let rarity = '';
    if (count <= 10) rarity = '⭐ ULTRA RARE';
    else if (count <= 50) rarity = '🔥 RARE';
    else if (count <= 200) rarity = 'UNCOMMON';
    else rarity = 'COMMON';

    console.log(
      String(taxon).padEnd(15) +
      String(count).padEnd(10) +
      rarity
    );
  }

  console.log('='.repeat(50));
  console.log('\n💡 Ultra rares are typically taxons with very low counts (≤10)');
  console.log('   Add those taxon IDs to ULTRA_RARE_TAXONS in daily-airdrop-snapshot.js\n');
}

scanTaxons().catch(console.error);
