"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Insight, TribeTimestep } from "@/lib/types";
import tribeData from "@/data/tribe_1984.json";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bgVoid:        "#0A0A0B",
  bgSurface:     "#131316",
  bgInset:       "#1C1C20",
  borderHair:    "#24242A",
  borderActive:  "#3A3A44",
  textPrimary:   "#F2F0EA",
  textSecondary: "#8A8A92",
  textTertiary:  "#4E4E56",
  signal:        "#E8E3D4",
  peak:          "#B8E0C2",
  warn:          "#E8B5A0",
  scan:          "#7A9BB8",
} as const;

const FONT_SERIF = "var(--font-serif), 'Georgia', serif";
const FONT_MONO  = "var(--font-mono), 'JetBrains Mono', 'SF Mono', monospace";
const FONT_BODY  = "var(--font-body), 'Inter', sans-serif";

// ─── Constants ────────────────────────────────────────────────────────────────

const ASCII_CHARS = " .·:-=+*#%@";
const BRAIN_COLS  = 54;
const BRAIN_ROWS  = 22;
const TOTAL_FRAMES = 60; // 60fps-worth at 10fps = 6s loop

const LOADING_STEPS = [
  { label: "extracting video frames",       duration: 1200 },
  { label: "encoding audio stream",         duration: 1500 },
  { label: "running visual cortex model",   duration: 2500 },
  { label: "mapping brain region activity", duration: 2000 },
  { label: "rendering neural timeline",     duration: 1800 },
  { label: "preparing your insights",       duration: 1000 },
] as const;

const POETIC_MESSAGES = [
  "listening to the occipital lobe...",
  "asking the reward system what it saw...",
  "measuring the space between intention and response...",
  "tracing the path from retina to recognition...",
  "watching the fusiform gyrus recognize a face...",
  "counting the milliseconds of unconscious attention...",
  "mapping where the brain stopped caring...",
  "reading the signature of surprise...",
  "following the cascade from visual cortex to meaning...",
  "noting where the narrative broke through...",
  "observing the prefrontal cortex weigh what it felt...",
  "cataloguing moments the brain chose to remember...",
  "finding the gap between what was shown and what was felt...",
  "decoding the emotional residue of motion...",
  "listening for the quiet moments between peaks...",
  "tracing the arc of arousal through time...",
  "watching attention rise and fall like breath...",
  "reading the delta between expectation and event...",
];

type AppState = "upload" | "loading" | "results";

// ─── ASCII Brain Generator ────────────────────────────────────────────────────
//
// Analytical ray–ellipsoid intersection for two brain hemispheres.
// For each pixel (sx, sy) we rotate the view ray by angle θ (Y-axis),
// find the front surface z, shade by depth + gyri noise.

function generateBrainFrames(totalFrames: number): string[] {
  const frames: string[] = [];

  // Returns front-surface z (in view space) for an ellipsoid centered at (cx,0,0)
  // with semi-axes (a, b, c) rotated by (cosA, sinA) around Y.
  function frontZ(
    sx: number, sy: number,
    cx: number, a: number, b: number, c: number,
    cosA: number, sinA: number
  ): number {
    // In world space: wx = sx·cosA + z·sinA – cx
    //                 wy = sy
    //                 wz = –sx·sinA + z·cosA
    // Ellipsoid: wx²/a² + wy²/b² + wz²/c² = 1  →  quadratic in z
    const u  = sx * cosA - cx;
    const w0 = -sx * sinA;

    const A = sinA * sinA / (a * a) + cosA * cosA / (c * c);
    const B = 2 * (u * sinA / (a * a) + w0 * cosA / (c * c));
    const Cv = u * u / (a * a) + sy * sy / (b * b) + w0 * w0 / (c * c) - 1;

    const disc = B * B - 4 * A * Cv;
    if (disc < 0) return -Infinity;
    return (-B + Math.sqrt(disc)) / (2 * A); // front (max z)
  }

  for (let f = 0; f < totalFrames; f++) {
    const angle = (f / totalFrames) * Math.PI * 2;
    const cosA  = Math.cos(angle);
    const sinA  = Math.sin(angle);

    const lines: string[] = [];
    for (let r = 0; r < BRAIN_ROWS; r++) {
      let line = "";
      for (let c = 0; c < BRAIN_COLS; c++) {
        // Normalise; correct for monospace character aspect ratio (~0.55 w/h)
        const sx = (c / (BRAIN_COLS - 1)) * 2 - 1;
        const sy = ((r / (BRAIN_ROWS - 1)) * 2 - 1) * 1.7;

        // Left and right hemispheres
        const z1 = frontZ(sx, sy, -0.26, 0.54, 0.70, 0.76, cosA, sinA);
        const z2 = frontZ(sx, sy,  0.26, 0.54, 0.70, 0.76, cosA, sinA);

        const z = Math.max(
          isFinite(z1) ? z1 : -Infinity,
          isFinite(z2) ? z2 : -Infinity
        );

        if (isFinite(z) && z > -2 && z < 2) {
          // World-space coords for texture
          const wx = sx * cosA + z * sinA;
          const wz = -sx * sinA + z * cosA;
          const wy = sy;

          // Gyri wrinkle noise
          const gyri =
            0.09 * Math.sin(wx * 9 + wz * 4) * Math.cos(wy * 6) +
            0.04 * Math.sin(wx * 5 - wy * 8);

          const lum = Math.max(0, Math.min(1, (z + 1) / 2 + gyri));
          const idx = Math.max(1, Math.min(
            ASCII_CHARS.length - 1,
            Math.round(lum * (ASCII_CHARS.length - 2)) + 1
          ));
          line += ASCII_CHARS[idx];
        } else {
          line += " ";
        }
      }
      lines.push(line);
    }
    frames.push(lines.join("\n"));
  }
  return frames;
}

// ─── ASCII Brain Component ────────────────────────────────────────────────────

function ASCIIBrain({
  frames,
  fps = 10,
  pulse = false,
  fontSize = "9px",
}: {
  frames: string[];
  fps?: number;
  pulse?: boolean;
  fontSize?: string;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % frames.length), 1000 / fps);
    return () => clearInterval(t);
  }, [frames, fps]);

  return (
    <pre
      style={{
        fontFamily: FONT_MONO,
        fontSize,
        lineHeight: "1.0",
        letterSpacing: "0px",
        color: pulse ? C.scan : C.textTertiary,
        margin: 0,
        padding: 0,
        userSelect: "none",
        transition: "color 400ms linear",
      }}
    >
      {frames[idx]}
    </pre>
  );
}

// ─── Shared: Status Bar ───────────────────────────────────────────────────────

function StatusBar({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        height: "32px",
        background: C.bgSurface,
        borderTop: `1px solid ${C.borderHair}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, flex: 1 }}>
        {left}
      </span>
      <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>
        {right}
      </span>
    </div>
  );
}

function TopBar({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div
      style={{
        height: "36px",
        background: C.bgSurface,
        borderBottom: `1px solid ${C.borderHair}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        flexShrink: 0,
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textSecondary }}>
        {left}
      </div>
      <div style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>
        {right ?? "⚙"}
      </div>
    </div>
  );
}

// ─── Upload View ──────────────────────────────────────────────────────────────

function UploadView({ onFile, frames }: { onFile: (file: File) => void; frames: string[] }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bgVoid }}>
      <TopBar left="NEUROSCAN  /  v0.1" right="[config]  ⚙" />

      {/* Center */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "36px",
          padding: "40px 20px",
        }}
      >
        {/* ASCII brain — static, dim */}
        <div style={{ opacity: 0.35, pointerEvents: "none" }}>
          <ASCIIBrain frames={frames} fps={2} fontSize="9px" />
        </div>

        {/* Hero serif headline */}
        <h1
          style={{
            fontFamily: FONT_SERIF,
            fontSize: "clamp(36px, 5vw, 64px)",
            fontWeight: 400,
            color: C.textPrimary,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            margin: 0,
            textAlign: "center",
            textShadow: `0 0 18px rgba(242, 240, 234, 0.35)`,
          }}
        >
          What does this video
          <br />
          do to a brain?
        </h1>

        {/* Drop zone */}
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            width: "480px",
            maxWidth: "90vw",
            height: "220px",
            background: C.bgInset,
            border: `1px ${dragging ? "solid" : "dashed"} ${dragging ? C.signal : C.borderHair}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            cursor: "pointer",
            transition: "border 200ms, background 200ms",
            ...(dragging ? { background: "rgba(232,227,212,0.025)" } : {}),
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*,.mov,.mp4"
            style={{ display: "none" }}
            onChange={handleChange}
          />
          <span style={{ fontFamily: FONT_MONO, fontSize: "13px", color: C.textSecondary }}>
            drop .mov here
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>
            or click to select
          </span>
        </div>
      </div>

      <StatusBar left="─ status: idle" right="model: tribe v2 ─" />
    </div>
  );
}

// ─── Loading View ─────────────────────────────────────────────────────────────

function LoadingView({ onComplete, frames }: { onComplete: () => void; frames: string[] }) {
  const [completedSteps, setCompletedSteps]   = useState<number[]>([]);
  const [stepTimes, setStepTimes]             = useState<Record<number, string>>({});
  const [elapsedMs, setElapsedMs]             = useState(0);
  const [poeticMsg, setPoeticMsg]             = useState(POETIC_MESSAGES[0]);
  const [poeticKey, setPoeticKey]             = useState(0);
  const [pulse, setPulse]                     = useState(false);
  const hasCompleted = useRef(false);
  const startTime    = useRef(Date.now());

  const fmtMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min  = Math.floor(totalSec / 60);
    const sec  = totalSec % 60;
    const milli = ms % 1000;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  };

  // Elapsed ticker
  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startTime.current), 50);
    return () => clearInterval(id);
  }, []);

  // Step completion schedule
  useEffect(() => {
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    LOADING_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        const ms = Date.now() - startTime.current;
        setStepTimes((prev) => ({ ...prev, [i]: fmtMs(ms) }));
        setCompletedSteps((prev) => [...prev, i]);
        setPulse(true);
        setTimeout(() => setPulse(false), 400);
      }, acc + step.duration);
      timers.push(t);
      acc += step.duration;
    });

    const done = setTimeout(() => {
      if (!hasCompleted.current) {
        hasCompleted.current = true;
        onComplete();
      }
    }, acc + 800);
    timers.push(done);

    return () => timers.forEach(clearTimeout);
  }, [onComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poetic message cycle
  useEffect(() => {
    let idx = 1;
    const id = setInterval(() => {
      setPoeticMsg(POETIC_MESSAGES[idx % POETIC_MESSAGES.length]);
      setPoeticKey((k) => k + 1);
      idx++;
    }, 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bgVoid }}>
      <TopBar left="NEUROSCAN  /  v0.1" />

      {/* Split 60/40 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left 60%: rotating ASCII brain */}
        <div
          style={{
            width: "60%",
            borderRight: `1px solid ${C.borderHair}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ASCIIBrain frames={frames} fps={10} pulse={pulse} fontSize="10px" />
        </div>

        {/* Right 40%: checklist + poetic message */}
        <div
          style={{
            width: "40%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "48px 52px",
            gap: "40px",
          }}
        >
          {/* IDE checklist */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {LOADING_STEPS.map((step, i) => {
              const done   = completedSteps.includes(i);
              const active = !done && (i === 0 || completedSteps.includes(i - 1));
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: "10px",
                    opacity: done || active ? 1 : 0.3,
                    transition: "opacity 300ms",
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "12px",
                      color: done ? C.peak : active ? C.textPrimary : C.textTertiary,
                      flexShrink: 0,
                    }}
                  >
                    {done ? "[✓]" : active ? "[▸]" : "[ ]"}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "12px",
                      color: done ? C.textSecondary : active ? C.textPrimary : C.textTertiary,
                      flex: 1,
                    }}
                  >
                    {step.label}
                    {active && (
                      <span
                        style={{ color: C.scan, animation: "blink 1s step-start infinite" }}
                      >
                        _
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, flexShrink: 0 }}>
                    {done ? stepTimes[i] ?? "—" : active ? fmtMs(elapsedMs) : "—"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Poetic status message */}
          <div style={{ height: "22px", overflow: "hidden" }}>
            <span
              key={poeticKey}
              style={{
                fontFamily: FONT_SERIF,
                fontStyle: "italic",
                fontSize: "14px",
                color: C.textSecondary,
                display: "inline-block",
                animation: "fade-cycle 3.2s ease-in-out forwards",
              }}
            >
              {poeticMsg}
            </span>
          </div>
        </div>
      </div>

      <StatusBar left={`─ demo_video.mov`} right={`elapsed: ${fmtMs(elapsedMs)}  model: tribe v2 ─`} />
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────

function ResultsView({
  videoUrl,
  insights,
  isStreaming,
  fileName,
}: {
  videoUrl: string;
  insights: Insight[];
  isStreaming: boolean;
  fileName: string;
}) {
  const videoRef       = useRef<HTMLVideoElement>(null);
  const timelineRef    = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);

  // Active insight index synced to video time
  const activeIdx = insights.reduce((best, ins, i) => {
    if (ins.timestamp_sec <= currentTime) return i;
    return best;
  }, -1);

  // Nearest tribe timestep for brain data
  const tribeStep = (tribeData as TribeTimestep[]).reduce(
    (best: TribeTimestep | null, t) => (t.timestamp_sec <= currentTime ? t : best),
    null
  );

  // Computed scores (memoised — tribe data is static)
  const attentionScore = useMemo(() => {
    const data = tribeData as TribeTimestep[];
    if (!data.length) return 74;
    const avg = data.reduce((s, ts) => s + (ts.rois[0]?.activation ?? 0), 0) / data.length;
    return Math.round(avg * 100);
  }, []);

  const peakTs = useMemo(() => {
    const data = tribeData as TribeTimestep[];
    return data.reduce(
      (best, ts) => ((ts.rois[0]?.activation ?? 0) > (best.rois[0]?.activation ?? 0) ? ts : best),
      data[0]
    );
  }, []);

  const dropTs = useMemo(() => {
    const data = tribeData as TribeTimestep[];
    return data.reduce(
      (worst, ts) => ((ts.rois[0]?.activation ?? 0) < (worst.rois[0]?.activation ?? 0) ? ts : worst),
      data[0]
    );
  }, []);

  // Single-row activation strip
  const activationStrip = useMemo(() => {
    return (tribeData as TribeTimestep[])
      .map((ts) => {
        const lum = ts.rois[0]?.activation ?? 0;
        const idx = Math.round(lum * (ASCII_CHARS.length - 1));
        return ASCII_CHARS[Math.max(0, Math.min(ASCII_CHARS.length - 1, idx))];
      })
      .join("");
  }, []);

  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const blockBar = (act: number) => {
    const filled = Math.round(act * 8);
    return "█".repeat(filled) + "░".repeat(8 - filled);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeInsight = activeIdx >= 0 ? insights[activeIdx] : null;

  const seekTo = useCallback((sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play();
    }
  }, []);

  // Auto-scroll active timeline card
  useEffect(() => {
    if (activeIdx >= 0 && timelineRef.current) {
      const cards = timelineRef.current.querySelectorAll("[data-card]");
      const card = cards[activeIdx] as HTMLElement;
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bgVoid, overflow: "hidden" }}>
      {/* Top bar */}
      <div
        style={{
          height: "36px",
          background: C.bgSurface,
          borderBottom: `1px solid ${C.borderHair}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontFamily: FONT_MONO, fontSize: "11px" }}>
          <span style={{ color: C.textSecondary }}>NEUROSCAN</span>
          <span style={{ color: C.textTertiary }}>/</span>
          <span style={{ color: C.textTertiary }}>{fileName || "demo_video.mov"}</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {[["[re-analyze]"], ["[export ↓]"]].map(([label]) => (
            <button
              key={label}
              style={{
                fontFamily: FONT_MONO,
                fontSize: "11px",
                color: C.textSecondary,
                background: C.bgInset,
                border: `1px solid ${C.borderHair}`,
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Three-pane body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── Left rail: Timeline ── */}
        <div
          style={{
            width: "196px",
            flexShrink: 0,
            borderRight: `1px solid ${C.borderHair}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: `1px solid ${C.borderHair}`,
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.08em" }}>
              TIMELINE
            </span>
          </div>

          <div ref={timelineRef} style={{ flex: 1, overflowY: "auto" }}>
            {insights.map((ins, i) => {
              const isActive = i === activeIdx;
              const step = (tribeData as TribeTimestep[]).find(
                (t) => t.timestamp_sec === ins.timestamp_sec
              );
              const act = step?.rois[0]?.activation ?? 0;
              return (
                <div
                  key={i}
                  data-card=""
                  onClick={() => seekTo(ins.timestamp_sec)}
                  style={{
                    height: "72px",
                    padding: "10px 14px 10px 16px",
                    cursor: "pointer",
                    borderLeft: `2px solid ${isActive ? C.signal : "transparent"}`,
                    background: isActive ? C.bgSurface : "transparent",
                    borderBottom: `1px solid ${C.borderHair}`,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    transition: "background 200ms, border-color 200ms",
                  }}
                >
                  <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>
                    {fmt(ins.timestamp_sec)}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "11px",
                      color: act > 0.65 ? C.peak : act < 0.35 ? C.warn : C.textSecondary,
                    }}
                  >
                    {blockBar(act)}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_SERIF,
                      fontSize: "13px",
                      color: C.textPrimary,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ins.top_regions[0]}
                  </span>
                </div>
              );
            })}

            {isStreaming && (
              <div style={{ padding: "14px 16px", fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>
                streaming
                <span style={{ color: C.scan, animation: "blink 1s step-start infinite" }}>_</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Center stage: Video + Arc ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {/* Video player */}
          <div style={{ flex: "0 0 52%", padding: "12px", overflow: "hidden" }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              style={{
                width: "100%",
                height: "100%",
                background: "#000",
                objectFit: "contain",
                display: "block",
              }}
              onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
              onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
            />
          </div>

          {/* Activation strip */}
          <div
            style={{
              flexShrink: 0,
              padding: "6px 16px 8px",
              borderTop: `1px solid ${C.borderHair}`,
              borderBottom: `1px solid ${C.borderHair}`,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <pre
              style={{
                fontFamily: FONT_MONO,
                fontSize: "9px",
                lineHeight: "1.0",
                color: C.textTertiary,
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
              }}
            >
              {activationStrip}
            </pre>
            {/* Playhead line */}
            {duration > 0 && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `calc(16px + ${progressPct * 0.88}%)`,
                  width: "1px",
                  background: C.signal,
                  opacity: 0.7,
                  pointerEvents: "none",
                }}
              />
            )}
          </div>

          {/* Emotional Arc */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <div style={{ marginBottom: "14px" }}>
              <span
                style={{
                  fontFamily: FONT_SERIF,
                  fontStyle: "italic",
                  fontSize: "22px",
                  color: C.textPrimary,
                }}
              >
                Emotional Arc
              </span>
            </div>

            <div style={{ borderTop: `1px solid ${C.borderHair}`, paddingTop: "16px" }}>
              {insights.length === 0 && isStreaming && (
                <span style={{ fontFamily: FONT_MONO, fontSize: "12px", color: C.textTertiary }}>
                  synthesizing<span style={{ color: C.scan, animation: "blink 1s step-start infinite" }}>_</span>
                </span>
              )}

              {insights.map((ins, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: "20px",
                    animation: "fade-in 0.35s ease-out both",
                    animationDelay: `${i * 60}ms`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "16px",
                      marginBottom: "6px",
                      fontFamily: FONT_MONO,
                      fontSize: "10px",
                      color: C.textTertiary,
                    }}
                  >
                    <span>{fmt(ins.timestamp_sec)}</span>
                    <span>{ins.top_regions[0]}</span>
                    {ins.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        style={{
                          border: `1px solid ${C.borderHair}`,
                          padding: "0 5px",
                          color: C.textTertiary,
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p
                    style={{
                      fontFamily: FONT_BODY,
                      fontSize: "14px",
                      lineHeight: "1.65",
                      color: C.textSecondary,
                      margin: 0,
                    }}
                  >
                    {ins.insight}
                  </p>
                  {i < insights.length - 1 && (
                    <div style={{ marginTop: "20px", borderBottom: `1px solid ${C.borderHair}` }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right rail: Inspector ── */}
        <div
          style={{
            width: "220px",
            flexShrink: 0,
            borderLeft: `1px solid ${C.borderHair}`,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 16px",
              borderBottom: `1px solid ${C.borderHair}`,
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.08em" }}>
              INSPECTOR
            </span>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {/* Scorecard number */}
            <div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "10px",
                  color: C.textTertiary,
                  letterSpacing: "0.08em",
                  marginBottom: "8px",
                }}
              >
                ATTENTION
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", lineHeight: 1 }}>
                <span
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: "88px",
                    fontWeight: 400,
                    color: C.textPrimary,
                    lineHeight: 1,
                    textShadow: `0 0 24px rgba(242, 240, 234, 0.22)`,
                  }}
                >
                  {attentionScore}
                </span>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: "14px",
                    color: C.textTertiary,
                    paddingBottom: "10px",
                  }}
                >
                  /100
                </span>
              </div>
            </div>

            {/* Key-value pairs */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                { label: "PEAK",     value: fmt(peakTs?.timestamp_sec ?? 0), color: C.peak },
                { label: "DROP",     value: fmt(dropTs?.timestamp_sec ?? 0), color: C.warn },
                { label: "DURATION", value: fmt(duration),                   color: C.textSecondary },
                { label: "INSIGHTS", value: String(insights.length),          color: C.textSecondary },
                ...(tribeStep
                  ? [{
                      label: "ACTIVE ROI",
                      value: tribeStep.rois[0]?.name?.split(" ").slice(-1)[0] ?? "—",
                      color: C.textSecondary,
                    }]
                  : []),
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary }}>
                    {label}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* Recommendation (italic serif pull-quote) */}
            <div style={{ borderTop: `1px solid ${C.borderHair}`, paddingTop: "16px" }}>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "10px",
                  color: C.textTertiary,
                  marginBottom: "10px",
                }}
              >
                ── recommended
              </div>
              <p
                style={{
                  fontFamily: FONT_SERIF,
                  fontStyle: "italic",
                  fontSize: "13px",
                  color: C.textSecondary,
                  lineHeight: 1.65,
                  margin: 0,
                }}
              >
                {activeInsight
                  ? activeInsight.insight.length > 130
                    ? activeInsight.insight.slice(0, 130) + "..."
                    : activeInsight.insight
                  : "Play the video to see region-specific analysis."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Status bar with video progress */}
      <div
        style={{
          height: "32px",
          background: C.bgSurface,
          borderTop: `1px solid ${C.borderHair}`,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: "12px",
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, whiteSpace: "nowrap" }}>
          ─ {fmt(currentTime)} / {fmt(duration)}
        </span>

        {/* Progress bar / clickable scrubber */}
        <div
          style={{
            flex: 1,
            height: "2px",
            background: C.bgInset,
            cursor: "pointer",
            position: "relative",
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            seekTo(((e.clientX - rect.left) / rect.width) * duration);
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: C.signal,
              transition: "width 0.1s linear",
            }}
          />
          {duration > 0 &&
            insights.map((ins, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${(ins.timestamp_sec / duration) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: "3px",
                  height: "3px",
                  borderRadius: "50%",
                  background: i === activeIdx ? C.signal : C.textTertiary,
                }}
              />
            ))}
        </div>

        <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, whiteSpace: "nowrap" }}>
          {activeInsight ? "peak engagement" : "idle"}
        </span>

        <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, whiteSpace: "nowrap" }}>
          {isStreaming ? (
            <>
              claude streaming{" "}
              <span style={{ color: C.scan, animation: "blink 1s step-start infinite" }}>●</span>
            </>
          ) : (
            "claude ✓"
          )}{" "}
          ─
        </span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Generate ASCII brain frames once on mount (fast: ~10ms)
  const brainFrames = useMemo(() => generateBrainFrames(TOTAL_FRAMES), []);

  const handleFile = useCallback((file: File) => {
    setVideoUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setAppState("loading");
  }, []);

  const runSynthesis = useCallback(async () => {
    setIsStreaming(true);
    setInsights([]);
    setAppState("results");

    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tribeData: tribeData as TribeTimestep[] }),
      });

      if (!res.body) throw new Error("No response body");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith("__ERROR__:")) { console.error(trimmed.slice(10)); continue; }
          try {
            const parsed = JSON.parse(trimmed) as Insight;
            setInsights((prev) => [...prev, parsed]);
          } catch {
            /* partial line — ignore */
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (!trimmed.startsWith("__ERROR__:")) {
          try {
            const parsed = JSON.parse(trimmed) as Insight;
            setInsights((prev) => [...prev, parsed]);
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      console.error("Synthesis failed:", err);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return (
    <>
      {appState === "upload"  && <UploadView  onFile={handleFile} frames={brainFrames} />}
      {appState === "loading" && <LoadingView onComplete={runSynthesis} frames={brainFrames} />}
      {appState === "results" && (
        <ResultsView
          videoUrl={videoUrl}
          insights={insights}
          isStreaming={isStreaming}
          fileName={fileName}
        />
      )}
    </>
  );
}
