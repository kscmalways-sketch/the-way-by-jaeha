import { NextRequest, NextResponse } from "next/server";

/**
 * 안전하고 견고한 Dual-AI 라우트 (OpenAI + Gemini 시도, Gemini 실패 시에도 OpenAI 결과 반환)
 * - 배포 환경: Next.js app router /app/api/ai-system/route.ts
 * - 환경변수(필수): OPENAI_API_KEY (권장), GEMINI_API_KEY (선택)
 *
 * 사용법:
 * 1) 이 파일을 /app/api/ai-system/route.ts 로 덮어쓰기 (기존 삭제 후 붙여넣기)
 * 2) Vercel 환경변수에 OPENAI_API_KEY, (선택) GEMINI_API_KEY 등록
 * 3) Commit & Deploy
 */

// (선택) edge runtime 사용 시 주석 해제 가능
export const runtime = "edge";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

/* -------------------------
   타입 정의
   ------------------------- */
interface Payload {
  goal: string;
  answers: Record<string, string> | null;
  error: string | null;
  forceRoadmap?: boolean;
}

interface FormField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
}

interface RoadmapStep {
  step: string;
  description: string;
  ai: string;
  prompt: string;
}

type AIResult =
  | { type: "form"; fields: FormField[] }
  | { type: "roadmap"; steps: RoadmapStep[] }
  | {
      type: "error_solution";
      cause: string;
      solution: string;
      improved_prompt: string;
      retry_instruction: string;
    };

/* -------------------------
   라우트 핸들러
   ------------------------- */
export async function POST(req: NextRequest) {
  const requestId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  console.info(`[${requestId}] POST /api/ai-system start`);

  try {
    const payload = (await req.json()) as Payload;
    console.info(`[${requestId}] payload`, { goal: payload?.goal, hasAnswers: !!payload?.answers });

    // 환경변수 최소 체크 (둘 다 없으면 실패)
    if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
      console.error(`[${requestId}] API keys missing (both OPENAI and GEMINI missing)`);
      return NextResponse.json({ error: "API keys missing" }, { status: 500 });
    }

    const system = buildSystem(payload);
    const user = buildUser(payload);

    // 병렬 호출: OpenAI -> 필수(있는 경우), Gemini -> 옵셔널(있으면 시도하되 실패시 무시)
    const openaiPromise = OPENAI_API_KEY ? callOpenAI(system, user, requestId) : Promise.resolve<AIResult | null>(null);
    const geminiPromise = GEMINI_API_KEY ? callGemini(system, user, requestId) : Promise.resolve<AIResult | null>(null);

    const [gptResult, gemResult] = await Promise.all([openaiPromise, geminiPromise]);

    // 병합
    const merged = mergeResults(gptResult, gemResult);
    console.info(`[${requestId}] merged result type=${merged?.type ?? "null"}`);

    if (!merged) {
      return NextResponse.json({ error: "No valid AI response" }, { status: 500 });
    }
    return NextResponse.json(merged);
  } catch (err) {
    console.error(`[${requestId}] unhandled error`, err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* -------------------------
   OpenAI 호출 (Chat Completions)
   - 안전하게 실패를 throw 하도록 구성 (상위에서 잡음)
   ------------------------- */
async function callOpenAI(system: string, user: string, requestId: string): Promise<AIResult | null> {
  try {
    console.info(`[${requestId}] callOpenAI start`);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 1200,
      }),
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error(`[${requestId}] OpenAI error status=${res.status}`, raw);
      throw new Error(`OpenAI error ${res.status}: ${raw}`);
    }

    // 응답 예측: data.choices[0].message.content
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // raw가 JSON 문자열이 아닐 경우 (정상적이지 않음) -> try to extract text
      parsed = { choices: [{ message: { content: raw } }] };
    }
    const content = parsed?.choices?.[0]?.message?.content ?? "";
    const result = safeParseJSON(content);
    console.info(`[${requestId}] callOpenAI parsed type=${result?.type ?? "null"}`);
    return result;
  } catch (e) {
    console.error(`[${requestId}] callOpenAI failed`, e);
    return null;
  }
}

// --- REPLACE START: callGemini function ---
async function callGemini(system: string, user: string, requestId: string): Promise<AIResult | null> {
  // Gemini 호출을 완전히 비활성화합니다.
  // (로그만 기록하고 null 반환 — merge()에서 OpenAI 결과만 사용됩니다.)
  try {
    console.info(`[${requestId}] Gemini call disabled by config — skipping call.`);
  } catch (e) {
    // 로그 실패하더라도 아무것도 하지 않고 null 반환 보장
  }
  return null;
}
// --- REPLACE END ---


    // Google 응답의 후보 텍스트 추출 시도
    try {
      const data = JSON.parse(txt);
      const text = data?.candidates?.[0]?.content ?? data?.output?.[0]?.content ?? typeof data === "string" ? data : "";
      const parsed = safeParseJSON(text);
      console.info(`[${requestId}] callGemini parsed type=${parsed?.type ?? "null"}`);
      return parsed;
    } catch (err) {
      console.warn(`[${requestId}] Gemini parse error`, err);
      return null;
    }
  } catch (err) {
    console.error(`[${requestId}] callGemini failed`, err);
    return null;
  }
}

/* -------------------------
   결과 병합 로직 (안전하게)
   - a 또는 b가 null이면 다른 쪽 반환
   - 타입이 다르면 OpenAI 우선(return a)
   - 동일 타입이면 필드 병합
   ------------------------- */
function mergeResults(a: AIResult | null, b: AIResult | null): AIResult | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;

  if (a.type !== b.type) {
    // 타입이 다르면 a 우선(일관성)
    return a;
  }

  if (a.type === "form" && b.type === "form") {
    const seen = new Set<string>();
    const fields: FormField[] = [];
    [...a.fields, ...b.fields].forEach((f) => {
      if (!seen.has(f.key)) {
        seen.add(f.key);
        fields.push(f);
      }
    });
    // 안전: 최대 6개로 제한 (UI 제약 고려)
    return { type: "form", fields: fields.slice(0, 6) };
  }

  if (a.type === "roadmap" && b.type === "roadmap") {
    // 단계별로 길이가 긴 설명/프롬프트를 선택
    const maxLen = Math.max(a.steps.length, b.steps.length);
    const steps: RoadmapStep[] = [];
    for (let i = 0; i < maxLen; i++) {
      const sa = a.steps[i];
      const sb = b.steps[i];
      if (!sa && sb) {
        steps.push(sb);
        continue;
      }
      if (!sb && sa) {
        steps.push(sa);
        continue;
      }
      // 둘 다 있으면 병합
      steps.push({
        step: sa.step ?? sb.step,
        description: (sa.description.length >= (sb?.description?.length ?? 0) ? sa.description : sb.description) ?? "",
        ai: sa.ai ?? sb.ai,
        prompt: (sa.prompt.length >= (sb?.prompt?.length ?? 0) ? sa.prompt : sb.prompt) ?? "",
      });
    }
    return { type: "roadmap", steps };
  }

  if (a.type === "error_solution" && b.type === "error_solution") {
    return {
      type: "error_solution",
      cause: a.cause || b.cause,
      solution: a.solution || b.solution,
      improved_prompt: (a.improved_prompt?.length ?? 0) >= (b.improved_prompt?.length ?? 0) ? a.improved_prompt : b.improved_prompt,
      retry_instruction: a.retry_instruction || b.retry_instruction,
    };
  }

  return a;
}

/* -------------------------
   안전한 JSON 파서: 텍스트에서 JSON 객체를 찾아 parse
   - 백틱 코드블록, 마크다운 제거 후 { ... } 추출 시도
   ------------------------- */
function safeParseJSON(text: string): AIResult | null {
  if (!text || typeof text !== "string") return null;
  // 제거: ```json ... ``` 또는 ``` ... ```
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();

  // 가장 먼저 중괄호로 감싸진 JSON 블록 찾기
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const maybe = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(maybe);
    // 타입 검증 (간단)
    if (parsed && typeof parsed === "object" && parsed.type) {
      return parsed as AIResult;
    }
  } catch {
    // 실패 시 null 리턴
    return null;
  }
  return null;
}

/* -------------------------
   시스템 / 사용자 메시지 생성기
   - payload 상태에 따라 system 프롬프트를 정밀 제어
   ------------------------- */
function buildSystem(p: Payload): string {
  if (p.error) {
    return `You are an AI error analyst. Return ONLY valid JSON (no explanation):
{"type":"error_solution","cause":"...","solution":"...","improved_prompt":"...","retry_instruction":"..."}.
Analyze error and provide Korean cause & solution and an English copy-paste-ready improved prompt.`;
  }

  if (!p.answers) {
    return `You are an AI assistant that asks for missing fields required to create a precise roadmap.
Return ONLY valid JSON:
{"type":"form","fields":[{"key":"projectName","label":"Project name","placeholder":"Name of site/app","required":true} , ...]}
Max 5 fields. Ask only essential fields: projectName, targetUsers, platform, style, keyFeatures.`;
  }

  if (p.forceRoadmap) {
    return `You are an AI that must produce a complete roadmap now and auto-fill any missing non-critical fields.
Return ONLY valid JSON:
{"type":"roadmap","steps":[{"step":"...","description":"...","ai":"...","prompt":"Complete English prompt, zero placeholders"}]}
Generate 5-7 steps. Each prompt must be copy-paste ready and include user's inputs.`;
  }

  return `You are an AI assistant that generates a step-by-step roadmap based on user's answers.
If exactly one critical item missing, ask for it (ONE follow-up only). Otherwise generate roadmap and auto-fill minor blanks.
Return ONLY JSON as either a form (ask fields) or a roadmap.
Roadmap step format: {"step":"Korean title","description":"Korean explanation","ai":"Best AI","prompt":"Complete English prompt ready to paste"}.
Rules: 5-7 steps; choose best AI per step; prompts in English and copy-paste ready.`;
}

/* -------------------------
   사용자 메시지 빌더
   ------------------------- */
function buildUser(p: Payload): string {
  let msg = `Goal: ${p.goal ?? ""}`;
  if (p.answers) {
    msg += "\n\nUser answers:\n";
    Object.entries(p.answers).forEach(([k, v]) => {
      msg += `- ${k}: ${v}\n`;
    });
  }
  if (p.error) msg += `\n\nError encountered: ${p.error}`;
  return msg;
}



