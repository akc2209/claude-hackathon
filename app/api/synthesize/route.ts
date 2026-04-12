import Anthropic from "@anthropic-ai/sdk";
import { TribeTimestep } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

// Load env manually as fallback
function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  throw new Error("ANTHROPIC_API_KEY not found");
}

const SYSTEM_PROMPT = `You are a neuroscience-powered creative analyst. You receive cortical activation predictions from TRIBE v2 — a model that predicts fMRI-style brain responses to video stimuli — and translate them into plain-language insights for marketing teams, brand managers, and content creators who have no neuroscience background.

Your output has three layers:

1. SCORECARD: A summary for performance marketers. Include an overall attention score (0–100), the timestamp of peak engagement, the timestamp of the biggest drop-off, and one specific recommended edit in plain English.

2. EMOTIONAL ARC: A 3-paragraph narrative for creative directors. Describe what the video does to a viewer's brain from open to close — what's working, where momentum is lost, and whether the ending lands. No jargon. Write like a strategist debriefing a creative team, not a scientist writing a paper.

3. TIMESTEP TIMELINE: A moment-by-moment breakdown for content creators. For each timestep include: an attention score (0–100), a block bar visualization (█ filled, ░ empty, 12 blocks total scaled to score), a short title, a 2–3 sentence plain-English explanation of what the brain is doing and why it matters for the content, and a short emotional feeling label. Flag peak moments with "PEAK" and warning moments with "WARNING".

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

Rules:
- Never use anatomical region names in the scorecard, arc, or timeline. Translate all neuroscience into viewer behavior and emotion.
- Do not overclaim. Say "the brain is processing X" not "the viewer feels X."
- Write for someone who makes ads, not someone who studies brains.
- Output only valid JSON, no markdown, no preamble.

Output schema:
{
  "scorecard": {
    "attention_score": number (0-100),
    "peak_moment_sec": number,
    "dropoff_moment_sec": number,
    "recommended_edit": "string — one specific, actionable suggestion in plain English"
  },
  "emotional_arc": {
    "opening": "string — what happens in the first few seconds neurologically",
    "middle": "string — where momentum builds or is lost",
    "closing": "string — whether the ending and CTA land at full or reduced power"
  },
  "timeline": [
    {
      "timestamp_sec": number,
      "attention_score": number (0-100),
      "bar": "string — 12 blocks using █ and ░ scaled to score",
      "title": "string — short label",
      "insight": "string — 2-3 sentences, plain English, no jargon",
      "feeling": "string — short emotional label",
      "flag": "PEAK" | "WARNING" | null
    }
  ]
}`;

export async function POST(req: Request) {
  const { tribeData }: { tribeData: TribeTimestep[] } = await req.json();

  const client = new Anthropic({
    apiKey: getApiKey(),
  });

  const userMessage = `Here is the TRIBE v2 cortical activation data for this video.
Each timestep shows the top 10 brain regions by activation magnitude.
Analyze this and return your full three-layer output as valid JSON.

${JSON.stringify(tribeData, null, 2)}`;

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
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
