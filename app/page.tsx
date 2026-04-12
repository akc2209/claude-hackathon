"use client";

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { AnalysisResult, TimelineEntry, TribeTimestep } from "@/lib/types";
import tribeData from "@/data/tribe_output.json";

const BrainViewer = lazy(() => import("./BrainViewer"));

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bgVoid: "#0A0A0B",
  bgSurface: "#131316",
  bgInset: "#1C1C20",
  borderHair: "#24242A",
  borderActive: "#3A3A44",
  textPrimary: "#F2F0EA",
  textSecondary: "#8A8A92",
  textTertiary: "#4E4E56",
  signal: "#E8E3D4",
  peak: "#B8E0C2",
  warn: "#E8B5A0",
  scan: "#7A9BB8",
} as const;

const FONT_SERIF = "var(--font-serif), 'Georgia', serif";
const FONT_MONO = "var(--font-mono), 'JetBrains Mono', 'SF Mono', monospace";
const FONT_BODY = "var(--font-body), 'Inter', sans-serif";

// ─── ASCII brain ──────────────────────────────────────────────────────────────

const ASCII_CHARS = " .·:-=+*#%@";
const BRAIN_COLS = 54;
const BRAIN_ROWS = 22;
const TOTAL_FRAMES = 60;

const LOADING_STEPS = [
  { label: "extracting video frames", duration: 1200 },
  { label: "encoding audio stream", duration: 1500 },
  { label: "running visual cortex model", duration: 2500 },
  { label: "mapping brain region activity", duration: 2000 },
  { label: "rendering neural timeline", duration: 1800 },
  { label: "preparing your insights", duration: 1000 },
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
type ResultTab = "scorecard" | "arc" | "timeline";

function generateBrainFrames(totalFrames: number): string[] {
  const frames: string[] = [];

  function frontZ(
    sx: number,
    sy: number,
    cx: number,
    a: number,
    b: number,
    c: number,
    cosA: number,
    sinA: number
  ): number {
    const u = sx * cosA - cx;
    const w0 = -sx * sinA;
    const A = (sinA * sinA) / (a * a) + (cosA * cosA) / (c * c);
    const B = 2 * ((u * sinA) / (a * a) + (w0 * cosA) / (c * c));
    const Cv = (u * u) / (a * a) + (sy * sy) / (b * b) + (w0 * w0) / (c * c) - 1;
    const disc = B * B - 4 * A * Cv;
    if (disc < 0) return -Infinity;
    return (-B + Math.sqrt(disc)) / (2 * A);
  }

  for (let f = 0; f < totalFrames; f++) {
    const angle = (f / totalFrames) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const lines: string[] = [];
    for (let r = 0; r < BRAIN_ROWS; r++) {
      let line = "";
      for (let c = 0; c < BRAIN_COLS; c++) {
        const sx = (c / (BRAIN_COLS - 1)) * 2 - 1;
        const sy = ((r / (BRAIN_ROWS - 1)) * 2 - 1) * 1.7;
        const z1 = frontZ(sx, sy, -0.26, 0.54, 0.7, 0.76, cosA, sinA);
        const z2 = frontZ(sx, sy, 0.26, 0.54, 0.7, 0.76, cosA, sinA);
        const z = Math.max(isFinite(z1) ? z1 : -Infinity, isFinite(z2) ? z2 : -Infinity);
        if (isFinite(z) && z > -2 && z < 2) {
          const wx = sx * cosA + z * sinA;
          const wz = -sx * sinA + z * cosA;
          const wy = sy;
          const gyri =
            0.09 * Math.sin(wx * 9 + wz * 4) * Math.cos(wy * 6) +
            0.04 * Math.sin(wx * 5 - wy * 8);
          const lum = Math.max(0, Math.min(1, (z + 1) / 2 + gyri));
          const idx = Math.max(
            1,
            Math.min(ASCII_CHARS.length - 1, Math.round(lum * (ASCII_CHARS.length - 2)) + 1)
          );
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
      <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>{right}</span>
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
      <div style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textSecondary }}>{left}</div>
      <div style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary }}>{right ?? "⚙"}</div>
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
      <TopBar left="GREY MATTER  /  v0.1" right="[config]  ⚙" />
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
        <div style={{ opacity: 0.35, pointerEvents: "none" }}>
          <ASCIIBrain frames={frames} fps={2} fontSize="9px" />
        </div>
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
            textShadow: "0 0 18px rgba(242, 240, 234, 0.35)",
          }}
        >
          What does this video
          <br />
          do to a brain?
        </h1>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
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
        <p
          style={{
            fontFamily: FONT_MONO,
            fontSize: "10px",
            color: C.textTertiary,
            letterSpacing: "0.06em",
            margin: 0,
            marginTop: "-12px",
          }}
        >
          TRIBE v2 · Schaefer-Destrieux · claude
        </p>
      </div>
      <StatusBar left="─ status: idle" right="model: tribe v2 ─" />
    </div>
  );
}

// ─── Loading View ─────────────────────────────────────────────────────────────

function LoadingView({ onComplete, frames }: { onComplete: () => void; frames: string[] }) {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [stepTimes, setStepTimes] = useState<Record<number, string>>({});
  const [elapsedMs, setElapsedMs] = useState(0);
  const [poeticMsg, setPoeticMsg] = useState(POETIC_MESSAGES[0]);
  const [poeticKey, setPoeticKey] = useState(0);
  const [pulse, setPulse] = useState(false);
  const hasCompleted = useRef(false);
  const startTime = useRef(Date.now());

  const fmtMs = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    const milli = ms % 1000;
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
  };

  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startTime.current), 50);
    return () => clearInterval(id);
  }, []);

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
      <TopBar left="GREY MATTER  /  v0.1" />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {LOADING_STEPS.map((step, i) => {
              const done = completedSteps.includes(i);
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
                      <span style={{ color: C.scan, animation: "blink 1s step-start infinite" }}>_</span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "11px",
                      color: C.textTertiary,
                      flexShrink: 0,
                    }}
                  >
                    {done ? stepTimes[i] ?? "—" : active ? fmtMs(elapsedMs) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
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
      <StatusBar left="─ demo_video.mov" right={`elapsed: ${fmtMs(elapsedMs)}  model: tribe v2 ─`} />
    </div>
  );
}

// ─── Brain Activity Bars ──────────────────────────────────────────────────────

function BrainActivityBars({ tribeTimestep }: { tribeTimestep: (typeof tribeData)[0] | null }) {
  if (!tribeTimestep) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontFamily: FONT_MONO,
          fontSize: "10px",
          color: C.textTertiary,
          letterSpacing: "0.12em",
        }}
      >
        PLAY VIDEO TO ACTIVATE
      </div>
    );
  }
  const max = tribeTimestep.rois[0]?.activation ?? 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%" }}>
      {tribeTimestep.rois.slice(0, 8).map((roi) => (
        <div key={roi.name} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              textAlign: "right",
              flexShrink: 0,
              color: C.textTertiary,
              fontSize: "9px",
              width: "140px",
            }}
          >
            {roi.name}
          </span>
          <div style={{ flex: 1, height: "6px", borderRadius: "2px", background: C.bgInset }}>
            <div
              style={{
                height: "100%",
                borderRadius: "2px",
                width: `${(roi.activation / max) * 100}%`,
                background: C.scan,
                opacity: 0.35 + (roi.activation / max) * 0.65,
                transition: "width 500ms ease, opacity 500ms ease",
              }}
            />
          </div>
          <span
            style={{
              fontFamily: FONT_MONO,
              flexShrink: 0,
              color: C.textTertiary,
              fontSize: "9px",
              width: "40px",
            }}
          >
            {roi.activation.toFixed(3)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Scorecard View ──────────────────────────────────────────────────────────

function ScorecardView({ scorecard }: { scorecard: AnalysisResult["scorecard"] }) {
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fade-in 0.45s ease-out" }}>
      <div className="scorecard-card">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "10px",
              color: C.textTertiary,
              letterSpacing: "0.1em",
            }}
          >
            OVERALL ATTENTION
          </span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span
              style={{
                fontFamily: FONT_SERIF,
                fontSize: "36px",
                fontWeight: 400,
                color: C.textPrimary,
                lineHeight: 1,
              }}
            >
              {scorecard.attention_score}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "12px", color: C.textTertiary }}>/ 100</span>
          </div>
        </div>
        <div style={{ marginTop: "10px", height: "6px", borderRadius: "2px", background: C.bgVoid }}>
          <div
            style={{
              height: "100%",
              borderRadius: "2px",
              width: `${scorecard.attention_score}%`,
              background: C.signal,
              opacity: 0.85,
            }}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div className="scorecard-card">
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "10px",
              color: C.textTertiary,
              letterSpacing: "0.1em",
            }}
          >
            PEAK ENGAGEMENT
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: "16px", color: C.peak, marginTop: "6px", display: "block" }}>
            {formatTime(scorecard.peak_moment_sec)}
          </span>
        </div>
        <div className="scorecard-card">
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "10px",
              color: C.textTertiary,
              letterSpacing: "0.1em",
            }}
          >
            BIGGEST DROP-OFF
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: "16px", color: C.warn, marginTop: "6px", display: "block" }}>
            {formatTime(scorecard.dropoff_moment_sec)}
          </span>
        </div>
      </div>

      <div className="scorecard-card">
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "10px",
            color: C.textTertiary,
            letterSpacing: "0.1em",
            marginBottom: "8px",
            display: "block",
          }}
        >
          RECOMMENDED EDIT
        </span>
        <p
          style={{
            fontFamily: FONT_BODY,
            fontSize: "14px",
            lineHeight: 1.65,
            color: C.textSecondary,
            margin: 0,
          }}
        >
          {scorecard.recommended_edit}
        </p>
      </div>
    </div>
  );
}

// ─── Emotional Arc View ──────────────────────────────────────────────────────

function EmotionalArcView({ arc }: { arc: AnalysisResult["emotional_arc"] }) {
  const sections = [
    { label: "Opening", text: arc.opening, color: C.peak },
    { label: "Middle", text: arc.middle, color: C.signal },
    { label: "Closing", text: arc.closing, color: C.warn },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", animation: "fade-in 0.45s ease-out" }}>
      <div style={{ marginBottom: "4px" }}>
        <span style={{ fontFamily: FONT_SERIF, fontStyle: "italic", fontSize: "22px", color: C.textPrimary }}>
          Emotional arc
        </span>
      </div>
      {sections.map((section) => (
        <div key={section.label}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: section.color }} />
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: "10px",
                letterSpacing: "0.12em",
                color: section.color,
              }}
            >
              {section.label}
            </span>
          </div>
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: "14px",
              lineHeight: 1.65,
              color: C.textSecondary,
              margin: 0,
            }}
          >
            {section.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline View ───────────────────────────────────────────────────────────

function TimelineView({
  timeline,
  activeIdx,
  onSeek,
}: {
  timeline: TimelineEntry[];
  activeIdx: number;
  onSeek: (sec: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeIdx >= 0 && scrollRef.current) {
      const cards = scrollRef.current.querySelectorAll("[data-timeline-card]");
      const card = cards[activeIdx] as HTMLElement;
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div
      ref={scrollRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        overflowY: "auto",
        flex: 1,
        paddingRight: "4px",
      }}
    >
      {timeline.map((entry, i) => {
        const isActive = i === activeIdx;
        return (
          <div
            key={i}
            data-timeline-card=""
            onClick={() => onSeek(entry.timestamp_sec)}
            className="timeline-card"
            style={{
              cursor: "pointer",
              transition: "background 200ms, border-color 200ms",
              background: isActive ? C.bgSurface : C.bgInset,
              border: `1px solid ${isActive ? C.borderActive : C.borderHair}`,
              borderRadius: "6px",
              padding: "10px 12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: "11px",
                    fontWeight: 500,
                    color: isActive ? C.signal : C.textTertiary,
                  }}
                >
                  {formatTime(entry.timestamp_sec)}
                </span>
                <span
                  style={{
                    fontFamily: FONT_BODY,
                    fontSize: "12px",
                    color: isActive ? C.textPrimary : C.textSecondary,
                  }}
                >
                  {entry.title}
                </span>
              </div>
              {entry.flag && (
                <span
                  className="flag-badge"
                  style={{
                    fontFamily: FONT_MONO,
                    background:
                      entry.flag === "PEAK" ? "rgba(184, 224, 194, 0.12)" : "rgba(232, 181, 160, 0.12)",
                    color: entry.flag === "PEAK" ? C.peak : C.warn,
                    border: `1px solid ${entry.flag === "PEAK" ? "rgba(184,224,194,0.35)" : "rgba(232,181,160,0.35)"}`,
                  }}
                >
                  {entry.flag}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "10px",
                  letterSpacing: "0.06em",
                  color: isActive ? C.scan : C.textTertiary,
                }}
              >
                {entry.bar}
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary }}>
                {entry.attention_score}/100
              </span>
            </div>
            <p
              style={{
                fontFamily: FONT_BODY,
                fontSize: "12px",
                lineHeight: 1.55,
                color: C.textSecondary,
                margin: "0 0 6px 0",
              }}
            >
              {entry.insight}
            </p>
            <span
              style={{
                display: "inline-block",
                fontFamily: FONT_MONO,
                fontSize: "9px",
                padding: "2px 8px",
                borderRadius: "999px",
                background: C.bgVoid,
                border: `1px solid ${C.borderHair}`,
                color: C.scan,
              }}
            >
              {entry.feeling}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────

function ResultsView({
  videoUrl,
  analysis,
  isStreaming,
}: {
  videoUrl: string;
  analysis: AnalysisResult | null;
  isStreaming: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTab, setActiveTab] = useState<ResultTab>("scorecard");

  const activeIdx =
    analysis?.timeline.reduce((best, entry, i) => {
      if (entry.timestamp_sec <= currentTime) return i;
      return best;
    }, -1) ?? -1;

  const tribeTimestep = (tribeData as (typeof tribeData)[number][]).reduce(
    (best: (typeof tribeData)[0] | null, t) => {
      if (t.timestamp_sec <= currentTime) return t;
      return best;
    },
    null
  );

  const seekTo = useCallback((sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play();
    }
  }, []);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const tabs: { key: ResultTab; label: string }[] = [
    { key: "scorecard", label: "Scorecard" },
    { key: "arc", label: "Emotional arc" },
    { key: "timeline", label: "Timeline" },
  ];

  const statusRight =
    isStreaming && !analysis ? (
      <span style={{ color: C.scan }}>
        claude streaming<span style={{ animation: "blink 1s step-start infinite" }}> ●</span>
      </span>
    ) : analysis ? (
      <span style={{ color: C.peak }}>analysis complete ✓</span>
    ) : (
      <span style={{ color: C.textTertiary }}>—</span>
    );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bgVoid, overflow: "hidden" }}>
      <TopBar left={<>GREY MATTER &nbsp;/&nbsp; demo_video.mov</>} right={statusRight} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div
          style={{
            width: "55%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            borderRight: `1px solid ${C.borderHair}`,
            overflowY: "auto",
          }}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={{
              width: "100%",
              maxHeight: "35vh",
              minHeight: 0,
              background: "#000",
              border: `1px solid ${C.borderHair}`,
              objectFit: "contain",
              display: "block",
            }}
            onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
          />
          <div style={{ marginTop: "12px", flexShrink: 0 }}>
            <p
              style={{
                fontFamily: FONT_MONO,
                fontSize: "10px",
                color: C.textTertiary,
                letterSpacing: "0.12em",
                margin: "0 0 8px 0",
              }}
            >
              CORTICAL ACTIVATION MODEL
            </p>
            <Suspense
              fallback={
                <div style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.12em", color: C.textTertiary }}>LOADING 3D MODEL...</span>
                </div>
              }
            >
              <BrainViewer currentTime={currentTime} duration={duration} />
            </Suspense>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${C.borderHair}`,
              flexShrink: 0,
              background: C.bgSurface,
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "10px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  padding: "12px 16px",
                  border: "none",
                  borderBottom: activeTab === tab.key ? `2px solid ${C.signal}` : "2px solid transparent",
                  marginBottom: "-1px",
                  background: activeTab === tab.key ? C.bgInset : "transparent",
                  color: activeTab === tab.key ? C.textPrimary : C.textTertiary,
                  cursor: "pointer",
                  transition: "color 200ms, background 200ms",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
            {isStreaming && !analysis && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", color: C.textTertiary }}>
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    border: `2px solid ${C.borderHair}`,
                    borderTopColor: C.scan,
                    animation: "spin 1s linear infinite",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontFamily: FONT_MONO, fontSize: "11px", letterSpacing: "0.08em" }}>
                  Streaming analysis
                  <span style={{ color: C.scan, animation: "blink 1s step-start infinite" }}>_</span>
                </span>
              </div>
            )}

            {analysis && activeTab === "scorecard" && <ScorecardView scorecard={analysis.scorecard} />}
            {analysis && activeTab === "arc" && <EmotionalArcView arc={analysis.emotional_arc} />}
            {analysis && activeTab === "timeline" && (
              <TimelineView timeline={analysis.timeline} activeIdx={activeIdx} onSeek={seekTo} />
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: "8px 16px",
          borderTop: `1px solid ${C.borderHair}`,
          background: C.bgSurface,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, minWidth: "40px" }}>
            {formatTime(currentTime)}
          </span>
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
                pointerEvents: "none",
              }}
            />
            {duration > 0 &&
              analysis?.timeline.map((entry, i) => (
                <div
                  key={i}
                  role="presentation"
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: `${(entry.timestamp_sec / duration) * 100}%`,
                    transform: "translate(-50%, -50%)",
                    width: entry.flag ? "5px" : "4px",
                    height: entry.flag ? "5px" : "4px",
                    borderRadius: "50%",
                    background:
                      entry.flag === "PEAK" ? C.peak : entry.flag === "WARNING" ? C.warn : i === activeIdx ? C.signal : C.textTertiary,
                    cursor: "pointer",
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    seekTo(entry.timestamp_sec);
                  }}
                />
              ))}
          </div>
          <span style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, minWidth: "40px" }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  const brainFrames = useMemo(() => generateBrainFrames(TOTAL_FRAMES), []);

  const handleFile = useCallback((_file: File) => {
    setVideoUrl("/demo_video.mp4");
    setAppState("loading");
  }, []);

  const runSynthesis = useCallback(async () => {
    setIsStreaming(true);
    setAnalysis(null);
    setAppState("results");

    try {
      const res = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tribeData: tribeData as TribeTimestep[] }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      if (fullText.includes("__ERROR__:")) {
        const errMsg = fullText.split("__ERROR__:")[1];
        console.error("Synthesis error:", errMsg);
        return;
      }

      const clean = fullText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as AnalysisResult;
      setAnalysis(parsed);
    } catch (err) {
      console.error("Synthesis failed:", err);
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return (
    <>
      {appState === "upload" && <UploadView onFile={handleFile} frames={brainFrames} />}
      {appState === "loading" && <LoadingView onComplete={runSynthesis} frames={brainFrames} />}
      {appState === "results" && (
        <ResultsView videoUrl={videoUrl} analysis={analysis} isStreaming={isStreaming} />
      )}
    </>
  );
}
