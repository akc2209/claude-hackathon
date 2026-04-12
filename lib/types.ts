export interface ROI {
  name: string;
  activation: number;
}

export interface TribeTimestep {
  timestamp_sec: number;
  rois: ROI[];
}

export interface Insight {
  timestamp_sec: number;
  top_regions: string[];
  insight: string;
  tags: string[];
}
