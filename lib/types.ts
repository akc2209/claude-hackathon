export interface ROI {
  name: string;
  activation: number;
}

export interface TribeTimestep {
  timestamp_sec: number;
  rois: ROI[];
}

// ─── New 3-layer output ───────────────────────────────────────────────────────

export interface Scorecard {
  attention_score: number;
  peak_moment_sec: number;
  dropoff_moment_sec: number;
  recommended_edit: string;
}

export interface EmotionalArc {
  opening: string;
  middle: string;
  closing: string;
}

export interface TimelineEntry {
  timestamp_sec: number;
  attention_score: number;
  bar: string;
  title: string;
  insight: string;
  feeling: string;
  flag: "PEAK" | "WARNING" | null;
}

export interface AnalysisResult {
  scorecard: Scorecard;
  emotional_arc: EmotionalArc;
  timeline: TimelineEntry[];
}
