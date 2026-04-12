import Anthropic from "@anthropic-ai/sdk";
import { TribeTimestep } from "@/lib/types";

const BRAIN_REGIONS_REFERENCE = `
Brain Region Reference:
- Inferotemporal cortex: Object recognition, face processing, visual memory
- Fusiform gyrus: Face recognition, word recognition, color processing
- Orbitofrontal cortex: Reward processing, decision making, emotional valuation
- Prefrontal cortex: Executive function, working memory, cognitive control, meaning-making
- V1: Primary visual processing, edge detection, basic visual features
- V2: Secondary visual processing, depth perception, figure-ground separation
- V4: Color processing, form perception, mid-level visual features
- Superior temporal sulcus: Biological motion, social cues, audiovisual integration
- Posterior parietal cortex: Spatial attention, visuospatial processing, action planning
- Anterior cingulate cortex: Conflict monitoring, error detection, emotional regulation
`;

const SYSTEM_PROMPT = `You are a computational neuroscience interpreter. You receive cortical activation predictions from TRIBE v2 — a model that predicts fMRI-style brain responses to video stimuli. Your task: for each timestep, identify which brain regions show highest activation and synthesize a 1–2 sentence human-readable insight about what cognitive or emotional process is likely occurring.

Use precise but accessible language. Do not overclaim causation — use hedged language such as "associated with" and "consistent with".

${BRAIN_REGIONS_REFERENCE}

CRITICAL OUTPUT FORMAT: Output each insight as a separate JSON object on its own line (NDJSON format). No array brackets. No commas between objects. One complete JSON object per line. No markdown. No preamble. No trailing text.

Each line must be a valid JSON object matching this schema exactly:
{"timestamp_sec": number, "top_regions": [string], "insight": string, "tags": [string]}`;

export async function POST(req: Request) {
  const { tribeData }: { tribeData: TribeTimestep[] } = await req.json();

  const client = new Anthropic();

  const userMessage = `Analyze these TRIBE v2 cortical activation arrays and generate one insight per timestep. Output as NDJSON — one JSON object per line.

${JSON.stringify(tribeData, null, 2)}`;

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        });

        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n__ERROR__:${error}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
