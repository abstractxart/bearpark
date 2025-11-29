/**
 * Find Ultra Rare NFTs by scanning metadata
 * Looks for rarity traits or specific attributes
 */

const xrpl = require('xrpl');
const fetch = require('node-fetch');

const NFT_ISSUER = 'rBEARbo4Prn33894evmvYcAf9yAQjp4VJF';

// Convert hex to string
function hexToString(hex) {
  if (!hex) return '';
  let str = '';
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
}

async function findUltraRares() {
  console.log('🔍 Scanning for Ultra Rare NFTs...\n');

  const client = new xrpl.Client('wss://s1.ripple.com');
  await client.connect();
  console.log('✅ Connected to XRPL\n');

  const nfts = [];
  let marker = null;
  let totalNFTs = 0;

  // First, collect all NFTs
  console.log('📥 Fetching all NFTs...');
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
        nfts.push({
          tokenId: nft.nft_id,
          owner: nft.owner,
          uri: nft.uri ? hexToString(nft.uri) : null,
          taxon: nft.nft_taxon
        });
      }
      marker = response.result.marker;
    } else {
      break;
    }

    process.stdout.write(`\r   Fetched: ${totalNFTs} NFTs...`);
    await new Promise(r => setTimeout(r, 100));
  } while (marker);

  await client.disconnect();
  console.log(`\n   ✅ Found ${nfts.length} NFTs total\n`);

  // Now check metadata for rarity traits
  console.log('🔎 Checking metadata for rarity traits...\n');

  const ultraRares = [];
  let checked = 0;

  for (const nft of nfts.slice(0, 100)) { // Check first 100 to find the pattern
    checked++;
    process.stdout.write(`\r   Checking: ${checked}/100...`);

    if (!nft.uri) continue;

    try {
      // Handle IPFS URIs
      let fetchUrl = nft.uri;
      if (fetchUrl.startsWith('ipfs://')) {
        fetchUrl = fetchUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
      }

      const response = await fetch(fetchUrl, { timeout: 5000 });
      if (!response.ok) continue;

      const metadata = await response.json();

      // Look for rarity indicators in attributes
      if (metadata.attributes) {
        for (const attr of metadata.attributes) {
          const traitType = (attr.trait_type || '').toLowerCase();
          const value = (attr.value || '').toString().toLowerCase();

          // Check for ultra rare indicators
          if (
            traitType.includes('rarity') && (value.includes('ultra') || value.includes('legendary') || value.includes('mythic')) ||
            traitType.includes('tier') && (value === '1' || value.includes('ultra') || value.includes('legendary')) ||
            value === 'ultra rare' ||
            value === 'legendary' ||
            value === 'mythic'
          ) {
            ultraRares.push({
              tokenId: nft.tokenId,
              owner: nft.owner,
              trait: `${attr.trait_type}: ${attr.value}`,
              name: metadata.name || 'Unknown'
            });
            console.log(`\n   ⭐ Found Ultra Rare: ${metadata.name || nft.tokenId.slice(-8)}`);
            console.log(`      Trait: ${attr.trait_type} = ${attr.value}`);
            console.log(`      Owner: ${nft.owner}`);
          }
        }
      }

      // Also check for 1/1s or special editions
      if (metadata.name) {
        const name = metadata.name.toLowerCase();
        if (name.includes('1/1') || name.includes('ultra') || name.includes('legendary') || name.includes('mythic') || name.includes('golden')) {
          if (!ultraRares.find(u => u.tokenId === nft.tokenId)) {
            ultraRares.push({
              tokenId: nft.tokenId,
              owner: nft.owner,
              trait: 'Name match',
              name: metadata.name
            });
            console.log(`\n   ⭐ Found by name: ${metadata.name}`);
          }
        }
      }

    } catch (e) {
      // Skip failed fetches
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 RESULTS');
  console.log('='.repeat(60));

  if (ultraRares.length > 0) {
    console.log(`\n✅ Found ${ultraRares.length} potential Ultra Rares:\n`);
    for (const ur of ultraRares) {
      console.log(`   Name: ${ur.name}`);
      console.log(`   Token ID: ${ur.tokenId}`);
      console.log(`   Owner: ${ur.owner}`);
      console.log(`   Reason: ${ur.trait}`);
      console.log('');
    }

    console.log('\n💡 Add these Token IDs to ULTRA_RARE_NFTS in daily-airdrop-snapshot.js');
  } else {
    console.log('\n❌ No ultra rares found in metadata traits.');
    console.log('   The collection may use a different system for rarity.');
    console.log('   You may need to manually identify ultra rare Token IDs.');
  }
}

findUltraRares().catch(console.error);
