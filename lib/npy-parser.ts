/**
 * Client-side .npy file parser.
 * Parses NumPy v1.0/v2.0 .npy binary format and returns typed arrays.
 * Reference: https://numpy.org/doc/stable/reference/generated/numpy.lib.format.html
 */

export interface NpyResult {
  shape: number[];
  dtype: string;
  data: Float32Array;
}

export interface ParsedActivations {
  activations: Float32Array[];
  meta: {
    numVertices: number;
    numTimesteps: number;
    activationMin: number;
    activationMax: number;
  };
}

const MAGIC = new Uint8Array([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]); // \x93NUMPY

export function parseNpy(buffer: ArrayBuffer): NpyResult {
  const bytes = new Uint8Array(buffer);

  // Verify magic
  for (let i = 0; i < 6; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new Error("Not a valid .npy file (bad magic bytes)");
    }
  }

  const majorVersion = bytes[6];
  // const minorVersion = bytes[7]; // unused but parsed

  // Header length
  let headerLen: number;
  let headerOffset: number;
  if (majorVersion === 1) {
    headerLen = bytes[8] | (bytes[9] << 8);
    headerOffset = 10;
  } else if (majorVersion === 2) {
    headerLen = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
    headerOffset = 12;
  } else {
    throw new Error(`Unsupported .npy version: ${majorVersion}`);
  }

  // Parse header (Python dict literal)
  const headerStr = new TextDecoder().decode(bytes.slice(headerOffset, headerOffset + headerLen));
  const dataOffset = headerOffset + headerLen;

  // Extract 'descr' (dtype)
  const descrMatch = headerStr.match(/'descr'\s*:\s*'([^']+)'/);
  if (!descrMatch) throw new Error("Could not parse dtype from .npy header");
  const descr = descrMatch[1];

  // Extract 'fortran_order'
  const fortranMatch = headerStr.match(/'fortran_order'\s*:\s*(True|False)/);
  const fortranOrder = fortranMatch?.[1] === "True";
  if (fortranOrder) throw new Error("Fortran-order arrays not supported");

  // Extract 'shape'
  const shapeMatch = headerStr.match(/'shape'\s*:\s*\(([^)]*)\)/);
  if (!shapeMatch) throw new Error("Could not parse shape from .npy header");
  const shape = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);

  // Parse data based on dtype
  const rawData = buffer.slice(dataOffset);
  let float32Data: Float32Array;

  // Strip endianness prefix for matching
  const dtypeBase = descr.replace(/^[<>=|]/, "");

  if (dtypeBase === "f4") {
    // float32 — direct view
    float32Data = new Float32Array(rawData);
  } else if (dtypeBase === "f8") {
    // float64 — convert to float32
    const f64 = new Float64Array(rawData);
    float32Data = new Float32Array(f64.length);
    for (let i = 0; i < f64.length; i++) {
      float32Data[i] = f64[i];
    }
  } else {
    throw new Error(
      `Unsupported dtype "${descr}". Expected float32 (<f4) or float64 (<f8).`
    );
  }

  return { shape, dtype: descr, data: float32Data };
}

/**
 * Parse a .npy activation file into the format BrainViewer expects.
 * Accepts shapes:
 *   (numTimesteps, numVertices) — multi-timestep
 *   (numVertices,) — single timestep
 */
export function parseActivationNpy(buffer: ArrayBuffer): ParsedActivations {
  const { shape, data } = parseNpy(buffer);

  let numTimesteps: number;
  let numVertices: number;

  if (shape.length === 1) {
    numTimesteps = 1;
    numVertices = shape[0];
  } else if (shape.length === 2) {
    numTimesteps = shape[0];
    numVertices = shape[1];
  } else {
    throw new Error(
      `Expected 1D or 2D array, got shape (${shape.join(", ")})`
    );
  }

  // Split into per-timestep arrays and compute min/max
  const activations: Float32Array[] = [];
  let activationMin = Infinity;
  let activationMax = -Infinity;

  for (let t = 0; t < numTimesteps; t++) {
    const offset = t * numVertices;
    const slice = data.slice(offset, offset + numVertices);
    activations.push(slice);
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] < activationMin) activationMin = slice[i];
      if (slice[i] > activationMax) activationMax = slice[i];
    }
  }

  return {
    activations,
    meta: { numVertices, numTimesteps, activationMin, activationMax },
  };
}
