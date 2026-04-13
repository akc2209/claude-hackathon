"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { TribeTimestep } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrainMeta {
  numVertices: number;
  numFaces: number;
  numTimesteps: number;
  vertexDims: number;
  faceDims: number;
  activationMin: number;
  activationMax: number;
}

// fsaverage5 vertex-to-region mapping (approximate, per hemisphere = 10242 vertices)
// Based on standard cortical parcellation vertex ranges
const CORTICAL_REGIONS = [
  { name: "Visual Cortex", startPct: 0, endPct: 0.12, description: "processing visual input", roiNames: ["V1", "V2", "V4"] },
  { name: "Parietal Lobe", startPct: 0.12, endPct: 0.24, description: "spatial awareness & attention", roiNames: ["posterior parietal cortex"] },
  { name: "Motor Cortex", startPct: 0.24, endPct: 0.34, description: "movement & action planning", roiNames: [] },
  { name: "Prefrontal Cortex", startPct: 0.34, endPct: 0.50, description: "decision-making & focus", roiNames: ["prefrontal cortex", "orbitofrontal cortex"] },
  { name: "Temporal Lobe", startPct: 0.50, endPct: 0.65, description: "language & memory", roiNames: ["superior temporal sulcus", "inferotemporal cortex"] },
  { name: "Fusiform Gyrus", startPct: 0.65, endPct: 0.75, description: "face & object recognition", roiNames: ["fusiform gyrus"] },
  { name: "Cingulate Cortex", startPct: 0.75, endPct: 0.85, description: "emotion & conflict monitoring", roiNames: ["anterior cingulate cortex"] },
  { name: "Insular Cortex", startPct: 0.85, endPct: 1.0, description: "interoception & salience", roiNames: [] },
];

interface TimestepStats {
  mean: number;
  std: number;
  min: number;
  max: number;
  pctActivated: number;
  pctSuppressed: number;
  dominantRegion: string;
  dominantDescription: string;
}

interface BrainData {
  vertices: Float32Array;
  faces: Uint32Array;
  activations: Float32Array[];
  meta: BrainMeta;
  stats: TimestepStats[];
}

function computeTimestepStats(
  activations: Float32Array,
  tribeTimestep?: TribeTimestep
): TimestepStats {
  const n = activations.length;
  let sum = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = activations[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / n;

  let sqSum = 0;
  let activated = 0;
  let suppressed = 0;
  for (let i = 0; i < n; i++) {
    const v = activations[i];
    sqSum += (v - mean) ** 2;
    if (v > 0.15) activated++;
    if (v < -0.15) suppressed++;
  }

  // Use TRIBE ROI data for dominant region (most accurate source)
  let dominantRegion = "Unknown";
  let dominantDescription = "";
  if (tribeTimestep && tribeTimestep.rois.length > 0) {
    const topRoi = tribeTimestep.rois.reduce((best, roi) =>
      roi.activation > best.activation ? roi : best
    );
    dominantRegion = topRoi.name;
    // Look up description from cortical regions if available
    const match = CORTICAL_REGIONS.find((r) =>
      r.roiNames.some((n) => n.toLowerCase() === topRoi.name.toLowerCase())
    );
    dominantDescription = match?.description ?? "";
  }

  return {
    mean,
    std: Math.sqrt(sqSum / n),
    min,
    max,
    pctActivated: (activated / n) * 100,
    pctSuppressed: (suppressed / n) * 100,
    dominantRegion,
    dominantDescription,
  };
}

// ─── Color map: grey brain surface with fire overlay for active regions ──────

// Activation threshold: only values above this (as fraction of max) get colored.
// Below this, the brain renders as neutral grey — matching real fMRI visualizations.
const ACTIVATION_THRESHOLD = 0.25;

// Neutral brain surface color (light grey)
const BRAIN_GREY: [number, number, number] = [0.62, 0.60, 0.58];

function activationToColor(value: number, min: number, max: number): [number, number, number] {
  // Normalize using only the positive range (0 to max) — negative values are suppression, not activation
  const intensity = Math.max(0, value) / (max + 1e-8);

  // Below threshold: render as neutral grey brain surface
  if (intensity < ACTIVATION_THRESHOLD) {
    return BRAIN_GREY;
  }

  // Remap threshold..1 to 0..1 for the fire color ramp
  const t = (intensity - ACTIVATION_THRESHOLD) / (1 - ACTIVATION_THRESHOLD);

  // Fire ramp: dark red → red → orange → yellow → white-hot
  if (t < 0.2) {
    // Grey-red blend to dark red
    const s = t / 0.2;
    return [
      BRAIN_GREY[0] + s * (0.45 - BRAIN_GREY[0]),
      BRAIN_GREY[1] + s * (0.08 - BRAIN_GREY[1]),
      BRAIN_GREY[2] + s * (0.04 - BRAIN_GREY[2]),
    ];
  } else if (t < 0.4) {
    // Dark red to bright red
    const s = (t - 0.2) / 0.2;
    return [0.45 + s * 0.45, 0.08 + s * 0.05, 0.04 + s * 0.01];
  } else if (t < 0.6) {
    // Bright red to orange
    const s = (t - 0.4) / 0.2;
    return [0.9 + s * 0.1, 0.13 + s * 0.37, 0.05 + s * 0.03];
  } else if (t < 0.8) {
    // Orange to yellow
    const s = (t - 0.6) / 0.2;
    return [1.0, 0.5 + s * 0.45, 0.08 + s * 0.2];
  } else {
    // Yellow to white-hot
    const s = (t - 0.8) / 0.2;
    return [1.0, 0.95 + s * 0.05, 0.28 + s * 0.72];
  }
}

// ─── Brain Mesh Component ────────────────────────────────────────────────────

function BrainMesh({
  brainData,
  currentTimestep,
  playbackSpeed,
}: {
  brainData: BrainData;
  currentTimestep: number;
  playbackSpeed: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const colorsRef = useRef<Float32Array | null>(null);
  const prevColorsRef = useRef<Float32Array | null>(null);
  const transitionRef = useRef(0);
  const prevTimestepRef = useRef(-1);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(brainData.vertices, 3));
    geo.setIndex(new THREE.BufferAttribute(brainData.faces, 1));
    geo.computeVertexNormals();

    // Init colors
    const colors = new Float32Array(brainData.meta.numVertices * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return geo;
  }, [brainData]);

  // Update colors on timestep change with interpolation
  useFrame((_, delta) => {
    if (!geometry) return;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    if (!colorAttr) return;

    const ts = Math.floor(currentTimestep) % brainData.meta.numTimesteps;
    const nextTs = (ts + 1) % brainData.meta.numTimesteps;
    const frac = currentTimestep % 1; // fractional part for interpolation

    const { activationMin: min, activationMax: max } = brainData.meta;
    const currentAct = brainData.activations[ts];
    const nextAct = brainData.activations[nextTs];
    const colors = colorAttr.array as Float32Array;

    for (let i = 0; i < brainData.meta.numVertices; i++) {
      const val = currentAct[i] * (1 - frac) + nextAct[i] * frac;
      const [r, g, b] = activationToColor(val, min, max);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    colorAttr.needsUpdate = true;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[Math.PI / 2, Math.PI, 0]}>
      <meshPhongMaterial
        vertexColors
        shininess={15}
        specular={new THREE.Color(0x201008)}
        emissiveIntensity={0.15}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

// ─── Scene setup ─────────────────────────────────────────────────────────────

function SceneSetup() {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 160);
    camera.lookAt(0, 0, 0);
  }, [camera]);
  return null;
}

// ─── Loading spinner ─────────────────────────────────────────────────────────

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      <div
        className="w-8 h-8 rounded-full border-2"
        style={{
          borderColor: "rgba(0,212,255,0.15)",
          borderTopColor: "#00d4ff",
          animation: "spin 1s linear infinite",
        }}
      />
      <span className="mt-3 text-xs tracking-widest text-slate-600">LOADING CORTICAL MESH</span>
    </div>
  );
}

// ─── Exported type for custom activations ────────────────────────────────────

export interface CustomActivations {
  activations: Float32Array[];
  meta: {
    numVertices: number;
    numTimesteps: number;
    activationMin: number;
    activationMax: number;
  };
}

// ─── Main Brain Viewer ───────────────────────────────────────────────────────

export default function BrainViewer({
  currentTime,
  duration,
  tribeData,
  customActivations,
}: {
  currentTime: number;
  duration: number;
  tribeData?: TribeTimestep[];
  customActivations?: CustomActivations | null;
}) {
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [manualTimestep, setManualTimestep] = useState(0);
  const animRef = useRef(0);

  // Load mesh geometry + activations (from custom upload or static files)
  useEffect(() => {
    async function load() {
      try {
        // Always load mesh geometry from static files
        const [vertRes, faceRes] = await Promise.all([
          fetch("/brain_vertices.bin"),
          fetch("/brain_faces.bin"),
        ]);

        const vertBuf = await vertRes.arrayBuffer();
        const faceBuf = await faceRes.arrayBuffer();
        const vertices = new Float32Array(vertBuf);
        const faces = new Uint32Array(faceBuf);

        let activations: Float32Array[];
        let meta: BrainMeta;

        if (customActivations) {
          // Use uploaded activation data
          activations = customActivations.activations;
          meta = {
            numVertices: customActivations.meta.numVertices,
            numFaces: faces.length / 3,
            numTimesteps: customActivations.meta.numTimesteps,
            vertexDims: 3,
            faceDims: 3,
            activationMin: customActivations.meta.activationMin,
            activationMax: customActivations.meta.activationMax,
          };
        } else {
          // Load default activations from static files
          const [metaRes, actRes] = await Promise.all([
            fetch("/brain_meta.json"),
            fetch("/brain_activations.bin"),
          ]);

          meta = await metaRes.json();
          const actBuf = await actRes.arrayBuffer();
          const allActivations = new Float32Array(actBuf);

          activations = [];
          for (let t = 0; t < meta.numTimesteps; t++) {
            const offset = t * meta.numVertices;
            activations.push(allActivations.slice(offset, offset + meta.numVertices));
          }
        }

        const stats = activations.map((act, t) =>
          computeTimestepStats(act, tribeData?.[t])
        );
        setBrainData({ vertices, faces, activations, meta, stats });
        setLoading(false);
      } catch (err) {
        console.error("Failed to load brain data:", err);
      }
    }
    load();
  }, [tribeData, customActivations]);

  // Map video time to timestep
  const currentTimestep = useMemo(() => {
    if (!brainData || duration <= 0) return manualTimestep;
    // Map currentTime linearly across timesteps
    const t = (currentTime / duration) * (brainData.meta.numTimesteps - 1);
    return Math.max(0, Math.min(brainData.meta.numTimesteps - 1, t));
  }, [brainData, currentTime, duration, manualTimestep]);

  // Auto-play animation when video is not controlling
  useEffect(() => {
    if (duration > 0) return; // Video is controlling
    if (!isPlaying || !brainData) return;

    let frame: number;
    let lastTime = performance.now();
    const speed = 0.3; // timesteps per second

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      setManualTimestep((prev) => (prev + dt * speed) % brainData.meta.numTimesteps);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, brainData, duration]);

  const tsIdx = Math.floor(currentTimestep) % (brainData?.meta.numTimesteps ?? 1);
  const stats = brainData?.stats?.[tsIdx] ?? null;

  // Interpret the neural response
  const getEngagementLevel = (pct: number) => {
    if (pct > 60) return { label: "High", color: "#34d399" };
    if (pct > 35) return { label: "Moderate", color: "#00d4ff" };
    return { label: "Low", color: "#f59e0b" };
  };

  const engagement = stats ? getEngagementLevel(stats.pctActivated) : null;

  return (
    <div className="relative w-full flex flex-col">
      {/* 3D Canvas */}
      <div className="relative" style={{ height: "240px" }}>
        {loading && <LoadingOverlay />}
        {brainData && (
          <>
            <Canvas
              gl={{ antialias: true, alpha: true }}
              style={{ background: "transparent" }}
              camera={{ fov: 45, near: 0.1, far: 500 }}
            >
              <SceneSetup />
              <ambientLight intensity={0.5} />
              <directionalLight position={[50, 50, 50]} intensity={1.0} color="#e0f0ff" />
              <directionalLight position={[-30, -20, 40]} intensity={0.5} color="#00d4ff" />
              <pointLight position={[0, 60, 0]} intensity={0.4} color="#00d4ff" />
              <BrainMesh
                brainData={brainData}
                currentTimestep={currentTimestep}
                playbackSpeed={0.3}
              />
              <OrbitControls
                enableDamping
                dampingFactor={0.08}
                rotateSpeed={0.5}
                enableZoom
                zoomSpeed={0.6}
                minDistance={80}
                maxDistance={250}
                enablePan={false}
              />
            </Canvas>

            {/* Color Legend — left side */}
            <div
              className="absolute top-3 left-3 flex items-stretch gap-1.5"
              style={{ pointerEvents: "none" }}
            >
              <div
                className="w-[6px] rounded-full"
                style={{
                  height: "80px",
                  background: "linear-gradient(to bottom, #fffbe0, #ffb020, #cc3300, #1a0500)",
                }}
              />
              <div className="flex flex-col justify-between py-0.5" style={{ height: "80px" }}>
                <span className="text-[7px] tracking-wider text-slate-400">PEAK</span>
                <span className="text-[7px] tracking-wider text-slate-500">ACTIVE</span>
                <span className="text-[7px] tracking-wider text-slate-600">BASELINE</span>
                <span className="text-[7px] tracking-wider text-slate-700">SUPPRESSED</span>
              </div>
            </div>

            {/* Controls hint — top right */}
            <div className="absolute top-2 right-3" style={{ pointerEvents: "none" }}>
              <span className="text-[8px] tracking-widest text-slate-700 uppercase">
                Drag to rotate
              </span>
            </div>

            {/* Timestep indicator — bottom */}
            <div
              className="absolute bottom-1 left-3 right-3 flex items-center gap-2"
              style={{ pointerEvents: "none" }}
            >
              <span className="text-[9px] tracking-widest text-slate-600 uppercase">
                T={tsIdx + 1}/{brainData.meta.numTimesteps}
              </span>
              <div className="flex-1 h-[2px] rounded-full" style={{ background: "rgba(0,212,255,0.1)" }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(currentTimestep / (brainData.meta.numTimesteps - 1)) * 100}%`,
                    background: "linear-gradient(90deg, #0e4a6e, #00d4ff)",
                    boxShadow: "0 0 4px rgba(0,212,255,0.3)",
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Stats Panel — below the brain */}
      {stats && (
        <div
          className="mt-1 grid gap-x-3 px-1"
          style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          {/* Cortical Engagement */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-widest text-slate-600 uppercase">Engagement</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-light" style={{ color: engagement!.color }}>
                {stats.pctActivated.toFixed(0)}%
              </span>
              <span className="text-[8px]" style={{ color: engagement!.color }}>
                {engagement!.label}
              </span>
            </div>
            <span className="text-[7px] text-slate-700">
              cortical surface activated
            </span>
          </div>

          {/* Focus — dominant brain region */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-widest text-slate-600 uppercase">Focus</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] font-light text-cyan-400 leading-tight">
                {stats.dominantRegion}
              </span>
            </div>
            <span className="text-[7px] text-slate-700">
              {stats.dominantDescription}
            </span>
          </div>

          {/* Cognitive Conflict / Suppression */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] tracking-widest text-slate-600 uppercase">Cognitive Conflict</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-light" style={{ color: stats.pctSuppressed > 20 ? "#f87171" : stats.pctSuppressed > 10 ? "#f59e0b" : "#34d399" }}>
                {stats.pctSuppressed.toFixed(0)}%
              </span>
              <span className="text-[8px]" style={{ color: stats.pctSuppressed > 20 ? "#f87171" : stats.pctSuppressed > 10 ? "#f59e0b" : "#34d399" }}>
                {stats.pctSuppressed > 20 ? "High" : stats.pctSuppressed > 10 ? "Moderate" : "Low"}
              </span>
            </div>
            <span className="text-[7px] text-slate-700">
              regions actively suppressed
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
