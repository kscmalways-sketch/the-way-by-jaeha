import { NextRequest, NextResponse } from 'next/server'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

// ── Types ──────────────────────────────────────────────
interface Payload {
  goal: string
  answers: Record<string, string> | null
  error: string | null
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
  | { type: 'error_solution'; cause: string; solution: string; improved_prompt: string; retry_instruction: string }

// ── Route Handler ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const payload: Payload = await req.json()

    if (!OPENAI_API_KEY || !GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'API keys not configured on server.' },
        { status: 500 }
      )
    }

    const system = buildSystem(payload)
    const user   = buildUser(payload)

    // Dual AI: call OpenAI + Gemini in parallel
    const results = await Promise.allSettled([
  callOpenAI(system, user),
  callGemini(system, user),
])

const gptResult =
  results[0].status === 'fulfilled' ? results[0].value : null

const gemResult =
  results[1].status === 'fulfilled' ? results[1].value : null


    const merged = merge(gptResult, gemResult)
    return NextResponse.json(merged)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── OpenAI ─────────────────────────────────────────────
async function callOpenAI(system: string, user: string): Promise<AIResult | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    }),
  })

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return parseJSON(data.choices?.[0]?.message?.content ?? '')
}

// ── Gemini ─────────────────────────────────────────────
async function callGemini(system: string, user: string): Promise<AIResult | null> {
  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY 없음")
      return null
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${system}\n\n${user}` }] }],
          generationConfig: { temperature: 0.4 },
        }),
      }
    )

    // 🔥 응답 실패 디버깅
    if (!res.ok) {
      const errText = await res.text()
      console.error("🔥 Gemini API Error:", errText)
      return null // ← 여기 중요 (throw ❌)
    }

    const data = await res.json()

    console.log("✅ Gemini raw response:", JSON.stringify(data))

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!text) {
      console.error("❌ Gemini 응답 text 없음", data)
      return null
    }

    return parseJSON(text)

  } catch (err) {
    console.error("💥 Gemini 호출 실패:", err)
    return null
  }
}



// ── Merge dual results ──────────────────────────────────
function merge(a: AIResult | null, b: AIResult | null): AIResult {
  if (!a && !b) throw new Error('두 AI 모두 유효한 응답을 반환하지 않았습니다.')
  if (!a) return b!
  if (!b) return a

  if (a.type !== b.type) return a

  if (a.type === 'form' && b.type === 'form') {
    const seen = new Set<string>()
    const fields: FormField[] = []
    ;[...a.fields, ...b.fields].forEach(f => {
      if (!seen.has(f.key)) { seen.add(f.key); fields.push(f) }
    })
    return { type: 'form', fields: fields.slice(0, 6) }
  }

  if (a.type === 'roadmap' && b.type === 'roadmap') {
    const steps = a.steps.map((s, i) => {
      const bs = b.steps[i]
      return {
        ...s,
        description:
          s.description.length >= (bs?.description?.length ?? 0)
            ? s.description : (bs?.description ?? s.description),
        prompt:
          s.prompt.length >= (bs?.prompt?.length ?? 0)
            ? s.prompt : (bs?.prompt ?? s.prompt),
      }
    })
    return { type: 'roadmap', steps }
  }

  if (a.type === 'error_solution' && b.type === 'error_solution') {
    return {
      type: 'error_solution',
      cause:              a.cause              || b.cause,
      solution:           a.solution           || b.solution,
      improved_prompt:
        (a.improved_prompt?.length ?? 0) >= (b.improved_prompt?.length ?? 0)
          ? a.improved_prompt : b.improved_prompt,
      retry_instruction:  a.retry_instruction  || b.retry_instruction,
    }
  }

  return a
}

// ── Prompt builders ─────────────────────────────────────
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
{"type":"form","fields":[{"key":"camelCase","label":"Korean label","placeholder":"Korean hint","required":true}]}
Rules: Max 5 fields. Ask specific items only: projectName, targetUsers, platform, desiredStyle, keyFeatures.`
  }

  if (p.forceRoadmap) {
    return `You are an AI Prompt OS. Generate the roadmap NOW. Auto-fill any missing data intelligently.
Return ONLY valid JSON (no markdown):
{"type":"roadmap","steps":[{"step":"Korean title","description":"Korean explanation","ai":"Best AI tool name","prompt":"Complete English prompt, all user details included, zero placeholders"}]}
Generate 5–7 steps. Every prompt must be copy-paste ready.`
  }

  return `You are an AI Prompt OS. Analyze the user's answers carefully.
If ONE critical piece of information is truly missing, ask ONE follow-up (this can happen max 1 time total).
Otherwise generate the roadmap immediately — auto-fill non-critical blanks.

Follow-up JSON:
{"type":"form","fields":[{"key":"camelCase","label":"Korean","placeholder":"Korean hint","required":true}]}

Roadmap JSON:
{"type":"roadmap","steps":[{"step":"Korean title","description":"Korean explanation","ai":"ChatGPT / Gemini / Claude / Midjourney / Perplexity / etc.","prompt":"Complete English prompt, user-specific, zero placeholders"}]}

Rules:
- 5–7 steps
- Choose best AI per step dynamically
- Every prompt must include the user's actual inputs
- Return ONLY JSON`
}

function buildUser(p: Payload): string {
  let msg = `Goal: ${p.goal}`
  if (p.answers) {
    msg += '\n\nUser answers:\n'
    Object.entries(p.answers).forEach(([k, v]) => { msg += `- ${k}: ${v}\n` })
  }
  if (p.error) msg += `\n\nError encountered: ${p.error}`
  return msg
}

// ── JSON parser ─────────────────────────────────────────
function parseJSON(text: string): AIResult | null {
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const start = clean.indexOf('{')
    const end   = clean.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    return JSON.parse(clean.slice(start, end + 1)) as AIResult
  } catch {
    return null
  }
}
