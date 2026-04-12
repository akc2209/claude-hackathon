"use client";

import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

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
  { name: "Visual Cortex", startPct: 0, endPct: 0.12, description: "processing visual input" },
  { name: "Parietal Lobe", startPct: 0.12, endPct: 0.24, description: "spatial awareness & attention" },
  { name: "Motor Cortex", startPct: 0.24, endPct: 0.34, description: "movement & action planning" },
  { name: "Prefrontal Cortex", startPct: 0.34, endPct: 0.50, description: "decision-making & focus" },
  { name: "Temporal Lobe", startPct: 0.50, endPct: 0.65, description: "language & memory" },
  { name: "Fusiform Gyrus", startPct: 0.65, endPct: 0.75, description: "face & object recognition" },
  { name: "Cingulate Cortex", startPct: 0.75, endPct: 0.85, description: "emotion & conflict monitoring" },
  { name: "Insular Cortex", startPct: 0.85, endPct: 1.0, description: "interoception & salience" },
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

function computeTimestepStats(activations: Float32Array): TimestepStats {
  const n = activations.length;
  const hemiSize = Math.floor(n / 2);
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

  // Find dominant region by mean activation per region (both hemispheres)
  let bestRegion = CORTICAL_REGIONS[0];
  let bestMean = -Infinity;
  for (const region of CORTICAL_REGIONS) {
    let regionSum = 0;
    let regionCount = 0;
    // Left hemisphere
    const lStart = Math.floor(region.startPct * hemiSize);
    const lEnd = Math.floor(region.endPct * hemiSize);
    for (let i = lStart; i < lEnd; i++) {
      regionSum += activations[i];
      regionCount++;
    }
    // Right hemisphere
    const rStart = hemiSize + Math.floor(region.startPct * hemiSize);
    const rEnd = hemiSize + Math.floor(region.endPct * hemiSize);
    for (let i = rStart; i < rEnd; i++) {
      regionSum += activations[i];
      regionCount++;
    }
    const regionMean = regionCount > 0 ? regionSum / regionCount : 0;
    if (regionMean > bestMean) {
      bestMean = regionMean;
      bestRegion = region;
    }
  }

  return {
    mean,
    std: Math.sqrt(sqSum / n),
    min,
    max,
    pctActivated: (activated / n) * 100,
    pctSuppressed: (suppressed / n) * 100,
    dominantRegion: bestRegion.name,
    dominantDescription: bestRegion.description,
  };
}

// ─── Color map: dark → cyan → white hot ──────────────────────────────────────

function activationToColor(value: number, min: number, max: number): [number, number, number] {
  // Normalize to 0-1 with contrast boost (power curve)
  const raw = Math.max(0, Math.min(1, (value - min) / (max - min + 1e-8)));
  const t = Math.pow(raw, 0.6); // gamma compress — pushes more values into visible range

  // Deep navy → electric blue → vivid cyan → magenta-white hot
  if (t < 0.15) {
    // Near-black to deep navy
    const s = t / 0.15;
    return [0.02 + s * 0.02, 0.02 + s * 0.03, 0.06 + s * 0.12];
  } else if (t < 0.35) {
    // Deep navy to electric blue
    const s = (t - 0.15) / 0.2;
    return [0.04 + s * 0.02, 0.05 + s * 0.2, 0.18 + s * 0.62];
  } else if (t < 0.55) {
    // Electric blue to vivid cyan
    const s = (t - 0.35) / 0.2;
    return [0.06 - s * 0.04, 0.25 + s * 0.6, 0.8 + s * 0.2];
  } else if (t < 0.7) {
    // Vivid cyan to bright green-cyan
    const s = (t - 0.55) / 0.15;
    return [0.02 + s * 0.15, 0.85 + s * 0.15, 1.0 - s * 0.1];
  } else if (t < 0.85) {
    // Green-cyan to yellow-hot
    const s = (t - 0.7) / 0.15;
    return [0.17 + s * 0.83, 1.0, 0.9 - s * 0.5];
  } else {
    // Yellow to magenta-white (peak hotspot)
    const s = (t - 0.85) / 0.15;
    return [1.0, 1.0 - s * 0.2, 0.4 + s * 0.6];
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
        specular={new THREE.Color(0x0a1520)}
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

// ─── Main Brain Viewer ───────────────────────────────────────────────────────

export default function BrainViewer({
  currentTime,
  duration,
}: {
  currentTime: number;
  duration: number;
}) {
  const [brainData, setBrainData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [manualTimestep, setManualTimestep] = useState(0);
  const animRef = useRef(0);

  // Load binary data
  useEffect(() => {
    async function load() {
      try {
        const [metaRes, vertRes, faceRes, actRes] = await Promise.all([
          fetch("/brain_meta.json"),
          fetch("/brain_vertices.bin"),
          fetch("/brain_faces.bin"),
          fetch("/brain_activations.bin"),
        ]);

        const meta: BrainMeta = await metaRes.json();
        const vertBuf = await vertRes.arrayBuffer();
        const faceBuf = await faceRes.arrayBuffer();
        const actBuf = await actRes.arrayBuffer();

        const vertices = new Float32Array(vertBuf);
        const faces = new Uint32Array(faceBuf);
        const allActivations = new Float32Array(actBuf);

        // Split activations by timestep
        const activations: Float32Array[] = [];
        for (let t = 0; t < meta.numTimesteps; t++) {
          const offset = t * meta.numVertices;
          activations.push(allActivations.slice(offset, offset + meta.numVertices));
        }

        const stats = activations.map(computeTimestepStats);
        setBrainData({ vertices, faces, activations, meta, stats });
        setLoading(false);
      } catch (err) {
        console.error("Failed to load brain data:", err);
      }
    }
    load();
  }, []);

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
                  background: "linear-gradient(to bottom, #fff4a0, #00d4ff, #0055aa, #0a1530)",
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
