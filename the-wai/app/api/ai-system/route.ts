// /app/api/ai-system/route.ts
import { NextRequest, NextResponse } from 'next/server'

/* ---------------- Types ---------------- */
type SafePayload = {
  goal?: string
  answers?: Record<string, string> | null
  error?: string | null
  forceRoadmap?: boolean
}

type AIResult =
  | { type: 'form'; fields: unknown[] }
  | { type: 'roadmap'; steps: unknown[] }
  | {
      type: 'error_solution'
      cause: string
      solution: string
      improved_prompt: string
      retry_instruction: string
    }

/* ---------------- Config ---------------- */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? ''
const OPENAI_TIMEOUT_MS = 15_000
const OPENAI_RETRY = 2

/* ---------------- Helpers ---------------- */
function sendJSON(body: unknown, status = 200) {
  return NextResponse.json(body, { status })
}

function safeJSONParse<T = any>(text: string): T | null {
  try {
    // 코드 블럭이나 마크다운 제거
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const jsonStr = cleaned.slice(start, end + 1)
    return JSON.parse(jsonStr) as T
  } catch (e) {
    console.warn('safeJSONParse failed', e)
    return null
  }
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeout = OPENAI_TIMEOUT_MS
) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

/* Exponential backoff retry */
async function openaiCallWithRetry(body: any) {
  const url = 'https://api.openai.com/v1/chat/completions'
  let attempt = 0
  let lastErr: any = null
  while (attempt <= OPENAI_RETRY) {
    try {
      const res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify(body),
        },
        OPENAI_TIMEOUT_MS
      )
      return res
    } catch (err) {
      lastErr = err
      const wait = 300 * Math.pow(2, attempt) // 300ms, 600ms, ...
      await new Promise((r) => setTimeout(r, wait))
      attempt++
    }
  }
  throw lastErr
}

/* ---------------- System / User prompt builders ---------------- */
function buildSystem(p: SafePayload): string {
  if (p.error) {
    return `You are an error analyst. Return ONLY valid JSON:
{"type":"error_solution","cause":"Korean root cause","solution":"Korean step-by-step fix","improved_prompt":"English prompt ready","retry_instruction":"Korean retry guidance"}`
  }

  if (!p.answers) {
    return `You return JSON asking missing fields. Return ONLY:
{"type":"form","fields":[{"key":"projectName","label":"프로젝트 이름","placeholder":"예: My AI app","required":true}]}`
  }

  if (p.forceRoadmap) {
    return `You are a roadmap generator. Return ONLY JSON:
{"type":"roadmap","steps":[{"step":"Step name","description":"Korean description","ai":"ChatGPT","prompt":"English fully filled prompt"}]}`
  }

  return `Analyze answers and produce roadmap or ask at most one follow-up. Return ONLY JSON as 'form' or 'roadmap'.`
}

function buildUser(p: SafePayload) {
  let s = `Goal: ${p.goal ?? ''}\n`
  if (p.answers) {
    for (const [k, v] of Object.entries(p.answers)) s += `${k}: ${v}\n`
  }
  if (p.error) s += `Error: ${p.error}\n`
  return s
}

/* ---------------- OpenAI call + safe parse ---------------- */
async function callOpenAI(system: string, user: string): Promise<AIResult | null> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured')

  const body = {
    model: 'gpt-4o-mini',
    temperature: 0.15,
    max_tokens: 1200,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }

  const res = await openaiCallWithRetry(body)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('OpenAI returned not ok', res.status, text)
    return null
  }
  const txt = await res.text().catch(() => '')
  // Try parse from structured JSON inside content
  // First try to parse as JSON response (some wrappers)
  let parsed = safeJSONParse<AIResult>(txt)
  if (parsed) return parsed

  // If earlier failed, try to parse nested content field
  try {
    const asJson = JSON.parse(txt)
    const content = asJson?.choices?.[0]?.message?.content ?? ''
    parsed = safeJSONParse<AIResult>(content)
    return parsed
  } catch (e) {
    // fallback null
    console.warn('callOpenAI fallback parse failed', e)
    return null
  }
}

/* ---------------- POST handler ---------------- */
export async function POST(req: NextRequest) {
  try {
    // Content-Type check
    const ct = req.headers.get('content-type') ?? ''
    if (!ct.includes('application/json')) {
      return sendJSON({ error: 'content-type must be application/json' }, 400)
    }

    // Parse body safely
    let payload: SafePayload = {}
    try {
      payload = (await req.json()) as SafePayload
    } catch {
      payload = {}
    }

    // Env check before doing work
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY missing')
      return sendJSON({ error: 'OPENAI_API_KEY missing on server' }, 500)
    }

    // Build prompts
    const system = buildSystem(payload)
    const user = buildUser(payload)

    // Call OpenAI and parse
    const aiResult = await callOpenAI(system, user)

    if (!aiResult) {
      // safe fallback structure
      return sendJSON(
        {
          type: 'error_solution',
          cause: 'AI no valid response',
          solution: 'Check server logs and retry',
          improved_prompt: 'Ensure valid JSON output from AI',
          retry_instruction: 'Try again'
        } as AIResult,
        200
      )
    }

    return sendJSON(aiResult, 200)
  } catch (err: any) {
    console.error('POST main handler error', err)
    return sendJSON({ error: err.message ?? 'unknown' }, 500)
  }
}

