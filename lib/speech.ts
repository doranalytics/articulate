// Keyless speech capture: the browser's SpeechRecognition does transcription,
// a WebAudio analyser watches the mic level for pause detection and the
// orb's level ring. Nothing leaves the page except what the browser's own
// speech service does with audio — no app API keys anywhere.

export interface SpeechSession {
  stop: () => void;
}

export interface SpeechCallbacks {
  onTranscript: (finalText: string, interimText: string) => void;
  onLevel: (level: number) => void; // 0..1 smoothed mic level
  onLongPause: () => void; // silence > 700ms after speech began
  onEnd: () => void;
  onError: (message: string) => void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

export function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export async function startSpeech(cb: SpeechCallbacks): Promise<SpeechSession> {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as RecognitionCtor | undefined;
  if (!Ctor) throw new Error("This browser can't listen — use Chrome, Edge, or Safari.");

  // Mic stream for the level meter / pause detector.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  let stopped = false;
  let spokeYet = false;
  let silenceMs = 0;
  let pauseFired = false;
  let smoothed = 0;
  let lastTick = performance.now();

  const tick = () => {
    if (stopped) return;
    analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const level = Math.min(1, sum / buf.length / 90);
    smoothed = smoothed * 0.7 + level * 0.3;
    cb.onLevel(smoothed);

    const now = performance.now();
    const dt = now - lastTick;
    lastTick = now;
    if (smoothed > 0.14) {
      spokeYet = true;
      silenceMs = 0;
      pauseFired = false;
    } else if (spokeYet) {
      silenceMs += dt;
      if (silenceMs > 700 && !pauseFired) {
        pauseFired = true;
        cb.onLongPause();
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";

  let finalText = "";
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    cb.onTranscript(finalText, interim);
  };
  rec.onerror = (e) => {
    if (stopped) return;
    if (e.error === "no-speech") return; // it restarts below via onend
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      cb.onError("Microphone permission denied — allow the mic and try again.");
    }
  };
  rec.onend = () => {
    // Chrome ends recognition on its own timeouts; keep it alive until we stop.
    if (!stopped) {
      try {
        rec.start();
      } catch {
        cb.onEnd();
      }
    }
  };
  rec.start();

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      try {
        rec.onend = null;
        rec.stop();
      } catch {}
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
      cb.onEnd();
    },
  };
}
