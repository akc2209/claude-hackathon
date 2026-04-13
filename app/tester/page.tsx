"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { AnalysisResult, TimelineEntry, TribeTimestep } from "@/lib/types";
import { parseActivationNpy, type ParsedActivations } from "@/lib/npy-parser";
import type { CustomActivations } from "../BrainViewer";

const BrainViewer = lazy(() => import("../BrainViewer"));

// ─── Design tokens (shared with main page) ──────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStatsFromActivations(activations: Float32Array[]) {
  return activations.map((act, t) => {
    const n = act.length;
    let sum = 0, min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) {
      sum += act[i];
      if (act[i] < min) min = act[i];
      if (act[i] > max) max = act[i];
    }
    const mean = sum / n;
    let sqSum = 0, activated = 0, suppressed = 0;
    for (let i = 0; i < n; i++) {
      sqSum += (act[i] - mean) ** 2;
      if (act[i] > 0.15) activated++;
      if (act[i] < -0.15) suppressed++;
    }
    return {
      timestep: t,
      mean,
      std: Math.sqrt(sqSum / n),
      min,
      max,
      pctActivated: (activated / n) * 100,
      pctSuppressed: (suppressed / n) * 100,
    };
  });
}

const formatTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

// ─── Main Tester Page ────────────────────────────────────────────────────────

export default function TesterPage() {
  const [customActivations, setCustomActivations] = useState<CustomActivations | null>(null);
  const [customTribeData, setCustomTribeData] = useState<TribeTimestep[] | null>(null);
  const [npyFileName, setNpyFileName] = useState<string | null>(null);
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const numTimesteps = customActivations?.meta.numTimesteps ?? 1;
  const fakeDuration = numTimesteps; // 1 second per timestep

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying || !customActivations) return;
    lastFrameRef.current = performance.now();
    const speed = 0.5; // timesteps per second

    const animate = (now: number) => {
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      setPlaybackTime((prev) => {
        const next = prev + dt * speed;
        return next >= fakeDuration ? 0 : next; // loop
      });
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, customActivations, fakeDuration]);

  const handleFiles = useCallback((files: FileList) => {
    setParseError(null);
    Array.from(files).forEach((file) => {
      if (file.name.endsWith(".npy")) {
        file.arrayBuffer().then((buf) => {
          try {
            const parsed = parseActivationNpy(buf);
            setCustomActivations(parsed);
            setNpyFileName(file.name);
            setAnalysis(null);
            setSynthesisError(null);
          } catch (err) {
            setParseError(`${file.name}: ${err instanceof Error ? err.message : "Parse error"}`);
          }
        });
      } else if (file.name.endsWith(".json")) {
        file.text().then((text) => {
          try {
            const parsed = JSON.parse(text) as TribeTimestep[];
            if (!Array.isArray(parsed) || !parsed[0]?.rois) {
              throw new Error("Expected array of { timestamp_sec, rois: [...] }");
            }
            setCustomTribeData(parsed);
            setJsonFileName(file.name);
          } catch (err) {
            setParseError(`${file.name}: ${err instanceof Error ? err.message : "Parse error"}`);
          }
        });
      }
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const runAnalysis = useCallback(async () => {
    if (!customActivations) return;
    setIsStreaming(true);
    setAnalysis(null);
    setSynthesisError(null);

    try {
      const body: Record<string, unknown> = {};
      if (customTribeData) {
        body.tribeData = customTribeData;
      } else {
        body.activationStats = computeStatsFromActivations(customActivations.activations);
      }

      const res = await fetch("/api/synthesize-activations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        setSynthesisError(fullText.split("__ERROR__:")[1]);
        return;
      }

      const clean = fullText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as AnalysisResult;
      setAnalysis(parsed);
    } catch (err) {
      setSynthesisError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsStreaming(false);
    }
  }, [customActivations, customTribeData]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: C.bgVoid, overflow: "hidden" }}>
      {/* Top Bar */}
      <div
        style={{
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom: `1px solid ${C.borderHair}`,
          background: C.bgSurface,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: FONT_MONO, fontSize: "12px", letterSpacing: "0.08em", color: C.textSecondary }}>
          GREY MATTER &nbsp;/&nbsp; tester
        </span>
        <a href="/" style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.textTertiary, textDecoration: "none" }}>
          &larr; MAIN APP
        </a>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left Panel — Upload + Brain Viewer */}
        <div
          style={{
            width: "50%",
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            padding: "16px",
            borderRight: `1px solid ${C.borderHair}`,
            overflowY: "auto",
            gap: "12px",
          }}
        >
          {/* Drop Zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              background: dragging ? "rgba(232,227,212,0.03)" : C.bgInset,
              border: `1px ${dragging ? "solid" : "dashed"} ${dragging ? C.signal : C.borderHair}`,
              padding: "20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              cursor: "pointer",
              transition: "border-color 200ms, background 200ms",
              minHeight: "100px",
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".npy,.json"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <span style={{ fontFamily: FONT_MONO, fontSize: "13px", color: dragging ? C.signal : C.textSecondary }}>
              drop .npy + .json here
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary }}>
              or click to select
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "9px", color: C.textTertiary, marginTop: "4px" }}>
              .npy = activation data &nbsp;&middot;&nbsp; .json = TRIBE ROI data (optional)
            </span>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div style={{ fontFamily: FONT_MONO, fontSize: "10px", color: "#f87171", padding: "8px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
              {parseError}
            </div>
          )}

          {/* File Info */}
          {customActivations && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "8px", background: C.bgInset, border: `1px solid ${C.borderHair}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: "9px", letterSpacing: "0.08em", color: C.peak }}>LOADED</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textSecondary }}>{npyFileName}</span>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: "9px", color: C.textTertiary, display: "flex", gap: "12px" }}>
                <span>{customActivations.meta.numTimesteps} timesteps</span>
                <span>{customActivations.meta.numVertices} vertices</span>
                <span>range: [{customActivations.meta.activationMin.toFixed(3)}, {customActivations.meta.activationMax.toFixed(3)}]</span>
              </div>
              {jsonFileName && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "9px", letterSpacing: "0.08em", color: C.scan }}>ROI DATA</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textSecondary }}>{jsonFileName}</span>
                </div>
              )}
            </div>
          )}

          {/* Run Analysis Button */}
          {customActivations && (
            <button
              type="button"
              onClick={runAnalysis}
              disabled={isStreaming}
              style={{
                fontFamily: FONT_MONO,
                fontSize: "11px",
                letterSpacing: "0.1em",
                color: isStreaming ? C.textTertiary : C.bgVoid,
                background: isStreaming ? C.bgInset : C.signal,
                border: `1px solid ${isStreaming ? C.borderHair : C.signal}`,
                padding: "10px 20px",
                cursor: isStreaming ? "not-allowed" : "pointer",
                transition: "all 200ms",
                width: "100%",
              }}
            >
              {isStreaming ? "ANALYZING..." : "RUN ANALYSIS"}
            </button>
          )}

          {/* Brain Viewer */}
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.12em", margin: "0 0 8px 0" }}>
              CORTICAL ACTIVATION MODEL
            </p>
            <Suspense
              fallback={
                <div style={{ height: "280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.12em", color: C.textTertiary }}>LOADING 3D MODEL...</span>
                </div>
              }
            >
              <BrainViewer
                currentTime={playbackTime}
                duration={fakeDuration}
                tribeData={customTribeData ?? undefined}
                customActivations={customActivations}
              />
            </Suspense>

            {/* Playback Controls */}
            {customActivations && numTimesteps > 1 && (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: "10px",
                      color: C.textSecondary,
                      background: C.bgInset,
                      border: `1px solid ${C.borderHair}`,
                      padding: "4px 12px",
                      cursor: "pointer",
                      minWidth: "54px",
                    }}
                  >
                    {isPlaying ? "PAUSE" : "PLAY"}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={fakeDuration}
                    step={0.01}
                    value={playbackTime}
                    onChange={(e) => {
                      setIsPlaying(false);
                      setPlaybackTime(parseFloat(e.target.value));
                    }}
                    style={{
                      flex: 1,
                      accentColor: C.scan,
                      height: "4px",
                      cursor: "pointer",
                    }}
                  />
                  <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, minWidth: "60px", textAlign: "right" }}>
                    T={Math.floor(playbackTime) + 1}/{numTimesteps}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel — Analysis Results */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {!customActivations && !analysis && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontFamily: FONT_SERIF, fontSize: "24px", color: C.textPrimary, margin: "0 0 12px 0" }}>
                  Upload a .npy file to begin
                </p>
                <p style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.06em" }}>
                  Expected shape: (timesteps, vertices) or (vertices,)
                </p>
                <p style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.06em", marginTop: "4px" }}>
                  Optionally include a TRIBE .json for ROI-level analysis
                </p>
              </div>
            </div>
          )}

          {customActivations && !analysis && !isStreaming && !synthesisError && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
              <p style={{ fontFamily: FONT_MONO, fontSize: "11px", color: C.textTertiary, letterSpacing: "0.06em", textAlign: "center" }}>
                Data loaded. Click RUN ANALYSIS to get Claude insights.
              </p>
            </div>
          )}

          {isStreaming && !analysis && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    border: "2px solid rgba(122,155,184,0.2)",
                    borderTopColor: C.scan,
                    animation: "spin 1s linear infinite",
                    margin: "0 auto 12px",
                  }}
                />
                <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.12em", color: C.scan }}>
                  STREAMING ANALYSIS
                </span>
              </div>
            </div>
          )}

          {synthesisError && (
            <div style={{ padding: "20px" }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: "11px", color: "#f87171", padding: "12px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {synthesisError}
              </div>
              <button
                type="button"
                onClick={runAnalysis}
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "10px",
                  color: C.textSecondary,
                  background: C.bgInset,
                  border: `1px solid ${C.borderHair}`,
                  padding: "6px 14px",
                  cursor: "pointer",
                  marginTop: "8px",
                }}
              >
                RETRY
              </button>
            </div>
          )}

          {analysis && (
            <AnalysisPanel analysis={analysis} currentTimestep={Math.floor(playbackTime)} onSeekTimestep={(t) => { setIsPlaying(false); setPlaybackTime(t); }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Analysis Panel ──────────────────────────────────────────────────────────

function AnalysisPanel({ analysis, currentTimestep, onSeekTimestep }: { analysis: AnalysisResult; currentTimestep: number; onSeekTimestep: (t: number) => void }) {
  const [activeTab, setActiveTab] = useState<"scorecard" | "arc" | "timeline">("scorecard");
  const tabs = [
    { key: "scorecard" as const, label: "Scorecard" },
    { key: "arc" as const, label: "Emotional Arc" },
    { key: "timeline" as const, label: "Timeline" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.borderHair}`, flexShrink: 0, background: C.bgSurface }}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: FONT_MONO,
              fontSize: "10px",
              letterSpacing: "0.12em",
              color: activeTab === tab.key ? C.textPrimary : C.textTertiary,
              background: activeTab === tab.key ? C.bgInset : "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${C.signal}` : "2px solid transparent",
              padding: "12px 20px",
              cursor: "pointer",
              transition: "all 200ms",
            }}
          >
            {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {activeTab === "scorecard" && <ScorecardView scorecard={analysis.scorecard} />}
        {activeTab === "arc" && <ArcView arc={analysis.emotional_arc} />}
        {activeTab === "timeline" && <TimelineView timeline={analysis.timeline} currentTimestep={currentTimestep} onSeek={onSeekTimestep} />}
      </div>
    </div>
  );
}

// ─── Scorecard ───────────────────────────────────────────────────────────────

function ScorecardView({ scorecard }: { scorecard: AnalysisResult["scorecard"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", animation: "fade-in 0.45s ease-out" }}>
      <div style={{ background: C.bgInset, border: `1px solid ${C.borderHair}`, borderRadius: "6px", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.1em", color: C.textTertiary }}>OVERALL ATTENTION</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: FONT_SERIF, fontSize: "36px", color: C.textPrimary }}>{scorecard.attention_score}</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "12px", color: C.textTertiary }}>/ 100</span>
          </div>
        </div>
        <div style={{ marginTop: "10px", height: "2px", background: C.bgVoid }}>
          <div style={{ height: "100%", width: `${scorecard.attention_score}%`, background: C.signal, opacity: 0.7 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ background: C.bgInset, border: `1px solid ${C.borderHair}`, borderRadius: "6px", padding: "12px" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.1em" }}>PEAK ENGAGEMENT</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: "16px", color: C.peak, marginTop: "6px", display: "block" }}>
            {formatTime(scorecard.peak_moment_sec)}
          </span>
        </div>
        <div style={{ background: C.bgInset, border: `1px solid ${C.borderHair}`, borderRadius: "6px", padding: "12px" }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.1em" }}>BIGGEST DROP-OFF</span>
          <span style={{ fontFamily: FONT_MONO, fontSize: "16px", color: C.warn, marginTop: "6px", display: "block" }}>
            {formatTime(scorecard.dropoff_moment_sec)}
          </span>
        </div>
      </div>

      <div style={{ background: C.bgInset, border: `1px solid ${C.borderHair}`, borderRadius: "6px", padding: "12px" }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary, letterSpacing: "0.1em", marginBottom: "8px", display: "block" }}>
          RECOMMENDED INSIGHT
        </span>
        <p style={{ fontFamily: FONT_BODY, fontSize: "14px", lineHeight: 1.65, color: C.textSecondary, margin: 0 }}>
          {scorecard.recommended_edit}
        </p>
      </div>
    </div>
  );
}

// ─── Emotional Arc ───────────────────────────────────────────────────────────

function ArcView({ arc }: { arc: AnalysisResult["emotional_arc"] }) {
  const sections = [
    { label: "Opening", text: arc.opening, color: C.peak },
    { label: "Middle", text: arc.middle, color: C.signal },
    { label: "Closing", text: arc.closing, color: C.warn },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", animation: "fade-in 0.45s ease-out" }}>
      <span
        style={{
          fontFamily: FONT_SERIF,
          fontStyle: "italic",
          fontSize: "24px",
          color: C.textPrimary,
          textShadow: "0 0 2px rgba(242,240,234,0.8), 0 0 18px rgba(232,227,212,0.3)",
        }}
      >
        Emotional arc
      </span>
      {sections.map((section) => (
        <div key={section.label}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: section.color }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.12em", color: section.color }}>
              {section.label}
            </span>
          </div>
          <p style={{ fontFamily: FONT_BODY, fontSize: "14px", lineHeight: 1.65, color: C.textSecondary, margin: 0 }}>
            {section.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

function TimelineView({ timeline, currentTimestep, onSeek }: { timeline: TimelineEntry[]; currentTimestep: number; onSeek: (t: number) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find the active card: the last entry whose timestamp_sec <= currentTimestep
  const activeIdx = timeline.reduce((best, entry, i) => {
    if (entry.timestamp_sec <= currentTimestep) return i;
    return best;
  }, -1);

  // Auto-scroll to active card
  useEffect(() => {
    if (activeIdx >= 0 && scrollRef.current) {
      const cards = scrollRef.current.querySelectorAll("[data-timeline-card]");
      const card = cards[activeIdx] as HTMLElement;
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div ref={scrollRef} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {timeline.map((entry, i) => {
        const isActive = i === activeIdx;
        return (
        <div
          key={i}
          data-timeline-card=""
          onClick={() => onSeek(entry.timestamp_sec)}
          style={{
            cursor: "pointer",
            background: isActive ? C.bgSurface : C.bgInset,
            border: `1px solid ${isActive ? C.borderActive : C.borderHair}`,
            borderLeft: isActive ? `3px solid ${C.scan}` : `1px solid ${C.borderHair}`,
            borderRadius: "6px",
            padding: "10px 12px",
            boxShadow: isActive ? `0 0 12px rgba(122,155,184,0.08)` : "none",
            transition: "all 200ms cubic-bezier(0.4,0,0.2,1)",
            animation: `card-appear 0.45s cubic-bezier(0.4,0,0.2,1) ${i * 55}ms both`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: "11px", fontWeight: 500, color: isActive ? C.scan : C.textTertiary }}>
                T={entry.timestamp_sec}
              </span>
              <span style={{ fontFamily: FONT_BODY, fontSize: "12px", color: isActive ? C.textPrimary : C.textSecondary }}>
                {entry.title}
              </span>
            </div>
            {entry.flag && (
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "9px",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  background: entry.flag === "PEAK" ? "rgba(184,224,194,0.12)" : "rgba(232,181,160,0.12)",
                  color: entry.flag === "PEAK" ? C.peak : C.warn,
                  border: `1px solid ${entry.flag === "PEAK" ? "rgba(184,224,194,0.35)" : "rgba(232,181,160,0.35)"}`,
                }}
              >
                {entry.flag}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", letterSpacing: "0.06em", color: isActive ? C.scan : C.textTertiary }}>
              {entry.bar}
            </span>
            <span style={{ fontFamily: FONT_MONO, fontSize: "10px", color: C.textTertiary }}>
              {entry.attention_score}/100
            </span>
          </div>
          <p style={{ fontFamily: FONT_BODY, fontSize: "12px", lineHeight: 1.55, color: C.textSecondary, margin: "0 0 6px 0" }}>
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
