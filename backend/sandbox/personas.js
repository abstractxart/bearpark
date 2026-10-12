// Who lives in the sandbox. Alice, Bob and Dana use REAL $BEAR holders' PUBLIC
// addresses, so the server's ledger entry check (read-only XRPL queries) lets
// them in exactly as it would in production; nothing here can sign for them,
// and a session minted for them is only valid in the sandbox (its own secret).
// Everyone else has a generated address that has never been funded on the
// ledger (deterministic: sha256("bearpark-sandbox:<key>") entropy).

const px = (n) => JSON.stringify({
  nftId: null,
  imageUrl: `https://ipfs.io/ipfs/bafybeicosh5bbjcq6xc24tmmpuzrvepd37pgef4oa2yw5z7o4gj3vu4osm/pixel-bear-%23${n}.png`,
  fallbackImageUrl: null,
  bearName: `Pixel BEAR #${n}`,
  isAnimated: false,
});
const bear = (n, cid, animated = false) => JSON.stringify({
  nftId: null,
  imageUrl: `https://ipfs.io/ipfs/${cid}`,
  fallbackImageUrl: null,
  bearName: `BEAR #${n}`,
  isAnimated: animated,
});

const PERSONAS = {
  alice: { wallet: 'rszi51CrPCVRutFTbier3MCU1bWpFaWYtk', name: 'Alice', real: true, avatar: px(1261), bio: 'Raids by day, Flappy by night. Honey board regular.', honey: 4808.9, raiding: 195 },
  bob: { wallet: 'r91Ziofbsy99ounY15qTarKtXrjizyZh8b', name: 'Bob', real: true, avatar: px(3118), bio: 'Pixel BEAR collector. Ask me about #3118.', honey: 1053.1, raiding: 195 },
  carol: { wallet: 'rEfJKEPgmA4mRCoJuMzuaUJcZdabGgeeoX', name: 'Carol', real: false, avatar: null, bio: null, honey: 0, raiding: 0, note: 'empty wallet: fails the 10,000 $BEAR / NFT entry rule' },
  dana: { wallet: 'rwx873kFLGWEcQiPTqiDGkrRo5YwcHvhUn', name: 'Dana (mod)', real: true, avatar: bear(261, 'bafybeigf262bkpd26whemydkv37qmssihaed6twn7b2fxciuliux73u3vq'), bio: 'Keeping the board friendly.', honey: 640, raiding: 120, role: 'admin' },
  eve: { wallet: 'raq7YDq1XCWa6AL4d2zhjGbxUiQpacJocE', name: 'Eve', real: false, avatar: bear(65, 'bafybeiczdypyapn5p77oikm3mblc5v4mqmdztta4oyv5zvf2j7pnq4rpmm', true), bio: 'Here for the memes.', honey: 212, raiding: 60 },
  pete: { wallet: 'rEN9VJCfY2t3cbzTi7EkGxC3RT8fmnmRX8', name: 'Pixel Pete', real: false, avatar: px(90), bio: null, honey: 388.5, raiding: 100 },
  gwen: { wallet: 'r3jbwfQHvzh4PbWuNgswbkBSNeeCZULR9V', name: 'Grizzly Gwen', real: false, avatar: bear(26, 'bafybeif36gx3xe5nuhu3kek4dbggxnieskyvmzeicj2ruswjxflzachv4e', true), bio: 'Jumpventure speedrunner.', honey: 921, raiding: 300 },
  kai: { wallet: 'r4wqYhYUtaQRheE7WHfYZTTvSbr3zzAjkN', name: 'Kodiak Kai', real: false, avatar: px(2749), bio: null, honey: 75, raiding: 20 },
  paula: { wallet: 'rLxmpzRw89xKLvX37ka1Rx32mNnJmK1Mxi', name: 'Polar Paula', real: false, avatar: bear(36, 'bafybeidsisujzwdgoptamzf4rn7h7cgxhdswk72j7fhmcxmlpzifcxobaa', true), bio: 'Snow, honey, repeat.', honey: 530, raiding: 220 },
  sam: { wallet: 'rUbxCUQqJuHM7iP5wtmLkgFPyAcjBc4dao', name: 'Sun Bear Sam', real: false, avatar: px(42), bio: null, honey: 18, raiding: 0 },
  // A wallet with honey but no profile row: the "anonymous" path everywhere.
  pat: { wallet: 'r9DHG6WVqQTkL8G1Dpz6wTHS26JX2s6Wja', name: null, real: false, avatar: null, bio: null, honey: 33, raiding: 0 },
};

module.exports = { PERSONAS };
