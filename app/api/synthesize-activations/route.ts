import Anthropic from "@anthropic-ai/sdk";
import { TribeTimestep } from "@/lib/types";
import { readFileSync } from "fs";
import { join } from "path";

function getApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const envFile = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const match = envFile.match(/ANTHROPIC_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  throw new Error("ANTHROPIC_API_KEY not found");
}

interface TimestepStat {
  timestep: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  pctActivated: number;
  pctSuppressed: number;
}

const SYSTEM_PROMPT = `You are a neuroscience-powered creative analyst. You receive cortical activation data — either TRIBE v2 ROI predictions or raw vertex-level activation statistics — and translate them into plain-language insights.

Your output has three layers:

1. SCORECARD: A summary with an overall attention score (0–100), the timestamp of peak engagement, the timestamp of the biggest drop-off, and one specific recommended insight.

2. EMOTIONAL ARC: A 3-paragraph narrative describing what the brain is doing across the stimuli — what's working, where momentum is lost, and whether activation sustains or fades. No jargon. Write like a strategist debriefing a team.

3. TIMESTEP TIMELINE: A moment-by-moment breakdown. For each timestep include: an attention score (0–100), a block bar visualization (█ filled, ░ empty, 12 blocks total scaled to score), a short title, a 2–3 sentence plain-English explanation of what the brain is doing and why it matters, and a short emotional feeling label. Flag peak moments with "PEAK" and warning moments with "WARNING".

When working with raw activation statistics (no ROI names), interpret:
- High mean activation = strong overall engagement
- High std = mixed response (some regions very active, others quiet)
- High pctActivated = broad cortical engagement
- High pctSuppressed = cognitive conflict or selective attention

Rules:
- Never use anatomical region names. Translate into viewer behavior and emotion.
- Do not overclaim. Say "the brain is processing X" not "the viewer feels X."
- Output only valid JSON, no markdown, no preamble.

Output schema:
{
  "scorecard": {
    "attention_score": number (0-100),
    "peak_moment_sec": number,
    "dropoff_moment_sec": number,
    "recommended_edit": "string — one specific, actionable insight"
  },
  "emotional_arc": {
    "opening": "string",
    "middle": "string",
    "closing": "string"
  },
  "timeline": [
    {
      "timestamp_sec": number,
      "attention_score": number (0-100),
      "bar": "string — 12 blocks using █ and ░ scaled to score",
      "title": "string — short label",
      "insight": "string — 2-3 sentences, plain English",
      "feeling": "string — short emotional label",
      "flag": "PEAK" | "WARNING" | null
    }
  ]
}`;

export async function POST(req: Request) {
  const body = await req.json();
  const { tribeData, activationStats } = body as {
    tribeData?: TribeTimestep[];
    activationStats?: TimestepStat[];
  };

  const client = new Anthropic({ apiKey: getApiKey() });

  let dataDescription: string;
  let numTimesteps: number;
  if (tribeData && tribeData.length > 0) {
    numTimesteps = tribeData.length;
    dataDescription = `TRIBE v2 cortical activation data (ROI-level, ${numTimesteps} timesteps):
${JSON.stringify(tribeData, null, 2)}`;
  } else if (activationStats && activationStats.length > 0) {
    numTimesteps = activationStats.length;
    dataDescription = `Raw cortical activation statistics per timestep (${numTimesteps} timesteps of vertex-level fMRI-style data):
${JSON.stringify(activationStats, null, 2)}`;
  } else {
    return new Response("No data provided", { status: 400 });
  }

  // For large datasets, instruct Claude to sample key moments
  const timelineInstruction = numTimesteps > 15
    ? `\n\nIMPORTANT: There are ${numTimesteps} timesteps. For the TIMELINE section, select the 8-12 most significant moments (peaks, drops, transitions) rather than listing every timestep. Use the timestep index as timestamp_sec.`
    : "";

  const userMessage = `Here is the cortical activation data. Analyze this and return your full three-layer output as valid JSON.${timelineInstruction}

${dataDescription}`;

  const encoder = new TextEncoder();
  const MAX_RETRIES = 3;

  const readable = new ReadableStream({
    async start(controller) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const stream = client.messages.stream({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8000,
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
          controller.close();
          return;
        } catch (err) {
          const errStr = String(err);
          const isRetryable =
            errStr.includes("overloaded") ||
            errStr.includes("529") ||
            errStr.includes("rate_limit") ||
            errStr.includes("500");
          if (isRetryable && attempt < MAX_RETRIES - 1) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            continue;
          }
          let userMsg = "Analysis failed";
          if (errStr.includes("overloaded")) {
            userMsg = "Claude API is temporarily overloaded. Please try again in a moment.";
          } else if (errStr.includes("rate_limit")) {
            userMsg = "Rate limit reached. Please wait a moment and retry.";
          } else if (err instanceof Error) {
            userMsg = err.message;
          }
          controller.enqueue(encoder.encode(`\n__ERROR__:${userMsg}`));
          break;
        }
      }
      controller.close();
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
