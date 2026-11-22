import { morseMap } from '../data/courses';
let context: AudioContext | undefined;
const playing = new Set<OscillatorNode>();
let playbackGeneration = 0;
/** Cancel scheduled playback before another prompt or when audio is switched off. */
export function stopMorse(): void {
  playbackGeneration++;
  for (const oscillator of playing) {
    try { oscillator.stop(); } catch { /* already stopped */ }
  }
  playing.clear();
}
/** International Morse timing: dit = 1, dah = 3, element gap = 1, letter gap = 3, word gap = 7. */
export async function playMorse(message: string, wpm = 18, volume = 100): Promise<void> {
  stopMorse();
  const generation = playbackGeneration;
  if (typeof window === 'undefined' || !window.AudioContext) return;
  context ??= new window.AudioContext();
  if (context.state === 'suspended') {
    try { await context.resume(); } catch { return; }
  }
  if (generation !== playbackGeneration) return;
  const unit = 1.2 / Math.max(5,Math.min(30,wpm));
  const amplitude = 0.13 * Math.max(0,Math.min(100,volume)) / 100;
  if (!amplitude) return;
  let at = context.currentTime + 0.04;
  const words = message.toUpperCase().trim().split(/\s+/).filter(Boolean);
  words.forEach((word, wordIndex) => {
    const chars = [...word].filter(ch => morseMap[ch]);
    chars.forEach((char, charIndex) => {
      const marks = morseMap[char];
      [...marks].forEach((mark, markIndex) => {
        const duration = mark === '-' ? 3 * unit : unit;
        const oscillator = context!.createOscillator();
        const gain = context!.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = 650;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(amplitude, at + 0.005);
        gain.gain.setValueAtTime(amplitude, at + Math.max(0.006, duration - 0.005));
        gain.gain.linearRampToValueAtTime(0, at + duration);
        oscillator.connect(gain); gain.connect(context!.destination);
        oscillator.onended = () => { playing.delete(oscillator); gain.disconnect(); oscillator.disconnect(); };
        playing.add(oscillator);
        oscillator.start(at); oscillator.stop(at + duration + 0.01);
        at += duration;
        if (markIndex < marks.length - 1) at += unit;
      });
      if (charIndex < chars.length - 1) at += 3 * unit;
    });
    if (wordIndex < words.length - 1) at += 7 * unit;
  });
}
