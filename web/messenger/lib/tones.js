// Ringtones and blips made with WebAudio (no sound files to fetch).
let ctx = null;
let loop = null;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone(freqs, start, dur, gain = 0.08) {
  const c = ac();
  const g = c.createGain();
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.setValueAtTime(gain, start + dur - 0.05);
  g.gain.linearRampToValueAtTime(0, start + dur);
  g.connect(c.destination);
  for (const f of freqs) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start(start);
    o.stop(start + dur + 0.02);
  }
}

function repeat(pattern, every) {
  stopTones();
  const play = () => { try { const t = ac().currentTime + 0.02; pattern(t); } catch {} };
  play();
  loop = setInterval(play, every);
}

// incoming: a soft rising three-note chime
export const ring = () => repeat((t) => { tone([659], t, 0.16, 0.09); tone([784], t + 0.18, 0.16, 0.09); tone([988], t + 0.36, 0.32, 0.09); }, 2200);
// outgoing: two quiet pulses while you wait
export const ringback = () => repeat((t) => { tone([440, 480], t, 0.9, 0.035); }, 3200);
export function stopTones() { clearInterval(loop); loop = null; }
export function blip(down = false) {
  try {
    const t = ac().currentTime + 0.01;
    if (down) { tone([660], t, 0.1, 0.05); tone([440], t + 0.11, 0.14, 0.05); }
    else { tone([880], t, 0.08, 0.04); tone([1320], t + 0.08, 0.1, 0.03); }
  } catch {}
}
