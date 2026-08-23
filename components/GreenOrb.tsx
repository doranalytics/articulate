"use client";
// The articulate orb — same species as the cortex orb (one-quad WebGL
// fragment shader, fake-3D lit sphere, ridged-noise filaments, breathing),
// recolored phthalo green with gold filament light. `energy` drives it:
// ~0.15 idle, mic level while listening, ~0.9 while grading. Falls back to
// the CSS gradient when WebGL is unavailable or motion is reduced.
import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy; // 0..1
uniform float u_tap;    // click flash, decays in JS

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash33(i + vec3(0,0,0)), vec3(1)) / 3.0;
  float b = dot(hash33(i + vec3(1,0,0)), vec3(1)) / 3.0;
  float c = dot(hash33(i + vec3(0,1,0)), vec3(1)) / 3.0;
  float d = dot(hash33(i + vec3(1,1,0)), vec3(1)) / 3.0;
  float e = dot(hash33(i + vec3(0,0,1)), vec3(1)) / 3.0;
  float g = dot(hash33(i + vec3(1,0,1)), vec3(1)) / 3.0;
  float h = dot(hash33(i + vec3(0,1,1)), vec3(1)) / 3.0;
  float k = dot(hash33(i + vec3(1,1,1)), vec3(1)) / 3.0;
  return mix(mix(mix(a,b,u.x), mix(c,d,u.x), u.y),
             mix(mix(e,g,u.x), mix(h,k,u.x), u.y), u.z);
}
// Ridged fbm — filaments, not clouds.
float veins(vec3 p) {
  float v = 0.0, amp = 0.55, freq = 1.0;
  for (int i = 0; i < 4; i++) {
    v += amp * (1.0 - abs(noise(p * freq) * 2.0 - 1.0));
    freq *= 2.1;
    amp *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / min(u_res.x, u_res.y);
  float r = length(uv);
  float R = 0.72;
  float speed = 0.25 + u_energy * 0.9;
  float t = u_time * speed;
  float breath = 1.0 + 0.035 * sin(u_time * 1.4) * (1.0 - u_energy * 0.5);
  float rr = r / (R * breath);

  vec3 deep    = vec3(0.015, 0.075, 0.045);
  vec3 emerald = vec3(0.10, 0.52, 0.31);
  vec3 gold    = vec3(0.78, 0.64, 0.28);
  vec3 hot     = vec3(0.85, 1.0, 0.92);

  vec3 col = vec3(0.0);

  if (rr < 1.0) {
    float z = sqrt(1.0 - rr * rr);
    vec3 n = vec3(uv / (R * breath), z);
    float ang = t * 0.5;
    mat3 rot = mat3(cos(ang), 0.0, sin(ang), 0.0, 1.0, 0.0, -sin(ang), 0.0, cos(ang));
    vec3 p = rot * n;

    float f1 = veins(p * 2.6 + vec3(0.0, t * 0.12, 0.0));
    float f2 = veins(p * 5.2 - vec3(t * 0.07, 0.0, t * 0.05));
    float fil = pow(max(f1 * 0.62 + f2 * 0.55 - 0.55, 0.0), 1.7);

    float sp = noise(p * 14.0 + vec3(0.0, 0.0, t * 1.7));
    float spark = smoothstep(0.78, 0.95, sp) * (0.5 + 0.5 * sin(u_time * 6.0 + sp * 40.0));

    float light = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.35, 0.5, 0.75))), 0.0);
    float fresnel = pow(1.0 - z, 2.2);

    vec3 filament = mix(emerald, gold, 0.42 + 0.42 * sin(f1 * 6.0 + t));
    col = deep * light;
    col += filament * fil * (0.85 + 1.9 * u_energy);
    col += hot * spark * (0.22 + 0.7 * u_energy);
    col += mix(emerald, gold, 0.35) * fresnel * (0.55 + 0.7 * u_energy);
    col += hot * u_tap * pow(z, 2.0) * 0.8;

    col *= smoothstep(1.0, 0.985, rr);
  }

  float alpha = smoothstep(1.0, 0.985, rr);
  gl_FragColor = vec4(col * 1.07 * alpha, alpha);
}
`;

export function GreenOrb({
  energy,
  size = 200,
  onClick,
  label,
  ariaLabel,
}: {
  /** 0..1 — idle breathing → full speaking blaze. */
  energy: number;
  size?: number;
  onClick?: () => void;
  label?: string;
  ariaLabel?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLSpanElement>(null);
  const state = useRef({ energy: 0.15, target: 0.15, tap: 0 });
  state.current.target = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      canvas.style.display = "none";
      return;
    }
    const gl = canvas.getContext("webgl", { antialias: size < 120, alpha: true, premultipliedAlpha: true });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uEnergy = gl.getUniformLocation(prog, "u_energy");
    const uTap = gl.getUniformLocation(prog, "u_tap");
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (fallbackRef.current) fallbackRef.current.style.display = "none";

    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      const s = state.current;
      s.energy += (s.target - s.energy) * 0.06;
      s.tap *= 0.92;
      gl.uniform1f(uTime, (now - t0) / 1000);
      gl.uniform1f(uEnergy, s.energy);
      gl.uniform1f(uTap, s.tap);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [size]);

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? label ?? "articulate"}
      onClick={() => {
        state.current.tap = 1;
        onClick?.();
      }}
      className={`relative block select-none rounded-full transition-transform active:scale-95 ${onClick ? "cursor-pointer" : "cursor-default"}`}
      style={{ width: size, height: size }}
    >
      {/* CSS fallback — hidden as soon as WebGL initializes */}
      <span
        ref={fallbackRef}
        aria-hidden
        className="orb absolute inset-[10%] block rounded-full"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: size, height: size }} />
      {label && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12px] font-medium uppercase tracking-[0.22em] text-white/85">
          {label}
        </span>
      )}
    </button>
  );
}
