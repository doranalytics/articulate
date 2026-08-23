"use client";

// The green orb — the app's one glowing thing. Idle it breathes; listening
// it breathes fast and wears a live mic-level ring.

export function Orb({ size = 120, listening = false, level = 0, onClick, label }: {
  size?: number;
  listening?: boolean;
  level?: number;
  onClick?: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label ?? (listening ? "Stop and grade" : "Start speaking")}
      className="group relative flex items-center justify-center outline-none"
      style={{ width: size + 40, height: size + 40 }}
    >
      {listening && (
        <span
          className="level-ring"
          style={{ transform: `scale(${1 + level * 0.45})`, opacity: 0.25 + level * 0.6 }}
        />
      )}
      <span
        className={`orb block transition-transform group-active:scale-95 ${listening ? "listening" : ""}`}
        style={{ width: size, height: size }}
      />
      {label && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] font-medium tracking-[0.18em] text-white/90 uppercase">
          {label}
        </span>
      )}
    </button>
  );
}
