// /the-wai/app/api/ai-system/route.ts
import { NextRequest, NextResponse } from 'next/server'

/*
  ChatGPT 전용 버전 (Gemini 비활성화)
  - 환경변수: OPENAI_API_KEY만 필요합니다.
  - 구조: POST 요청으로 payload를 받고 OpenAI에만 요청 -> 결과 반환
  - 안전성: 외부 응답이 JSON이 아닐 경우 안전하게 처리하도록 방어적 파싱 포함
*/

/* ---------------- Types ---------------- */
interface Payload {
  goal: string
  answers?: Record<string, string> | null
  error?: string | null
  forceRoadmap?: boolean
}

interface FormField {
  key: string
  label: string
  placeholder: string
  required: boolean
}

interface RoadmapStep {
  step: string
  description: string
  ai: string
  prompt: string
}

type AIResult =
  | { type: 'form'; fields: FormField[] }
  | { type: 'roadmap'; steps: RoadmapStep[] }
  | {
      type: 'error_solution'
      cause: string
      solution: string
      improved_prompt: string
      retry_instruction: string
    }

/* ---------------- Route Handler ---------------- */
export async function POST(req: NextRequest) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) {
      console.error('[ai-system] OPENAI_API_KEY missing')
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured on server' }, { status: 500 })
    }

    const payload: Payload = await req.json().catch(() => ({} as Payload))

    const system = buildSystem(payload)
    const user = buildUser(payload)

    // 오직 OpenAI (ChatGPT) 만 호출 — Gemini는 사용 안함
    const result = await callOpenAI(system, user, OPENAI_API_KEY)

    if (!result) {
      return NextResponse.json(
        {
          type: 'error_solution',
          cause: 'AI returned non-JSON or empty response',
          solution: 'OpenAI에서 유효한 JSON을 반환하지 않았습니다. 로그 확인 후 반복 시도하세요.',
          improved_prompt:
            'You are an AI assistant. Return a single JSON object of type form/roadmap/error_solution (no markdown).',
          retry_instruction: '서버 로그 확인 후 다시 시도하세요.',
        } as AIResult,
        { status: 200 }
      )
    }

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('[ai-system] unexpected error', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/* ---------------- OpenAI call (ChatGPT only) ---------------- */
async function callOpenAI(system: string, user: string, openaiKey: string): Promise<AIResult | null> {
  const endpoint = 'https://api.openai.com/v1/chat/completions'
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // 필요하면 다른 모델로 변경 가능
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 1500,
      }),
    })

    const text = await res.text()
    if (!res.ok) {
      console.error('[ai-system] OpenAI non-ok response', res.status, text)
      throw new Error(`OpenAI error ${res.status}: ${text}`)
    }

    // assistant message 추출 시도
    let assistantContent = ''
    try {
      const json = JSON.parse(text)
      assistantContent = json.choices?.[0]?.message?.content ?? ''
    } catch {
      // 이미 텍스트로 받았을 수 있음
      assistantContent = text
    }

    const parsed = parseJSON(assistantContent)
    if (!parsed) {
      console.warn('[ai-system] failed to parse AI JSON response. raw=', assistantContent)
      return null
    }
    return parsed
  } catch (err) {
    console.error('[ai-system] callOpenAI failed', err)
    return null
  }
}

/* ---------------- Helpers: build system/user ---------------- */
function buildSystem(p: Payload): string {
  if (p.error) {
    return `You are an AI Prompt OS error analyst. Run 3 internal analysis passes.
Return ONLY valid JSON (no markdown, no explanation):
{"type":"error_solution","cause":"Korean root cause","solution":"Korean step-by-step fix","improved_prompt":"Complete English prompt, ready to copy","retry_instruction":"Korean retry guidance"}`
  }

  if (!p.answers) {
    return `You are an AI Prompt OS assistant.
The user stated a goal. Identify ONLY essential missing information needed for a precise AI roadmap.
Return ONLY valid JSON (no markdown):
{"type":"form","fields":[{"key":"projectName","label":"프로젝트 이름","placeholder":"예: AI tutor","required":true}]}
Rules: Max 5 fields. Ask only specific items.`
  }

  if (p.forceRoadmap) {
    return `You are an AI Prompt OS. Generate the roadmap NOW. Auto-fill any missing data intelligently.
Return ONLY valid JSON (no markdown):
{"type":"roadmap","steps":[{"step":"Korean title","description":"Korean explanation","ai":"ChatGPT","prompt":"Complete English prompt, all user details included, zero placeholders"}]}
Generate 5–7 steps. Every prompt must be copy-paste ready.`
  }

  return `You are an AI Prompt OS. Analyze the user's answers carefully.
If ONE critical piece of information is truly missing, ask ONE follow-up (this can happen max 1 time total).
Otherwise generate the roadmap immediately — auto-fill non-critical blanks.

Follow-up JSON:
{"type":"form","fields":[{"key":"projectName","label":"프로젝트 이름","placeholder":"예: AI tutor","required":true}]}

Roadmap JSON:
{"type":"roadmap","steps":[{"step":"Korean title","description":"Korean explanation","ai":"ChatGPT","prompt":"Complete English prompt, user-specific, zero placeholders"}]}

Rules:
- 5–7 steps
- Choose best AI per step (here ChatGPT)
- Every prompt must include the user's actual inputs
- Return ONLY JSON`
}

function buildUser(p: Payload): string {
  let msg = `Goal: ${p.goal ?? ''}`
  if (p.answers) {
    msg += '\n\nUser answers:\n'
    Object.entries(p.answers).forEach(([k, v]) => {
      msg += `- ${k}: ${v}\n`
    })
  }
  if (p.error) msg += `\n\nError encountered: ${p.error}`
  return msg
}

/* ---------------- Safe JSON parser (defensive) ---------------- */
function parseJSON(text: string): AIResult | null {
  if (!text || typeof text !== 'string') return null
  try {
    // code block 제거
    const clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim()

    // find first brace and last brace (sanity)
    const start = clean.indexOf('{')
    const end = clean.lastIndexOf('}')
    if (start === -1 || end === -1) return null

    const candidate = clean.slice(start, end + 1)

    const parsed = JSON.parse(candidate) as AIResult
    // 간단한 형태 검증
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null
    return parsed
  } catch (err) {
    console.warn('[ai-system] parseJSON error', err)
    return null
  }
}



    
