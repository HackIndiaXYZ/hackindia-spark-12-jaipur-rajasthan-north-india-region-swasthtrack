import Anthropic from "@anthropic-ai/sdk";
import {
  getActivityLogs,
  getBloodPressureLogs,
  getFoodLogs,
  getMedicalConditions,
  getMedicines,
  getPatientProfile,
  getSleepLogs,
  getTodayMedicineLogs,
  getWeightLogs,
} from "@/services/patient-service";

export const runtime = "nodejs";

/**
 * Real-LLM answer path for "Ask SwasthTrack".
 *
 * The rule-based normalizer/temporal-resolver/query-planner pipeline
 * (src/services/ask-*.ts) can only match phrasings its authors anticipated —
 * any question outside its patterns silently falls through to a generic
 * fallback or the wrong time window. This route sidesteps that entirely: it
 * fetches the patient's actual recent records, hands them to Claude together
 * with the user's raw question in whatever phrasing they used, and instructs
 * the model to answer ONLY from that data — refusing honestly instead of
 * guessing when the data doesn't cover the question. ask-orchestrator-service
 * calls this first and falls back to the rule-based pipeline only if it
 * errors (no API key configured, network failure, etc.), so the feature
 * degrades gracefully rather than hard-failing.
 *
 * Provider: uses the Anthropic API directly when ANTHROPIC_API_KEY is set
 * (lowest latency, no middleman, needs a paid key), otherwise falls back to
 * OpenRouter (OPENROUTER_API_KEY) — defaults to a free-tier model there, so
 * this runs at zero cost on an OpenRouter key with no balance. OpenRouter's
 * chat completions endpoint is OpenAI-compatible, not the Anthropic SDK shape.
 */

const SYSTEM_PROMPT = `You are the "Ask SwasthTrack" assistant inside a Hindi-first family health-tracking app. You answer questions about ONE specific patient's logged health data: blood pressure, weight, food/calories, sleep, activity/steps, and medicine adherence.

Non-negotiable rules:
1. Answer using ONLY the DATA block in the user message. Never invent, estimate, round unusually, or assume any number, date, or fact that is not literally present in DATA.
2. If DATA does not contain enough information to answer confidently, set "isRefusal": true and explain in "refusalReason" what's missing — do not guess or approximate.
3. Never give a medical diagnosis, never suggest changing a medicine dose or starting/stopping a medicine, never claim to interpret symptoms. If asked for any of that, refuse (isRefusal: true, safetyLevel: "escalate") and say to consult the patient's own doctor.
4. Every concrete number or date in your answer must be traceable to a specific entry in DATA.
5. The user may ask in Hindi, Hinglish, or English, in any phrasing, casual or precise. Understand their actual intent regardless of exact wording — do not require a specific keyword.
6. Write naturally in a warm Hindi-English mix (Devanagari script mixed with English words), the way a caring Indian family health app speaks to someone checking on a parent — not stiff or overly formal. Keep it concise: a few sentences, not an essay.
7. "today" / "aaj" means the date given as CURRENT_DATE below, in Asia/Kolkata time.

Respond with ONLY a single JSON object — no markdown fencing, no extra prose before or after — exactly matching this shape:
{
  "answerHi": string,
  "answerEn": string,
  "citedDates": string[],
  "confidence": "high" | "medium" | "low",
  "isRefusal": boolean,
  "refusalReason": string | null,
  "safetyLevel": "info" | "attention" | "escalate"
}`;

export interface AskLLMAnswer {
  answerHi: string;
  answerEn: string;
  citedDates: string[];
  confidence: "high" | "medium" | "low";
  isRefusal: boolean;
  refusalReason: string | null;
  safetyLevel: "info" | "attention" | "escalate";
}

function safeParseAnswer(text: string): AskLLMAnswer {
  // The model is instructed to return raw JSON, but strip an accidental
  // ```json fence defensively rather than failing the whole request on it.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  if (typeof parsed.answerHi !== "string" || typeof parsed.answerEn !== "string") {
    throw new Error("Malformed answer shape from model");
  }
  return {
    answerHi: parsed.answerHi,
    answerEn: parsed.answerEn,
    citedDates: Array.isArray(parsed.citedDates) ? parsed.citedDates : [],
    confidence: parsed.confidence === "low" || parsed.confidence === "medium" ? parsed.confidence : "high",
    isRefusal: Boolean(parsed.isRefusal),
    refusalReason: typeof parsed.refusalReason === "string" ? parsed.refusalReason : null,
    safetyLevel:
      parsed.safetyLevel === "attention" || parsed.safetyLevel === "escalate" ? parsed.safetyLevel : "info",
  };
}

async function buildUserContent(patientId: string | undefined, question: string): Promise<string> {
  // A generous but bounded window — enough for "this month" / "last 60 days"
  // style questions without ballooning the prompt. Fetched concurrently
  // since these are independent reads.
  const [profile, conditions, medicines, bpLogs, weightLogs, foodLogs, sleepLogs, activityLogs, medicineLogsToday] =
    await Promise.all([
      getPatientProfile(patientId),
      getMedicalConditions(patientId),
      getMedicines(patientId),
      getBloodPressureLogs(patientId, 120),
      getWeightLogs(patientId, 120),
      getFoodLogs(patientId, 200),
      getSleepLogs(patientId, 90),
      getActivityLogs(patientId, 90),
      getTodayMedicineLogs(patientId),
    ]);

  const nowIst = new Date().toLocaleString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dataDump = {
    patient: {
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.height_cm,
      currentWeightKg: profile.current_weight_kg,
      targetWeightKg: profile.target_weight_kg,
      dailyCalorieTargetKcal: profile.daily_calorie_target,
    },
    conditions: conditions.map((c) => ({ name: c.condition_name, diagnosedYear: c.diagnosed_year })),
    activeMedicines: medicines
      .filter((m) => m.active)
      .map((m) => ({ name: m.medicine_name, dose: m.dose, scheduledTime: m.scheduled_time, mealRelation: m.meal_relation })),
    medicineLogsToday: medicineLogsToday.map((m) => ({
      scheduledTime: m.scheduled_time,
      takenTime: m.taken_time,
      status: m.status,
    })),
    bloodPressureLogs: bpLogs.map((b) => ({
      date: b.measured_at,
      systolic: b.systolic,
      diastolic: b.diastolic,
      pulse: b.pulse,
      readingType: b.reading_type,
    })),
    weightLogs: weightLogs.map((w) => ({ date: w.measured_at, weightKg: w.weight_kg })),
    foodLogs: foodLogs.map((f) => ({
      date: f.consumed_at,
      mealType: f.meal_type,
      foodName: f.food_name,
      quantity: f.quantity,
      unit: f.unit,
      calories: f.calories,
      proteinG: f.protein_g,
    })),
    sleepLogs: sleepLogs.map((s) => ({ date: s.date, sleepHours: s.sleep_hours })),
    activityLogs: activityLogs.map((a) => ({
      date: a.date,
      steps: a.steps,
      distanceKm: a.distance_km,
      estimatedCaloriesBurned: a.estimated_calories_burned,
    })),
  };

  return `CURRENT_DATE (Asia/Kolkata): ${nowIst}\n\nQuestion: ${question}\n\nDATA (JSON — this is the complete set of records available; anything not in here has not been logged):\n${JSON.stringify(dataDump)}`;
}

async function askAnthropic(userContent: string): Promise<{ text: string; model: string }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("Model returned no text content");
  return { text: textBlock.text, model: response.model };
}

// OpenRouter's chat completions endpoint is OpenAI-compatible (not the
// Anthropic SDK's request/response shape) — plain REST, routed by default to
// a free-tier model (see the model default below) so this costs nothing to
// run without an OpenRouter balance.
async function askOpenRouter(userContent: string): Promise<{ text: string; model: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Free-tier default (verified live via GET https://openrouter.ai/api/v1/models):
      // large context, and explicitly supports response_format/structured_outputs,
      // which this route relies on for reliable JSON parsing. Override via
      // OPENROUTER_MODEL if you'd rather point this at a paid model.
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731:free",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenRouter request failed (${res.status}): ${errBody.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("OpenRouter returned no message content");
  return { text, model: data?.model || process.env.OPENROUTER_MODEL || "anthropic/claude-opus-5" };
}

export async function POST(request: Request) {
  let body: { patientId?: string; question?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  if (!hasAnthropic && !hasOpenRouter) {
    return Response.json(
      { error: "Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is configured on the server" },
      { status: 503 },
    );
  }

  try {
    const userContent = await buildUserContent(body.patientId, question);
    const { text, model } = hasAnthropic ? await askAnthropic(userContent) : await askOpenRouter(userContent);
    const answer = safeParseAnswer(text);
    return Response.json({ answer, model });
  } catch (err) {
    console.error("Ask LLM route error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 },
    );
  }
}
