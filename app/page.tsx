"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnalysisResult, TimelineEntry, TribeTimestep } from "@/lib/types";
import tribeData from "@/data/tribe_1984.json";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAIN_REGIONS = [
  "inferotemporal cortex",
  "orbitofrontal cortex",
  "V1", "V2", "V4",
  "prefrontal cortex",
  "fusiform gyrus",
  "superior temporal sulcus",
  "posterior parietal cortex",
  "anterior cingulate cortex",
];

const LOADING_STEPS = [
  { label: "Initializing TRIBE v2 cortical model", duration: 1200 },
  { label: "Loading ROI atlas mapping", duration: 1800 },
  { label: "Parsing fMRI activation arrays", duration: 2000 },
  { label: "Downsampling to top 10 ROIs per timestep", duration: 1600 },
  { label: "Mapping Schaefer-Destrieux parcellation", duration: 2200 },
  { label: "Normalizing activation magnitudes", duration: 1400 },
  { label: "Preparing synthesis payload", duration: 1000 },
];

const STATUS_MESSAGES = [
  "Processing temporal cortex responses...",
  "Mapping visual attention pathways...",
  "Analyzing reward signal patterns...",
  "Evaluating social processing regions...",
  "Scoring engagement trajectory...",
  "Detecting emotional valence shifts...",
  "Modeling attention drop-off points...",
  "Calibrating peak engagement markers...",
];

type AppState = "upload" | "loading" | "results";
type RightTab = "activity" | "arc";

// ─── Upload View ──────────────────────────────────────────────────────────────

function UploadView({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #0a1628 0%, #07080f 70%)" }}>
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <NeuroscanLogo size={32} />
          <h1 className="text-3xl font-light tracking-[0.2em] text-cyan-100">NEUROSCAN</h1>
        </div>
        <p className="text-sm text-slate-500 tracking-widest uppercase">Cortical Activation Modeling</p>
        <p className="mt-3 text-slate-400 text-sm max-w-sm mx-auto leading-relaxed"
          style={{ fontFamily: "system-ui, sans-serif" }}>
          See what a video does to a human brain — second by second.
        </p>
      </div>

      <div
        className="relative w-full max-w-lg border rounded-lg p-12 text-center cursor-pointer transition-all duration-300"
        style={{
          borderColor: dragging ? "#00d4ff" : "rgba(0,212,255,0.2)",
          background: dragging ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.02)",
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept="video/*,.mov,.mp4" className="hidden" onChange={handleChange} />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-cyan-200 text-sm tracking-wide">Drop video file here</p>
            <p className="text-slate-600 text-xs mt-1">.mov · .mp4 · any video format</p>
          </div>
          <span className="text-xs text-slate-600 tracking-widest uppercase mt-2">or click to browse</span>
        </div>
      </div>

      <p className="mt-8 text-xs text-slate-700 tracking-wide">
        TRIBE v2 · Schaefer-Destrieux atlas · claude-sonnet
      </p>
    </div>
  );
}

// ─── Loading View ─────────────────────────────────────────────────────────────

function LoadingView({ onComplete }: { onComplete: () => void }) {
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [statusText, setStatusText] = useState(STATUS_MESSAGES[0]);
  const [statusKey, setStatusKey] = useState(0);
  const [regionText, setRegionText] = useState(BRAIN_REGIONS[0]);
  const [regionKey, setRegionKey] = useState(0);
  const hasCompleted = useRef(false);

  useEffect(() => {
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    LOADING_STEPS.forEach((step, i) => {
      const t = setTimeout(() => setCompletedSteps((prev) => [...prev, i]), elapsed + step.duration);
      timers.push(t);
      elapsed += step.duration;
    });
    const doneTimer = setTimeout(() => {
      if (!hasCompleted.current) { hasCompleted.current = true; onComplete(); }
    }, elapsed + 800);
    timers.push(doneTimer);
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % STATUS_MESSAGES.length;
      setStatusText(STATUS_MESSAGES[idx]);
      setStatusKey((k) => k + 1);
    }, 1700);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % BRAIN_REGIONS.length;
      setRegionText(BRAIN_REGIONS[idx]);
      setRegionKey((k) => k + 1);
    }, 1300);
    return () => clearInterval(interval);
  }, []);

  const totalDuration = LOADING_STEPS.reduce((s, x) => s + x.duration, 0);
  const elapsed = completedSteps.reduce((s, i) => s + LOADING_STEPS[i].duration, 0);
  const pct = Math.min(96, Math.round((elapsed / totalDuration) * 100));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 relative"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0a1628 0%, #07080f 70%)" }}>
      <div className="mb-8 text-center">
        <h1 className="text-xl font-light tracking-[0.3em] text-cyan-300 opacity-80 mb-1">NEUROSCAN</h1>
        <p key={statusKey} className="text-xs text-slate-500 tracking-wide" style={{ animation: "insight-appear 0.4s ease-out" }}>
          {statusText}
        </p>
      </div>

      {/* Brain pulse animation */}
      <div className="relative mb-10 flex items-center justify-center" style={{ width: 80, height: 80 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute rounded-full"
            style={{
              width: 80 - i * 20,
              height: 80 - i * 20,
              border: "1px solid rgba(0,212,255,0.3)",
              animation: `brain-pulse ${1.6 + i * 0.4}s ease-in-out infinite`,
              animationDelay: `${i * 0.3}s`,
            }} />
        ))}
        <div className="w-5 h-5 rounded-full" style={{ background: "#00d4ff", boxShadow: "0 0 16px rgba(0,212,255,0.6)" }} />
      </div>

      <div className="w-full max-w-md">
        {/* Region cycling */}
        <div className="mb-4 text-center h-5">
          <span key={regionKey} className="text-xs tracking-widest uppercase"
            style={{ color: "#00d4ff", opacity: 0, display: "inline-block", animation: "insight-appear 0.4s ease-out forwards" }}>
            ◈ {regionText}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-2 flex justify-between items-center">
          <span className="text-xs text-slate-500 tracking-wider">CORTICAL MAPPING</span>
          <span className="text-xs tabular-nums" style={{ color: "#00d4ff" }}>{pct}%</span>
        </div>
        <div className="w-full h-1 rounded-full mb-7" style={{ background: "rgba(0,212,255,0.08)" }}>
          <div className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
              boxShadow: "0 0 8px rgba(0,212,255,0.4)",
            }} />
        </div>

        {/* Checklist */}
        <div className="space-y-2.5">
          {LOADING_STEPS.map((step, i) => {
            const done = completedSteps.includes(i);
            const active = !done && (i === 0 || completedSteps.includes(i - 1));
            return (
              <div key={i} className="flex items-start gap-3 transition-opacity duration-500"
                style={{ opacity: done || active ? 1 : 0.2 }}>
                <div className="mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {done ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="#00d4ff" strokeWidth="1" fill="rgba(0,212,255,0.08)" />
                      <path d="M4 7l2 2 4-4" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    <div className="w-2 h-2 rounded-full" style={{ background: "#00d4ff", boxShadow: "0 0 6px #00d4ff", animation: "insight-pulse 1s ease-in-out infinite" }} />
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ background: "rgba(0,212,255,0.15)" }} />
                  )}
                </div>
                <span className="text-xs leading-relaxed"
                  style={{ color: done ? "#67e8f9" : active ? "#e2e8f0" : "#475569" }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function NeuroscanLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="14" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
      <circle cx="16" cy="16" r="8" stroke="#00d4ff" strokeWidth="1" opacity="0.3" />
      <circle cx="16" cy="16" r="3" fill="#00d4ff" opacity="0.9" />
    </svg>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Scorecard strip ──────────────────────────────────────────────────────────

function ScorecardStrip({ result, isLoading, onSeek }: {
  result: AnalysisResult | null;
  isLoading: boolean;
  onSeek: (sec: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-6 py-3 border-t border-b"
        style={{ borderColor: "rgba(0,212,255,0.08)", background: "rgba(0,212,255,0.02)" }}>
        <div className="w-3 h-3 rounded-full border-2 flex-shrink-0"
          style={{ borderColor: "rgba(0,212,255,0.2)", borderTopColor: "#00d4ff", animation: "spin 1s linear infinite" }} />
        <span className="text-xs text-slate-500 tracking-wider">Synthesizing insights...</span>
      </div>
    );
  }
  if (!result) return null;

  const sc = result.scorecard;
  const scoreColor = sc.attention_score >= 70 ? "#4ade80" : sc.attention_score >= 50 ? "#facc15" : "#f87171";

  return (
    <div className="flex items-stretch border-t border-b divide-x"
      style={{ borderColor: "rgba(0,212,255,0.08)", divideColor: "rgba(0,212,255,0.08)", background: "rgba(0,5,15,0.6)" }}>
      {/* Score */}
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-xs text-slate-500 tracking-widest uppercase whitespace-nowrap">Attention</span>
        <span className="text-2xl font-light tabular-nums" style={{ color: scoreColor }}>{sc.attention_score}</span>
        <span className="text-slate-600 text-xs">/100</span>
      </div>
      {/* Peak */}
      <button className="flex items-center gap-2 px-5 py-3 hover:bg-white/5 transition-colors"
        onClick={() => onSeek(sc.peak_moment_sec)}>
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 tracking-widest uppercase whitespace-nowrap">Peak</span>
        <span className="text-xs tabular-nums font-medium" style={{ color: "#4ade80" }}>{formatTime(sc.peak_moment_sec)}</span>
      </button>
      {/* Drop-off */}
      <button className="flex items-center gap-2 px-5 py-3 hover:bg-white/5 transition-colors"
        onClick={() => onSeek(sc.dropoff_moment_sec)}>
        <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
        <span className="text-xs text-slate-500 tracking-widest uppercase whitespace-nowrap">Drop-off</span>
        <span className="text-xs tabular-nums font-medium text-red-400">{formatTime(sc.dropoff_moment_sec)}</span>
      </button>
      {/* Edit */}
      <div className="flex items-center gap-2 px-5 py-3 flex-1 min-w-0">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
          <path d="M6 1v10M1 6h10" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
        <span className="text-xs text-slate-500 tracking-widest uppercase whitespace-nowrap">Edit</span>
        <span className="text-xs text-slate-400 truncate" style={{ fontFamily: "system-ui, sans-serif" }}>
          {sc.recommended_edit}
        </span>
      </div>
    </div>
  );
}

// ─── Brain activity bars ──────────────────────────────────────────────────────

function BrainActivityBars({ tribeTimestep }: { tribeTimestep: typeof tribeData[0] | null }) {
  if (!tribeTimestep) {
    return <div className="text-xs text-slate-700 tracking-widest text-center py-4">PLAY VIDEO TO ACTIVATE</div>;
  }
  const max = tribeTimestep.rois[0]?.activation ?? 1;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {tribeTimestep.rois.slice(0, 7).map((roi) => (
        <div key={roi.name} className="flex items-center gap-2">
          <span className="text-right flex-shrink-0 truncate"
            style={{ color: "#334155", fontSize: "9px", width: "130px", fontFamily: "inherit" }}>
            {roi.name}
          </span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,212,255,0.06)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(roi.activation / max) * 100}%`,
                background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
                opacity: 0.3 + (roi.activation / max) * 0.7,
                boxShadow: roi.activation > 0.75 * max ? "0 0 4px rgba(0,212,255,0.3)" : "none",
              }} />
          </div>
          <span className="tabular-nums flex-shrink-0" style={{ color: "#1e3a5f", fontSize: "9px", width: "30px" }}>
            {roi.activation.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Results View ─────────────────────────────────────────────────────────────

function ResultsView({ videoUrl, result, isLoading }: {
  videoUrl: string;
  result: AnalysisResult | null;
  isLoading: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rightTab, setRightTab] = useState<RightTab>("activity");
  const timestampRowRef = useRef<HTMLDivElement>(null);
  const prevActiveIdx = useRef(-1);

  const timeline = result?.timeline ?? [];

  const activeIdx = timeline.reduce((best, entry, i) => {
    if (entry.timestamp_sec <= currentTime) return i;
    return best;
  }, -1);

  const tribeTimestep = (tribeData as typeof tribeData).reduce(
    (best: typeof tribeData[0] | null, t) => {
      if (t.timestamp_sec <= currentTime) return t;
      return best;
    }, null
  );

  // Scroll active timestamp chip into view
  useEffect(() => {
    if (activeIdx !== prevActiveIdx.current && activeIdx >= 0 && timestampRowRef.current) {
      prevActiveIdx.current = activeIdx;
      const chips = timestampRowRef.current.querySelectorAll("[data-ts-chip]");
      const chip = chips[activeIdx] as HTMLElement;
      if (chip) chip.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    }
  }, [activeIdx]);

  const seekTo = useCallback((sec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = sec;
      videoRef.current.play();
    }
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeEntry: TimelineEntry | null = activeIdx >= 0 ? timeline[activeIdx] : null;

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "#07080f", overflow: "hidden" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b flex-shrink-0"
        style={{ borderColor: "rgba(0,212,255,0.08)" }}>
        <div className="flex items-center gap-2">
          <NeuroscanLogo size={18} />
          <span className="text-sm tracking-[0.2em] text-cyan-300 font-light">NEUROSCAN</span>
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animation: "insight-pulse 1s ease-in-out infinite" }} />
              <span className="text-xs text-slate-500 tracking-wider">SYNTHESIZING</span>
            </>
          )}
          {!isLoading && result && (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 tracking-wider">{timeline.length} TIMESTEPS</span>
            </>
          )}
        </div>
      </div>

      {/* Top content row */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: Video */}
        <div className="flex flex-col p-3 border-r" style={{ width: "55%", borderColor: "rgba(0,212,255,0.08)" }}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full rounded"
            style={{ flex: 1, minHeight: 0, background: "#000", border: "1px solid rgba(0,212,255,0.1)", objectFit: "contain" }}
            onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
          />
        </div>

        {/* Right: Brain activity + Emotional arc tabs */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
            {(["activity", "arc"] as RightTab[]).map((tab) => (
              <button key={tab} onClick={() => setRightTab(tab)}
                className="px-4 py-2.5 text-xs tracking-widest uppercase transition-colors"
                style={{
                  color: rightTab === tab ? "#00d4ff" : "#334155",
                  borderBottom: rightTab === tab ? "1px solid #00d4ff" : "1px solid transparent",
                  background: "transparent",
                }}>
                {tab === "activity" ? "Brain Activity" : "Emotional Arc"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {rightTab === "activity" && (
              <div className="flex flex-col gap-4 h-full">
                {/* TRIBE bars */}
                <div>
                  <p className="text-xs text-slate-600 tracking-widest uppercase mb-2.5">Active Regions</p>
                  <BrainActivityBars tribeTimestep={tribeTimestep} />
                </div>

                {/* Current insight */}
                {activeEntry ? (
                  <div className="border-t pt-4 flex-1" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="tabular-nums text-xs font-medium" style={{ color: "#00d4ff" }}>
                        {formatTime(activeEntry.timestamp_sec)}
                      </span>
                      <span className="font-mono text-xs" style={{ color: "#0e3a5a", letterSpacing: "-0.5px" }}>
                        {activeEntry.bar}
                      </span>
                      <span className="tabular-nums text-xs" style={{ color: activeEntry.attention_score >= 70 ? "#4ade80" : activeEntry.attention_score >= 50 ? "#facc15" : "#f87171" }}>
                        {activeEntry.attention_score}
                      </span>
                      {activeEntry.flag && (
                        <span className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: activeEntry.flag === "PEAK" ? "rgba(74,222,128,0.1)" : "rgba(248,113,113,0.1)",
                            color: activeEntry.flag === "PEAK" ? "#4ade80" : "#f87171",
                            border: `1px solid ${activeEntry.flag === "PEAK" ? "rgba(74,222,128,0.3)" : "rgba(248,113,113,0.3)"}`,
                            fontSize: "9px",
                          }}>
                          {activeEntry.flag}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium mb-2" style={{ color: "#94a3b8" }}>{activeEntry.title}</p>
                    <p className="text-xs leading-relaxed mb-2" style={{ color: "#64748b", fontFamily: "system-ui, sans-serif" }}>
                      {activeEntry.insight}
                    </p>
                    <span className="text-xs italic" style={{ color: "#1e4060", fontFamily: "system-ui, sans-serif" }}>
                      {activeEntry.feeling}
                    </span>
                  </div>
                ) : (
                  <div className="border-t pt-4 flex-1" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
                    <p className="text-xs text-slate-700 tracking-wide" style={{ fontFamily: "system-ui" }}>
                      {isLoading ? "Generating insights..." : "Play the video to see insights."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {rightTab === "arc" && (
              <div className="flex flex-col gap-5">
                {result ? (
                  <>
                    {[
                      { label: "Opening", key: "opening" as const, color: "#4ade80" },
                      { label: "Middle", key: "middle" as const, color: "#facc15" },
                      { label: "Closing", key: "closing" as const, color: "#60a5fa" },
                    ].map(({ label, key, color }) => (
                      <div key={key}>
                        <p className="text-xs tracking-widest uppercase mb-2" style={{ color }}>{label}</p>
                        <p className="text-xs leading-relaxed" style={{ color: "#64748b", fontFamily: "system-ui, sans-serif" }}>
                          {result.emotional_arc[key]}
                        </p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-xs text-slate-700 tracking-wide" style={{ fontFamily: "system-ui" }}>
                    {isLoading ? "Generating emotional arc..." : "Waiting for analysis."}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scorecard strip */}
      <ScorecardStrip result={result} isLoading={isLoading} onSeek={seekTo} />

      {/* Progress bar */}
      <div className="flex-shrink-0 px-4 py-2 border-t" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: "#334155", minWidth: "34px" }}>
            {formatTime(currentTime)}
          </span>
          <div className="flex-1 h-1 rounded-full cursor-pointer relative"
            style={{ background: "rgba(0,212,255,0.08)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo(((e.clientX - rect.left) / rect.width) * duration);
            }}>
            <div className="h-full rounded-full pointer-events-none"
              style={{ width: `${progressPct}%`, background: "linear-gradient(90deg, #0e4a6e, #00d4ff)", boxShadow: "0 0 6px rgba(0,212,255,0.3)" }} />
            {duration > 0 && timeline.map((entry, i) => (
              <div key={i}
                className="absolute top-1/2 w-1 h-1 rounded-full cursor-pointer"
                style={{
                  left: `${(entry.timestamp_sec / duration) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  background: i === activeIdx ? "#00d4ff"
                    : entry.flag === "PEAK" ? "#4ade80"
                    : entry.flag === "WARNING" ? "#f87171"
                    : "rgba(0,212,255,0.3)",
                }}
                onClick={(e) => { e.stopPropagation(); seekTo(entry.timestamp_sec); }} />
            ))}
          </div>
          <span className="text-xs tabular-nums" style={{ color: "#334155", minWidth: "34px" }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Timestamps row */}
      <div className="flex-shrink-0 border-t" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
        <div ref={timestampRowRef} className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {timeline.map((entry, i) => {
            const isActive = i === activeIdx;
            const flagColor = entry.flag === "PEAK" ? "#4ade80" : entry.flag === "WARNING" ? "#f87171" : null;
            return (
              <button key={i} data-ts-chip="" onClick={() => seekTo(entry.timestamp_sec)}
                className="flex-shrink-0 flex flex-col px-3 py-2 border-r transition-all duration-150 text-left"
                style={{
                  borderColor: "rgba(0,212,255,0.06)",
                  background: isActive ? "rgba(0,212,255,0.06)" : "transparent",
                  borderTop: isActive ? "1px solid #00d4ff" : "1px solid transparent",
                  minWidth: "90px",
                  maxWidth: "120px",
                }}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="tabular-nums text-xs font-medium" style={{ color: isActive ? "#00d4ff" : "#1e3a5f" }}>
                    {formatTime(entry.timestamp_sec)}
                  </span>
                  {entry.flag && (
                    <span style={{ color: flagColor ?? undefined, fontSize: "8px" }}>●</span>
                  )}
                </div>
                <span className="font-mono truncate" style={{ fontSize: "8px", color: isActive ? "#1e4a6e" : "#0f2a40", letterSpacing: "-0.5px" }}>
                  {entry.bar}
                </span>
                <span className="truncate" style={{ color: isActive ? "#475569" : "#1e3040", fontSize: "9px", fontFamily: "system-ui" }}>
                  {entry.title}
                </span>
              </button>
            );
          })}
          {isLoading && (
            <div className="flex-shrink-0 flex items-center px-4 py-2">
              <div className="w-1 h-1 rounded-full" style={{ background: "#22d3ee", animation: "insight-pulse 0.8s ease-in-out infinite" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [appState, setAppState] = useState<AppState>("upload");
  const [videoUrl, setVideoUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = useCallback((file: File) => {
    setVideoUrl(URL.createObjectURL(file));
    setAppState("loading");
  }, []);

  const runSynthesis = useCallback(async () => {
    setIsLoading(true);
    setResult(null);
    setAppState("results");

    try {
      // Try local Flask backend first, fall back to Next.js API route
      const endpoints = [
        "http://localhost:5000/analyze",
        "/api/synthesize",
      ];

      let res: Response | null = null;
      for (const url of endpoints) {
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tribeData: tribeData as TribeTimestep[] }),
          });
          if (res.ok) break;
        } catch {
          continue;
        }
      }

      if (!res?.ok || !res.body) throw new Error("No response");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }

      // Strip accidental markdown fences
      const clean = fullText.replace(/```json|```/g, "").trim();
      const parsed: AnalysisResult = JSON.parse(clean);
      setResult(parsed);
    } catch (err) {
      console.error("Synthesis failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <>
      {appState === "upload" && <UploadView onFile={handleFile} />}
      {appState === "loading" && <LoadingView onComplete={runSynthesis} />}
      {appState === "results" && (
        <ResultsView videoUrl={videoUrl} result={result} isLoading={isLoading} />
      )}
    </>
  );
}
