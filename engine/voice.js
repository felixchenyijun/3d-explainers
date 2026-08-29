// voice.js — narration through the browser's built-in speech synthesis.
//
// No audio files and no network: every platform ships voices, and the film
// already has its narration written down as beats. The work here is making it
// sound like prose rather than a screen reader:
//
//   - beat HTML is stripped, and symbols that only make sense to the eye
//     (5′→3′, α, µm, ~) are rewritten into words
//   - long paragraphs are split into sentences and queued separately, because
//     Chrome silently truncates utterances past ~15 seconds
//   - the speaking rate is fitted to the time until the next beat, so narration
//     lands with the animation instead of running over it
//   - rate tracks the film's own playback speed

export const GENERIC = [
  [/<[^>]+>/g, ' '],                    // beats carry markup
  [/&nbsp;/g, ' '], [/&amp;/g, ' and '], [/&[a-z]+;/g, ' '],
  [/(\d)\s*′\s*→\s*(\d)\s*′/g, '$1 prime to $2 prime'],
  [/(\d)\s*′/g, '$1 prime'],
  [/↔/g, ' pairs with '], [/→/g, ' to '], [/←/g, ' from '],
  [/×/g, ' times '], [/~/g, 'about '], [/≈/g, 'about '],
  [/(µ|μ)m\b/g, ' micrometres '], [/\bnm\b/g, ' nanometres '],
  [/µ|μ/g, 'micro'], [/°/g, ' degrees '],
  [/α/g, 'alpha '], [/β/g, 'beta '],
  [/₀/g, ' zero '], [/₁/g, ' one '], [/₂/g, ' two '], [/₃/g, ' three '], [/₄/g, ' four '],
  [/[—–]/g, ', '], [/["“”]/g, ''],
  [/\s+/g, ' '],
];

export function applyRules(text, rules) {
  return rules.reduce((s, [re, to]) => s.replace(re, to), text).trim();
}

const SENTENCE = /[^.!?]+[.!?]*/g;

export function createVoice({
  lang = 'en-GB',
  preferred = [],
  normalize = null,          // project hook, applied after the generic rules
  wordsPerSecond = 2.9,      // roughly 175 wpm, the default for system voices
  minRate = 0.92,
  maxRate = 1.5,
  storageKey = 'film:voice',
} = {}) {
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  let voice = null, enabled = false, watchdog = null;

  if (synth) {
    const pick = () => {
      const all = synth.getVoices();
      if (!all.length) return;
      for (const want of preferred) {
        const hit = all.find(v => v.name.toLowerCase().startsWith(want.toLowerCase()));
        if (hit) { voice = hit; return; }
      }
      voice = all.find(v => v.lang === lang && v.localService)
           || all.find(v => v.lang.startsWith(lang.slice(0, 2)) && v.localService)
           || all.find(v => v.lang.startsWith(lang.slice(0, 2)))
           || all[0];
    };
    pick();
    synth.addEventListener('voiceschanged', pick);
    try { enabled = localStorage.getItem(storageKey) !== 'off'; } catch { enabled = true; }
  }

  const prepare = (text) => {
    let s = applyRules(text, GENERIC);
    if (normalize) s = normalize(s);
    return s.replace(/\s+([,.;:])/g, '$1').replace(/\s+/g, ' ').trim();
  };

  // Chrome stops speaking after ~15s unless it is nudged.
  function startWatchdog() {
    stopWatchdog();
    watchdog = setInterval(() => {
      if (!synth.speaking || synth.paused) return;
      synth.pause(); synth.resume();
    }, 9000);
  }
  function stopWatchdog() { if (watchdog) { clearInterval(watchdog); watchdog = null; } }

  function cancel() {
    if (!synth) return;
    stopWatchdog();
    synth.cancel();
  }

  /**
   * @param text     raw beat text (HTML allowed)
   * @param seconds  wall-clock seconds before the next beat (already adjusted
   *                 for playback speed), or Infinity to just read it
   * @param queue    append rather than interrupt. A beat that runs long then
   *                 pushes the next one later instead of being cut mid-sentence;
   *                 the chapter is sized to the whole narration, so it drains.
   */
  function speak(text, seconds = Infinity, { queue = false } = {}) {
    if (!synth || !enabled || !text) return;
    if (!queue) cancel();
    const spoken = prepare(text);
    if (!spoken) return;

    const words = spoken.split(' ').length;
    const need = words / wordsPerSecond;
    let rate = Number.isFinite(seconds) && seconds > 0.5 ? need / seconds : 1;
    rate = Math.min(maxRate, Math.max(minRate, rate));

    for (const chunk of spoken.match(SENTENCE) || [spoken]) {
      const part = chunk.trim();
      if (!part) continue;
      const u = new SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      u.lang = voice?.lang || lang;
      u.rate = Math.min(4, Math.max(0.1, rate));
      u.pitch = 1;
      synth.speak(u);
    }
    if (!watchdog) startWatchdog();
  }

  return {
    speak, cancel,
    pause() { if (synth && synth.speaking) { stopWatchdog(); synth.pause(); } },
    resume() { if (synth && synth.paused) { synth.resume(); startWatchdog(); } },
    get available() { return !!synth; },
    get enabled() { return enabled; },
    get voiceName() { return voice?.name || null; },
    setEnabled(v) {
      enabled = !!v;
      try { localStorage.setItem(storageKey, enabled ? 'on' : 'off'); } catch { /* private mode */ }
      if (!enabled) cancel();
    },
    // exposed for testing: what would actually be spoken
    preview: prepare,
    // seconds this text needs at rate 1
    estimate(text) { const s = prepare(text); return s ? s.split(' ').length / wordsPerSecond : 0; },
  };
}
