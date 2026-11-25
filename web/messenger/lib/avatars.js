// Pixel-art profile pictures. Each one is a little critter drawn on a 12x12 grid from a seed
// (by default the person's name), so everyone in a chat renders the same picture without any
// pixels being sent.
//   avatar value: null / undefined  -> generated from the name
//                 'g:<seed>'          -> generated from a picked seed (a "shuffle" result)
//                 'data:image/...'    -> an uploaded photo
//
// Species are hand-drawn half masks (left 6 columns, mirrored). The seed picks the species,
// colours, eyes, mouth, cheeks and an optional topper. Outline and shading are computed, so
// every critter reads like a proper sprite.

const SPECIES = {
  slime: { eyes: 6, mouth: 8, mask: [
    '......', '......', '......', '....bb', '..bbbb', '.bbbbb', '.bbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '......'] },
  cat: { eyes: 5, mouth: 7, mask: [
    '......', '.b....', '.bb...', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '..bbbb', '...bbb', '......'] },
  bear: { eyes: 5, mouth: 7, snout: true, mask: [
    '......', '.bb...', 'bbbb..', 'bbbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '..bbbb', '...bbb', '......'] },
  bot: { eyes: 5, mouth: 8, square: true, mask: [
    '......', '.....d', '.....d', '.bbbbb', '.bbbbb', 'dbbbbb', 'dbbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '...dd.', '......'] },
  ghost: { eyes: 5, mouth: 7, mask: [
    '......', '......', '...bbb', '..bbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.bbbbb', '.b.bb.', '......'] },
  frog: { eyes: 4, mouth: 7, eyeBumps: true, mask: [
    '......', '......', '.bb...', 'bbbb..', 'bbbbbb', 'bbbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '..bbbb', '......', '......'] },
  chick: { eyes: 5, mouth: 7, beak: true, mask: [
    '......', '....b.', '...bb.', '..bbbb', '.bbbbb', '.bbbbb', '.bbbbb', 'bbbbbb', 'bbbbbb', '.bbbbb', '..bbbb', '......'] },
};

const BODY_HUES = [8, 22, 38, 50, 95, 140, 165, 190, 205, 225, 255, 280, 310, 335];

const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) {
  let a = hash(seed) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;

function draw(seed) {
  const r = rng(seed.trim().toLowerCase());
  const name = pick(r, Object.keys(SPECIES));
  const sp = SPECIES[name];
  const N = 12;
  const grid = Array.from({ length: N }, () => Array(N).fill(null));
  sp.mask.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    grid[y][x] = ch;
    grid[y][N - 1 - x] = ch;
  }));

  // colours: body, plus a soft background in a neighbouring hue
  const h = pick(r, BODY_HUES);
  const sat = name === 'ghost' ? 18 + r() * 20 : 55 + r() * 25;
  const light = name === 'ghost' ? 86 : 58 + r() * 10;
  const body = hsl(h, sat, light);
  const shade = hsl(h, sat, light - 14);
  const glow = hsl(h, sat, Math.min(94, light + 14));
  const outline = hsl(h, Math.min(60, sat), 18);
  const bgH = (h + pick(r, [150, 180, 200, 30, -30])) % 360;
  const bg = hsl((bgH + 360) % 360, 45 + r() * 20, 88);
  const bgDot = hsl((bgH + 360) % 360, 45, 82);
  const accent = hsl((h + 180) % 360, 70, 62);

  const px = [];
  const put = (x, y, c) => px.push(`<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${c}"/>`);
  const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && grid[y][x];

  // topper on the head
  const topper = pick(r, ['none', 'none', 'sprout', 'crown', 'bow', 'halo']);
  let top = grid.findIndex((row) => row.some(Boolean));
  if (topper !== 'none' && top >= 2 && !sp.square) {
    const ty = top - 1;
    if (topper === 'sprout') { const g = hsl(120, 55, 45); grid[ty][6] = 'x:' + g; grid[ty - 1][5] = 'x:' + g; grid[ty - 1][7] = 'x:' + hsl(120, 55, 55); }
    if (topper === 'crown') { const c = hsl(45, 95, 58); [4, 5, 6, 7].forEach((x) => { grid[ty][x] = 'x:' + c; }); grid[ty - 1][4] = 'x:' + c; grid[ty - 1][7] = 'x:' + c; }
    if (topper === 'bow') { const c = hsl(340, 80, 66); [3, 4, 6, 7].forEach((x) => { grid[ty][x] = 'x:' + c; }); grid[ty][5] = 'x:' + hsl(340, 70, 50); }
    if (topper === 'halo') { const c = hsl(50, 100, 70); [4, 5, 6, 7].forEach((x) => { grid[ty - 1][x] = 'x:' + c; }); }
  }

  // outline around everything that's filled
  for (let y = -1; y <= N; y++) for (let x = -1; x <= N; x++) {
    if (filled(x, y)) continue;
    if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
      if (x >= -1 && y >= -1 && x <= N && y <= N) put(x, y, outline);
    }
  }
  // body with simple top-left light / bottom-right shade
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = grid[y][x];
    if (!v) continue;
    if (v.startsWith('x:')) { put(x, y, v.slice(2)); continue; }
    if (v === 'd') { put(x, y, outline); continue; }
    const edgeLow = !filled(x, y + 1) || (!filled(x + 1, y) && x > 5);
    const edgeHigh = !filled(x, y - 1) && x < 7;
    put(x, y, edgeLow ? shade : edgeHigh ? glow : body);
  }

  // face
  const ey = sp.eyes;
  const eyeStyle = sp.square ? pick(r, ['big', 'tall']) : pick(r, ['tall', 'tall', 'big', 'dot', 'happy']);
  const ex = sp.eyeBumps ? [2, 9] : [4, 7];
  const ink = hsl(h, 40, 12);
  for (const x of ex) {
    if (eyeStyle === 'tall') { put(x, ey, ink); put(x, ey + 1, ink); }
    else if (eyeStyle === 'big') { const xx = x < 6 ? x - 1 : x; put(xx, ey, '#fff'); put(xx + 1, ey, ink); put(xx, ey + 1, ink); put(xx + 1, ey + 1, ink); }
    else if (eyeStyle === 'dot') put(x, ey + 1, ink);
    else { put(x - 1, ey + 1, ink); put(x, ey, ink); put(x + 1, ey + 1, ink); }
  }

  const my = sp.mouth;
  if (sp.beak) { put(5, my - 1, hsl(35, 95, 55)); put(6, my - 1, hsl(35, 95, 55)); put(5, my, hsl(25, 90, 45)); put(6, my, hsl(25, 90, 45)); }
  else if (sp.square) { [4, 5, 6, 7].forEach((x) => put(x, my, x === 5 || x === 6 ? accent : ink)); }
  else if (sp.snout) { put(5, my, glow); put(6, my, glow); put(5, my - 1, ink); put(6, my - 1, ink); }
  else {
    const mouth = pick(r, ['smile', 'smile', 'open', 'flat', 'cat', 'none']);
    if (mouth === 'smile') { put(4, my - 1, ink); put(5, my, ink); put(6, my, ink); put(7, my - 1, ink); }
    if (mouth === 'open') { put(5, my, ink); put(6, my, ink); put(5, my + 1, hsl(350, 70, 60)); put(6, my + 1, hsl(350, 70, 60)); }
    if (mouth === 'flat') { put(5, my, ink); put(6, my, ink); }
    if (mouth === 'cat') { put(4, my, ink); put(5, my - 1, ink); put(6, my - 1, ink); put(7, my, ink); }
  }
  if (r() < 0.6 && !sp.square) { const ck = hsl(350, 85, 75); put(ex[0] - 1, ey + 2, ck); put(ex[1] + 1, ey + 2, ck); }

  // background: soft tile with a sparse pixel pattern
  const dots = [];
  for (let i = 0; i < 8; i++) dots.push(`<rect x="${Math.floor(r() * 16) - 1}" y="${Math.floor(r() * 16) - 1}" width="1" height="1" fill="${bgDot}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 16 16" shape-rendering="crispEdges"><rect x="-1" y="-1" width="16" height="16" fill="${bg}"/>${dots.join('')}${px.join('')}</svg>`;
}

const cache = new Map();
export function generatedSrc(seed) {
  const key = String(seed || '?');
  if (cache.has(key)) return cache.get(key);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(draw(key));
  if (cache.size > 500) cache.clear();
  cache.set(key, url);
  return url;
}

export function avatarSrc(avatar, fallbackSeed) {
  if (typeof avatar === 'string') {
    if (avatar.startsWith('g:')) return generatedSrc(avatar.slice(2, 80));
    if (avatar.startsWith('data:image/')) return avatar;
  }
  return generatedSrc(fallbackSeed);
}

export const randomSeeds = (n) => Array.from({ length: n }, () => Math.random().toString(36).slice(2, 9));
