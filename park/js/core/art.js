// BEAR Park's artwork and the four games — one list, so every page shows the
// same cards. Images are right-sized WebP copies of the originals in the R2
// bucket, built by the media pipeline into /park/media with content-hashed
// names (so they are cached for good). The park panorama was a 6.8 MB PNG and
// the Ultra Rare video 144 MB; here they are 26–90 KB and 859 KB.

const M = '/park/media';
const set = (name, sizes) => sizes.map(([w, file]) => `${M}/${name}-${w}.${file}.webp ${w}w`).join(', ');

export const ART = {
  coin: `${M}/coin-256.2a049d3fb2.webp`,      // the BEAR coin (top-hat bear)
  honey: `${M}/honey-360.6b36deb5c7.webp`,    // the honey pot
  sign: `${M}/sign-320.8e139c40ac.webp`,      // the wooden BEAR PARK sign
  park: `${M}/park-1600.bd56b56c6c.webp`,     // the park panorama
  parkSet: set('park', [[960, '0f7d73bb67'], [1600, 'bd56b56c6c'], [2400, '65ed2a74dd']]),
  booth: `${M}/booth-1536.6101902dac.webp`,   // the old store's prize booth
  boothSet: set('booth', [[900, '784925767b'], [1536, '6101902dac']]),
  stream: `${M}/stream-art-1600.a9b7dae2a9.webp`,
  streamSet: set('stream-art', [[960, '60e28a656d'], [1600, 'a9b7dae2a9']]),
  ultraVideo: `${M}/ultra.c53769ce1a.mp4`,
  ultraPoster: `${M}/ultra-poster.f779a8f6ef.webp`,
  pixelVideo: `${M}/pixel.ebbc163811.mp4`,
  pixelPoster: `${M}/pixel-poster.7b1db5f97e.webp`,
  xmagneticLogo: `${M}/logo-xmagnetic-128.33a30ca9d0.webp`,
};

/** The BEARABLEGUY123 posters: { src, srcset } (720w and full). */
export const POSTERS = [
  [['720', '80e5149ccb'], ['1400', 'f145dc0fdb']],
  [['720', '43369604e0'], ['1400', '43c66ce5ec']],
  [['720', '8e358438f3'], ['1400', 'c35ba76b90']],
  [['720', 'b0607f035c'], ['1400', 'a09601ae87']],
  [['720', 'a662914cd9'], ['1400', '432d4aeb95']],
  [['720', 'af6a015824'], ['1400', 'def5e9a9ab']],
  [['720', '1165c3bf0d'], ['1280', '514ec70ee2']],
].map((sizes, i) => ({
  src: `${M}/poster-${i + 1}-${sizes[1][0]}.${sizes[1][1]}.webp`,
  thumb: `${M}/poster-${i + 1}-${sizes[0][0]}.${sizes[0][1]}.webp`,
  srcset: set(`poster-${i + 1}`, sizes),
}));

// The park's characters, as trimmed cut-outs sized by height (media pipeline
// SPRITES): the Bear City walkers (160px tall), the Jester and the BEAR heads
// that float on Community → Friends. { src, w, h } in image pixels.
const sprite = (file, w, hh) => ({ src: `${M}/${file}`, w, h: hh });
export const CITY = [
  sprite('city-suit-160.c6e1df8cc0.webp', 74, 160),
  sprite('city-cowboy-160.fdd7bde0ca.webp', 97, 160),
  sprite('city-prof-160.38a536eb8a.webp', 74, 160),
  sprite('city-farmer-160.1ead067da4.webp', 80, 160),
  sprite('city-king-160.b12f214feb.webp', 75, 160),
  sprite('city-tux-160.db31e9ab7e.webp', 71, 160),
  sprite('city-plain-160.f5908d24fe.webp', 84, 160),
  sprite('city-polar-160.671ec622ef.webp', 89, 160),
  sprite('city-ranger-160.54e5fd0daa.webp', 98, 160),
];
export const JESTER = sprite('jester-300.9f86b16aaa.webp', 147, 300);
export const HEADS = [
  sprite('head-tophat-128.db33a2ae04.webp', 96, 128),
  sprite('head-cap-128.349df868d3.webp', 123, 128),
  sprite('head-crown-128.da997227c3.webp', 120, 128),
  sprite('head-horns-128.9b5066ddcd.webp', 124, 128),
  sprite('head-monocle-128.089d32f8db.webp', 108, 128),
  sprite('head-gold-128.62ac80cf27.webp', 114, 128),
  sprite('head-chef-128.b906541ae1.webp', 125, 128),
  sprite('head-cowboy-128.c82dab126a.webp', 114, 128),
  sprite('head-fire-128.9cfc699a2d.webp', 107, 128),
  sprite('head-red-128.46aa5d8ab8.webp', 116, 128),
];

/**
 * The games. `path` is where each one lives (the wrappers hand the signed-in
 * wallet to the game); `board` is the game_id its leaderboard is filed under
 * (Bear Ninja's scores are kept as "bear-slice").
 */
export const GAMES = [
  { id: 'flappy-bear', name: 'Flappy BEAR', path: '/flappybear', board: 'flappy-bear', art: `${M}/game-flappy-500.d06123aad2.webp`, tag: 'Tap to fly', blurb: 'Thread the flags. Daily run, ghosts and all.', unit: 'pts' },
  { id: 'bear-ninja', name: 'BEAR Ninja', path: '/bear-ninja', board: 'bear-slice', art: `${M}/game-ninja-500.658d1d0e10.webp`, tag: 'Slice', blurb: 'Slice the coins, dodge the bombs.', unit: 'pts' },
  { id: 'bear-jumpventure', name: 'BEAR Jumpventure', path: '/bear-jumpventure', board: 'bear-jumpventure', art: `${M}/game-jump-500.b5a19ca017.webp`, tag: 'Climb', blurb: 'Bounce up the castle as high as you dare.', unit: 'pts' },
  { id: 'bear-pong', name: 'Pong Lab', path: '/bearpong', board: 'bear-pong', art: `${M}/game-pong-640.50823a1eea.webp`, tag: 'Online', blurb: 'Professor BEAR’s live 1v1 pong.', unit: 'wins' },
];
