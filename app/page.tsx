"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AnalysisResult, TimelineEntry, TribeTimestep } from "@/lib/types";
import tribeData from "@/data/tribe_output.json";

// ─── Constants ───────────────────────────────────────────────────────────────

const BRAIN_REGIONS = [
  "inferotemporal cortex",
  "orbitofrontal cortex",
  "V1",
  "V2",
  "V4",
  "prefrontal cortex",
  "fusiform gyrus",
  "superior temporal sulcus",
  "posterior parietal cortex",
  "anterior cingulate cortex",
];

const LOADING_STEPS = [
  { label: "Extracting video frames", duration: 2000 },
  { label: "Encoding audio stream", duration: 2200 },
  { label: "Running visual cortex model", duration: 2500 },
  { label: "Mapping brain region activity", duration: 2300 },
  { label: "Rendering neural timeline", duration: 2000 },
  { label: "Preparing your insights", duration: 1500 },
];

type AppState = "upload" | "loading" | "results";
type ResultTab = "scorecard" | "arc" | "timeline";

// ─── Upload View ──────────────────────────────────────────────────────────────

function UploadView({ onFile }: { onFile: (file: File) => void }) {
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
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #0a1628 0%, #07080f 70%)",
      }}
    >
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
            <circle cx="16" cy="16" r="8" stroke="#00d4ff" strokeWidth="1" opacity="0.4" />
            <circle cx="16" cy="16" r="3" fill="#00d4ff" opacity="0.9" />
            <line x1="16" y1="2" x2="16" y2="8" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
            <line x1="16" y1="24" x2="16" y2="30" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
            <line x1="2" y1="16" x2="8" y2="16" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
            <line x1="24" y1="16" x2="30" y2="16" stroke="#00d4ff" strokeWidth="1" opacity="0.5" />
          </svg>
          <h1 className="text-3xl font-light tracking-[0.2em] text-cyan-100">
            NEUROSCAN
          </h1>
        </div>
        <p className="text-sm text-slate-500 tracking-widest uppercase">
          Cortical Activation Modeling
        </p>
        <p
          className="mt-3 text-slate-400 text-sm max-w-sm mx-auto leading-relaxed"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          See what a video does to a human brain — second by second.
        </p>
      </div>

      {/* Drop Zone */}
      <div
        className={`relative w-full max-w-lg border rounded-lg p-12 text-center cursor-pointer transition-all duration-300`}
        style={{
          borderColor: dragging ? "#00d4ff" : "rgba(0,212,255,0.2)",
          background: dragging
            ? "rgba(0,212,255,0.05)"
            : "rgba(255,255,255,0.02)",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mov,.mp4"
          className="hidden"
          onChange={handleChange}
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: "rgba(0,212,255,0.06)",
              border: "1px solid rgba(0,212,255,0.2)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div>
            <p className="text-cyan-200 text-sm tracking-wide">
              Drop video file here
            </p>
            <p className="text-slate-600 text-xs mt-1">
              .mov · .mp4 · any video format
            </p>
          </div>
          <span className="text-xs text-slate-600 tracking-widest uppercase mt-2">
            or click to browse
          </span>
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
  const [currentRegion, setCurrentRegion] = useState(BRAIN_REGIONS[0]);
  const [regionKey, setRegionKey] = useState(0);
  const hasCompleted = useRef(false);

  useEffect(() => {
    let elapsed = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    LOADING_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        setCompletedSteps((prev) => [...prev, i]);
      }, elapsed + step.duration);
      timers.push(t);
      elapsed += step.duration;
    });

    const doneTimer = setTimeout(() => {
      if (!hasCompleted.current) {
        hasCompleted.current = true;
        onComplete();
      }
    }, elapsed + 800);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  useEffect(() => {
    let idx = 0;
    const cycle = () => {
      idx = (idx + 1) % BRAIN_REGIONS.length;
      setCurrentRegion(BRAIN_REGIONS[idx]);
      setRegionKey((k) => k + 1);
    };
    const interval = setInterval(cycle, 1300);
    return () => clearInterval(interval);
  }, []);

  const totalDuration = LOADING_STEPS.reduce((s, x) => s + x.duration, 0);
  const elapsed = completedSteps.reduce(
    (s, i) => s + LOADING_STEPS[i].duration,
    0
  );
  const pct = Math.min(96, Math.round((elapsed / totalDuration) * 100));

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 scanlines relative"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #0a1628 0%, #07080f 70%)",
      }}
    >
      <div className="mb-10 text-center">
        <h1 className="text-xl font-light tracking-[0.3em] text-cyan-300 opacity-80">
          NEUROSCAN
        </h1>
      </div>

      <div className="w-full max-w-md">
        {/* Region cycling */}
        <div className="mb-6 text-center h-6">
          <span
            key={regionKey}
            className="text-xs tracking-widest uppercase"
            style={{
              color: "#00d4ff",
              opacity: 0,
              display: "inline-block",
              animation: "insight-appear 0.4s ease-out forwards",
            }}
          >
            ◈ {currentRegion}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mb-2 flex justify-between items-center">
          <span className="text-xs text-slate-500 tracking-wider">
            CORTICAL MAPPING
          </span>
          <span className="text-xs tabular-nums" style={{ color: "#00d4ff" }}>
            {pct}%
          </span>
        </div>
        <div
          className="w-full h-1 rounded-full mb-8"
          style={{ background: "rgba(0,212,255,0.08)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
              boxShadow: "0 0 8px rgba(0,212,255,0.4)",
            }}
          />
        </div>

        {/* Checklist */}
        <div className="space-y-3">
          {LOADING_STEPS.map((step, i) => {
            const done = completedSteps.includes(i);
            const active =
              !done &&
              (i === 0 || completedSteps.includes(i - 1)) &&
              !completedSteps.includes(i);
            return (
              <div
                key={i}
                className="flex items-start gap-3 transition-opacity duration-500"
                style={{ opacity: done || active ? 1 : 0.25 }}
              >
                <div className="mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {done ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="#00d4ff" strokeWidth="1" fill="rgba(0,212,255,0.08)" />
                      <path d="M4 7l2 2 4-4" stroke="#00d4ff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : active ? (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: "#00d4ff",
                        boxShadow: "0 0 6px #00d4ff",
                        animation: "insight-pulse 1s ease-in-out infinite",
                      }}
                    />
                  ) : (
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: "rgba(0,212,255,0.15)" }}
                    />
                  )}
                </div>
                <span
                  className="text-xs leading-relaxed"
                  style={{
                    color: done ? "#67e8f9" : active ? "#e2e8f0" : "#475569",
                  }}
                >
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

// ─── Brain Activity Bars ──────────────────────────────────────────────────────

function BrainActivityBars({ tribeTimestep }: { tribeTimestep: (typeof tribeData)[0] | null }) {
  if (!tribeTimestep) {
    return (
      <div className="flex items-center justify-center h-full text-slate-700 text-xs tracking-widest">
        PLAY VIDEO TO ACTIVATE
      </div>
    );
  }
  const max = tribeTimestep.rois[0]?.activation ?? 1;
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {tribeTimestep.rois.slice(0, 8).map((roi) => (
        <div key={roi.name} className="flex items-center gap-2">
          <span
            className="text-right flex-shrink-0"
            style={{ color: "#475569", fontSize: "9px", width: "140px" }}
          >
            {roi.name}
          </span>
          <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(roi.activation / max) * 100}%`,
                background: `linear-gradient(90deg, #0e4a6e, #00d4ff)`,
                opacity: 0.4 + (roi.activation / max) * 0.6,
                boxShadow: roi.activation > 0.7 * max ? "0 0 4px rgba(0,212,255,0.4)" : "none",
              }}
            />
          </div>
          <span
            className="tabular-nums flex-shrink-0"
            style={{ color: "#1e4a6e", fontSize: "9px", width: "32px" }}
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
    <div className="space-y-4 insight-appear">
      {/* Attention Score */}
      <div className="scorecard-card">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500 tracking-widest uppercase">Overall Attention</span>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-light" style={{ color: "#00d4ff" }}>
              {scorecard.attention_score}
            </span>
            <span className="text-sm text-slate-600">/ 100</span>
          </div>
        </div>
        <div className="mt-2 h-1.5 rounded-full" style={{ background: "rgba(0,212,255,0.08)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${scorecard.attention_score}%`,
              background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
              boxShadow: "0 0 8px rgba(0,212,255,0.3)",
            }}
          />
        </div>
      </div>

      {/* Peak + Drop-off */}
      <div className="grid grid-cols-2 gap-3">
        <div className="scorecard-card">
          <span className="text-xs text-slate-500 tracking-widest uppercase">Peak Engagement</span>
          <span className="text-lg mt-1" style={{ color: "#34d399" }}>
            {formatTime(scorecard.peak_moment_sec)}
          </span>
        </div>
        <div className="scorecard-card">
          <span className="text-xs text-slate-500 tracking-widest uppercase">Biggest Drop-off</span>
          <span className="text-lg mt-1" style={{ color: "#f87171" }}>
            {formatTime(scorecard.dropoff_moment_sec)}
          </span>
        </div>
      </div>

      {/* Recommended Edit */}
      <div className="scorecard-card">
        <span className="text-xs text-slate-500 tracking-widest uppercase mb-2">Recommended Edit</span>
        <p className="text-sm leading-relaxed" style={{ color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>
          {scorecard.recommended_edit}
        </p>
      </div>
    </div>
  );
}

// ─── Emotional Arc View ──────────────────────────────────────────────────────

function EmotionalArcView({ arc }: { arc: AnalysisResult["emotional_arc"] }) {
  return (
    <div className="space-y-5 insight-appear">
      {[
        { label: "Opening", text: arc.opening, color: "#34d399" },
        { label: "Middle", text: arc.middle, color: "#fbbf24" },
        { label: "Closing", text: arc.closing, color: "#f87171" },
      ].map((section) => (
        <div key={section.label}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: section.color }} />
            <span className="text-xs tracking-widest uppercase" style={{ color: section.color }}>
              {section.label}
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}
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
    <div ref={scrollRef} className="space-y-2 overflow-y-auto flex-1 pr-1">
      {timeline.map((entry, i) => {
        const isActive = i === activeIdx;
        return (
          <div
            key={i}
            data-timeline-card=""
            onClick={() => onSeek(entry.timestamp_sec)}
            className="timeline-card cursor-pointer transition-all duration-200"
            style={{
              background: isActive ? "rgba(0,212,255,0.06)" : "rgba(255,255,255,0.02)",
              borderColor: isActive ? "rgba(0,212,255,0.3)" : "rgba(0,212,255,0.08)",
              borderWidth: "1px",
              borderStyle: "solid",
              borderRadius: "6px",
              padding: "10px 12px",
            }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-xs font-medium" style={{ color: isActive ? "#00d4ff" : "#64748b" }}>
                  {formatTime(entry.timestamp_sec)}
                </span>
                <span className="text-xs" style={{ color: isActive ? "#e2e8f0" : "#94a3b8" }}>
                  {entry.title}
                </span>
              </div>
              {entry.flag && (
                <span
                  className="flag-badge"
                  style={{
                    background: entry.flag === "PEAK" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)",
                    color: entry.flag === "PEAK" ? "#34d399" : "#f87171",
                    border: `1px solid ${entry.flag === "PEAK" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
                  }}
                >
                  {entry.flag}
                </span>
              )}
            </div>

            {/* Bar + score */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs tracking-wider" style={{ color: isActive ? "#00d4ff" : "#1e4a6e", letterSpacing: "1px" }}>
                {entry.bar}
              </span>
              <span className="tabular-nums text-xs" style={{ color: "#64748b" }}>
                {entry.attention_score}/100
              </span>
            </div>

            {/* Insight text */}
            <p className="text-xs leading-relaxed mb-1" style={{ color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>
              {entry.insight}
            </p>

            {/* Feeling label */}
            <span
              className="inline-block text-xs px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(0,212,255,0.06)",
                border: "1px solid rgba(0,212,255,0.15)",
                color: "#67e8f9",
                fontSize: "9px",
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

  // Find active timeline entry based on video time
  const activeIdx = analysis?.timeline.reduce((best, entry, i) => {
    if (entry.timestamp_sec <= currentTime) return i;
    return best;
  }, -1) ?? -1;

  // Find matching TRIBE timestep
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
    { key: "arc", label: "Emotional Arc" },
    { key: "timeline", label: "Timeline" },
  ];

  return (
    <div className="flex flex-col" style={{ height: "100vh", background: "#07080f", overflow: "hidden" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b flex-shrink-0"
        style={{ borderColor: "rgba(0,212,255,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="#00d4ff" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
            <circle cx="16" cy="16" r="3" fill="#00d4ff" opacity="0.9" />
          </svg>
          <span className="text-sm tracking-[0.2em] text-cyan-300 font-light">NEUROSCAN</span>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ animation: "insight-pulse 1s ease-in-out infinite" }} />
              <span className="text-xs text-slate-500 tracking-wider">SYNTHESIZING</span>
            </>
          )}
          {!isStreaming && analysis && (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 tracking-wider">ANALYSIS COMPLETE</span>
            </>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left: Video */}
        <div
          className="flex flex-col p-4 border-r"
          style={{ width: "55%", borderColor: "rgba(0,212,255,0.08)" }}
        >
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full rounded-md"
            style={{
              flex: 1,
              minHeight: 0,
              background: "#000",
              border: "1px solid rgba(0,212,255,0.1)",
              objectFit: "contain",
            }}
            onTimeUpdate={(e) => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={(e) => setDuration((e.target as HTMLVideoElement).duration)}
          />

          {/* Brain Activity */}
          <div className="mt-3 flex-shrink-0">
            <p className="text-xs text-slate-500 tracking-widest uppercase mb-2">
              Brain Activity Model
            </p>
            <BrainActivityBars tribeTimestep={tribeTimestep} />
          </div>
        </div>

        {/* Right: Analysis panels */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b flex-shrink-0" style={{ borderColor: "rgba(0,212,255,0.08)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2.5 text-xs tracking-widest uppercase transition-all"
                style={{
                  color: activeTab === tab.key ? "#00d4ff" : "#475569",
                  borderBottom: activeTab === tab.key ? "1px solid #00d4ff" : "1px solid transparent",
                  background: activeTab === tab.key ? "rgba(0,212,255,0.03)" : "transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isStreaming && !analysis && (
              <div className="flex items-center gap-2 text-slate-600">
                <div
                  className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                  style={{ borderColor: "rgba(0,212,255,0.2)", borderTopColor: "#00d4ff", animation: "spin 1s linear infinite" }}
                />
                <span className="text-xs tracking-widest">Streaming analysis...</span>
              </div>
            )}

            {analysis && activeTab === "scorecard" && (
              <ScorecardView scorecard={analysis.scorecard} />
            )}
            {analysis && activeTab === "arc" && (
              <EmotionalArcView arc={analysis.emotional_arc} />
            )}
            {analysis && activeTab === "timeline" && (
              <TimelineView
                timeline={analysis.timeline}
                activeIdx={activeIdx}
                onSeek={seekTo}
              />
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Video progress bar with markers */}
      <div
        className="flex-shrink-0 px-4 py-2 border-t"
        style={{ borderColor: "rgba(0,212,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: "#475569", minWidth: "36px" }}>
            {formatTime(currentTime)}
          </span>
          <div
            className="flex-1 h-1 rounded-full cursor-pointer relative"
            style={{ background: "rgba(0,212,255,0.1)" }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seekTo(pct * duration);
            }}
          >
            <div
              className="h-full rounded-full pointer-events-none"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
                boxShadow: "0 0 6px rgba(0,212,255,0.3)",
              }}
            />
            {/* Timeline markers */}
            {duration > 0 && analysis?.timeline.map((entry, i) => (
              <div
                key={i}
                className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
                style={{
                  left: `${(entry.timestamp_sec / duration) * 100}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={(e) => { e.stopPropagation(); seekTo(entry.timestamp_sec); }}
              >
                <div
                  className="rounded-full"
                  style={{
                    width: entry.flag === "PEAK" ? "6px" : entry.flag === "WARNING" ? "6px" : "4px",
                    height: entry.flag === "PEAK" ? "6px" : entry.flag === "WARNING" ? "6px" : "4px",
                    background: entry.flag === "PEAK"
                      ? "#34d399"
                      : entry.flag === "WARNING"
                      ? "#f87171"
                      : i === activeIdx
                      ? "#00d4ff"
                      : "rgba(0,212,255,0.4)",
                  }}
                />
              </div>
            ))}
          </div>
          <span className="text-xs tabular-nums" style={{ color: "#475569", minWidth: "36px" }}>
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

  const handleFile = useCallback((_file: File) => {
    // Always use the pre-computed demo video regardless of what was uploaded
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

      // Check for errors
      if (fullText.includes("__ERROR__:")) {
        const errMsg = fullText.split("__ERROR__:")[1];
        console.error("Synthesis error:", errMsg);
        return;
      }

      // Strip any accidental markdown fences
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
      {appState === "upload" && <UploadView onFile={handleFile} />}
      {appState === "loading" && <LoadingView onComplete={runSynthesis} />}
      {appState === "results" && (
        <ResultsView
          videoUrl={videoUrl}
          analysis={analysis}
          isStreaming={isStreaming}
        />
      )}
    </>
  );
}
