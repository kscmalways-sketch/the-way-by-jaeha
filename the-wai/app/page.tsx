'use client'

import { useState, useRef } from 'react'

// ── Types ───────────────────────────────────────────────
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

type Phase = 'goal' | 'form' | 'processing' | 'roadmap' | 'error-result'

// ── Styles (inline for single-file simplicity) ──────────
const S: Record<string, React.CSSProperties> = {
  app:        { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 24px 80px' },
  header:     { width: '100%', maxWidth: 680, padding: '64px 0 48px', animation: 'fadeIn 0.7s ease 0.1s both' },
  badge:      { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--accent-warm)', letterSpacing: '0.18em', textTransform: 'uppercase', border: '1px solid rgba(200,184,154,0.25)', padding: '5px 10px', borderRadius: 2, marginBottom: 28 },
  title:      { fontFamily: "'DM Serif Display',serif", fontSize: 'clamp(22px,4vw,30px)', fontWeight: 400, lineHeight: 1.4, letterSpacing: '-0.01em' },
  card:       { width: '100%', maxWidth: 680, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 32, animation: 'fadeIn 0.7s ease 0.25s both' },
  cardLabel:  { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 },
  textarea:   { width: '100%', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontFamily: "'Noto Sans KR',sans-serif", fontSize: 17, fontWeight: 300, lineHeight: 1.6, resize: 'none', caretColor: 'var(--accent-warm)', minHeight: 72 },
  footer:     { marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  charCount:  { fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--text-tertiary)' },
  btn:        { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--accent)', color: '#0a0a0b', fontFamily: "'Noto Sans KR',sans-serif", fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' },
  btnGhost:   { background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', fontSize: 12 },
  secTitle:   { fontFamily: "'DM Serif Display',serif", fontSize: 20, fontWeight: 400, marginBottom: 6 },
  secDesc:    { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 },
  fieldLabel: { display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 },
  fieldInput: { width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', outline: 'none', color: 'var(--text-primary)', fontFamily: "'Noto Sans KR',sans-serif", fontSize: 15, fontWeight: 300, padding: '10px 0', caretColor: 'var(--accent-warm)' },
  procWrap:   { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 0', width: '100%', maxWidth: 680, animation: 'fadeIn 0.4s ease both' },
  orb:        { width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--border-bright)', borderTopColor: 'var(--accent-warm)', animation: 'spin 1s linear infinite' },
  procLabel:  { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.12em' },
  stepCard:   { border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 10 },
  stepHeader: { padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16, cursor: 'pointer', userSelect: 'none' },
  stepNum:    { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-tertiary)', minWidth: 28, paddingTop: 2 },
  stepTitle:  { fontSize: 15, fontWeight: 500, marginBottom: 4 },
  stepDesc:   { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
  stepAi:     { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--accent-warm)', border: '1px solid rgba(200,184,154,0.3)', padding: '3px 8px', borderRadius: 2, display: 'inline-block', marginTop: 8, letterSpacing: '0.1em' },
  promptBox:  { margin: '0 24px 20px', padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', position: 'relative' },
  promptLbl:  { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 },
  promptTxt:  { fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--accent)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  copyBtn:    { position: 'absolute', top: 12, right: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace", fontSize: 9, padding: '4px 8px', borderRadius: 2, cursor: 'pointer', letterSpacing: '0.1em' },
  errCard:    { border: '1px solid rgba(224,92,92,0.2)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', width: '100%', maxWidth: 680, marginTop: 20 },
  errToggle:  { padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', background: 'rgba(224,92,92,0.04)' },
  errLbl:     { fontSize: 13, color: 'var(--text-secondary)', flex: 1 },
  errInput:   { width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid rgba(224,92,92,0.25)', outline: 'none', color: 'var(--text-primary)', fontFamily: "'Noto Sans KR',sans-serif", fontSize: 14, fontWeight: 300, padding: '8px 0', caretColor: 'var(--error)' },
  btnErr:     { background: 'rgba(224,92,92,0.12)', color: 'var(--error)', border: '1px solid rgba(224,92,92,0.25)', fontFamily: "'Noto Sans KR',sans-serif", fontSize: 12, padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer' },
  solBox:     { margin: '0 24px 20px', padding: 16, background: 'rgba(224,92,92,0.05)', border: '1px solid rgba(224,92,92,0.15)', borderRadius: 'var(--radius)' },
  solKey:     { fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'var(--error)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 5 },
  solVal:     { fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 },
}

// ── Loader ──────────────────────────────────────────────
function Loader({ hidden }: { hidden: boolean }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, opacity: hidden ? 0 : 1, visibility: hidden ? 'hidden' : 'visible', transition: 'opacity 0.8s ease, visibility 0.8s ease', pointerEvents: hidden ? 'none' : 'all' }}>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 'clamp(80px,15vw,140px)', letterSpacing: '-0.04em', display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
        <span>A</span>
        <span style={{ position: 'relative', display: 'inline-block' }}>
          <span style={{ display: 'inline-block', animation: 'hideI 0.6s ease-in-out 1.2s both forwards' }}>i</span>
          <span style={{ position: 'absolute', left: 0, top: 0, color: 'var(--accent-warm)', animation: 'showExclaim 0.6s ease-in-out 1.2s both', opacity: 0 }}>!</span>
        </span>
      </div>
      <div style={{ marginTop: 28, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.2em', textTransform: 'uppercase', animation: 'fadeIn 0.6s ease 0.5s both' }}>
        made by Jh
      </div>
      <div style={{ marginTop: 48, width: 120, height: 1, background: 'var(--border)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: '-100%', top: 0, width: '100%', height: '100%', background: 'var(--accent-warm)', animation: 'loaderSlide 2s ease-in-out 0.3s both' }} />
      </div>
    </div>
  )
}

// ── Processing ──────────────────────────────────────────
function Processing({ steps, activeIdx }: { steps: string[]; activeIdx: number }) {
  return (
    <div style={S.procWrap}>
      <div style={S.orb} />
      <div style={S.procLabel}>{steps[activeIdx] ?? 'AI가 분석 중입니다…'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 320 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: i < activeIdx ? 'var(--success)' : i === activeIdx ? 'var(--accent-warm)' : 'var(--text-tertiary)', transition: 'color 0.3s' }}>
            <span>{i < activeIdx ? '●' : i === activeIdx ? '◉' : '○'}</span>
            {s}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step Card ───────────────────────────────────────────
function StepCard({ step, index }: { step: RoadmapStep; index: number }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(step.prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ ...S.stepCard, animationDelay: `${index * 0.07}s`, animation: 'fadeIn 0.5s ease both' }}>
      <div style={S.stepHeader} onClick={() => setOpen(o => !o)}>
        <span style={S.stepNum}>0{index + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={S.stepTitle}>{step.step}</div>
          <div style={S.stepDesc}>{step.description}</div>
          <div style={S.stepAi}>{step.ai}</div>
        </div>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', marginTop: 2 }}>▾</span>
      </div>
      <div style={{ maxHeight: open ? 600 : 0, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
        <div style={S.promptBox}>
          <div style={S.promptLbl}>Copy-Ready Prompt</div>
          <div style={S.promptTxt}>{step.prompt}</div>
          <button style={{ ...S.copyBtn, color: copied ? 'var(--success)' : undefined, borderColor: copied ? 'rgba(108,201,126,0.4)' : undefined }} onClick={copy}>
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Error Section ───────────────────────────────────────
function ErrorSection({ currentGoal }: { currentGoal: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [sol, setSol] = useState<{ cause: string; solution: string; improved_prompt: string; retry_instruction: string } | null>(null)

  const submit = async () => {
    if (!text.trim()) return
    setLoading(true); setSol(null)
    const res = await fetch('/api/ai-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: currentGoal, answers: null, error: text }),
    })
    const data = await res.json()
    if (data.type === 'error_solution') setSol(data)
    setLoading(false)
  }

  return (
    <div style={S.errCard}>
      <div style={S.errToggle} onClick={() => setOpen(o => !o)}>
        <span style={{ color: 'var(--error)', fontSize: 14 }}>⚠</span>
        <span style={S.errLbl}>오류가 생겼으면 알려주세요</span>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </div>
      <div style={{ maxHeight: open ? 600 : 0, overflow: 'hidden', transition: 'max-height 0.35s ease' }}>
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid rgba(224,92,92,0.15)' }}>
          <input style={S.errInput} placeholder="어떤 오류가 발생했나요?" value={text} onChange={e => setText(e.target.value)} />
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button style={S.btnErr} onClick={submit} disabled={loading}>
              {loading ? '분석 중…' : '오류 분석하기'}
            </button>
          </div>
        </div>
        {sol && (
          <div style={S.solBox}>
            {[
              { key: '원인 분석',     val: sol.cause },
              { key: '해결 방법',     val: sol.solution },
              { key: '개선된 프롬프트', val: sol.improved_prompt, mono: true },
              { key: '재시도 안내',   val: sol.retry_instruction },
            ].map(r => (
              <div key={r.key} style={{ marginBottom: 12 }}>
                <div style={S.solKey}>{r.key}</div>
                <div style={{ ...S.solVal, ...(r.mono ? { fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--accent)' } : {}) }}>{r.val}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ───────────────────────────────────────────
export default function Home() {
  const [loaderHidden, setLoaderHidden]   = useState(false)
  const [phase, setPhase]                 = useState<Phase>('goal')
  const [goal, setGoal]                   = useState('')
  const [fields, setFields]               = useState<FormField[]>([])
  const [answers, setAnswers]             = useState<Record<string, string>>({})
  const [steps, setSteps]                 = useState<RoadmapStep[]>([])
  const [procSteps, setProcSteps]         = useState<string[]>([])
  const [procIdx, setProcIdx]             = useState(0)
  const [followUpCount, setFollowUpCount] = useState(0)
  const [fatalError, setFatalError]       = useState('')
  const [isFollowUp, setIsFollowUp]       = useState(false)

  const formRefs = useRef<Record<string, HTMLInputElement>>({})

  // Loader
  if (typeof window !== 'undefined' && !loaderHidden) {
    setTimeout(() => setLoaderHidden(true), 2500)
  }

  // Processing animation
  const runProc = (labels: string[]) => {
    setProcSteps(labels)
    setProcIdx(0)
    let i = 0
    const iv = setInterval(() => {
      i++
      if (i < labels.length) setProcIdx(i)
      else clearInterval(iv)
    }, 700)
  }

  const callAPI = async (payload: object) => {
    const res = await fetch('/api/ai-system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`서버 오류 ${res.status}`)
    return res.json()
  }

  // Step 1: Submit goal
  const submitGoal = async () => {
    if (!goal.trim()) return
    setPhase('processing')
    runProc(['목표 분석 중…', 'GPT-4o 처리 중…', 'Gemini 처리 중…', '결과 병합 중…'])
    try {
      const data = await callAPI({ goal, answers: null, error: null })
      if (data.type === 'form')     { setFields(data.fields); setPhase('form') }
      else if (data.type === 'roadmap') { setSteps(data.steps); setPhase('roadmap') }
    } catch (e: unknown) {
      setFatalError(e instanceof Error ? e.message : '알 수 없는 오류'); setPhase('error-result')
    }
  }

  // Step 3: Submit form
  const submitForm = async () => {
    const a: Record<string, string> = {}
    let missing = false
    fields.forEach(f => {
      const v = formRefs.current[f.key]?.value.trim() ?? ''
      if (f.required && !v) { missing = true; if (formRefs.current[f.key]) formRefs.current[f.key].style.borderBottomColor = 'var(--error)' }
      else if (formRefs.current[f.key]) formRefs.current[f.key].style.borderBottomColor = ''
      a[f.key] = v || '(not specified)'
    })
    if (missing) return
    setAnswers(a)
    setPhase('processing')
    runProc(['답변 분석 중…', 'GPT-4o 처리 중…', 'Gemini 처리 중…', '병합 및 정제 중…', '프롬프트 생성 중…'])
    try {
      const data = await callAPI({ goal, answers: a, error: null })
      if (data.type === 'form' && followUpCount < 1) {
        setFollowUpCount(c => c + 1); setFields(data.fields); setIsFollowUp(true); setPhase('form')
      } else if (data.type === 'roadmap') {
        setSteps(data.steps); setPhase('roadmap')
      } else {
        // force roadmap
        const forced = await callAPI({ goal, answers: a, error: null, forceRoadmap: true })
        setSteps(forced.steps ?? []); setPhase('roadmap')
      }
    } catch (e: unknown) {
      setFatalError(e instanceof Error ? e.message : '알 수 없는 오류'); setPhase('error-result')
    }
  }

  const restart = () => {
    setGoal(''); setFields([]); setAnswers({}); setSteps([])
    setFollowUpCount(0); setIsFollowUp(false); setFatalError('')
    setPhase('goal')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <Loader hidden={loaderHidden} />

      <div style={S.app}>
        {/* Header */}
        <div style={S.header}>
          <div style={S.badge}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent-warm)', animation: 'pulse 2s ease-in-out infinite', display: 'inline-block' }} />
            AI Prompt OS · The wAI
          </div>
          <h1 style={S.title}>ai사용이 막막할때<br />ai로 무엇을 하고 싶은지 알려주세요</h1>
        </div>

        {/* Goal input */}
        {(phase === 'goal' || phase === 'form' || phase === 'roadmap' || phase === 'error-result') && (
          <div style={S.card}>
            <div style={S.cardLabel as React.CSSProperties}>ai 사용 비서</div>
            <textarea
              style={S.textarea}
              placeholder="Enter your goal or task here…"
              rows={3}
              value={goal}
              onChange={e => setGoal(e.target.value)}
              disabled={phase !== 'goal'}
            />
            <div style={S.footer}>
              <span style={S.charCount}>{goal.length}자</span>
              {phase === 'goal'
                ? <button style={S.btn} onClick={submitGoal}>시작하기 →</button>
                : <button style={{ ...S.btn, ...S.btnGhost }} onClick={restart}>← 새 목표</button>
              }
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />

        {/* Form */}
        {phase === 'form' && (
          <div style={{ width: '100%', maxWidth: 680, animation: 'slideUp 0.5s ease both' }}>
            <div style={S.secTitle}>{isFollowUp ? '추가 확인 사항' : '조금 더 알려주세요'}</div>
            <div style={S.secDesc}>{isFollowUp ? '마지막 확인입니다. 이후 로드맵이 생성됩니다.' : '아래 항목을 작성해 주시면 맞춤 로드맵을 생성합니다.'}</div>
            <div style={S.card}>
              {fields.map(f => (
                <div key={f.key} style={{ marginBottom: 20 }}>
                  <label style={S.fieldLabel}>
                    {f.label}
                    {f.required && <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: 'var(--accent-warm)', marginLeft: 5, verticalAlign: 'middle', marginBottom: 2 }} />}
                  </label>
                  <input
                    ref={el => { if (el) formRefs.current[f.key] = el }}
                    type="text"
                    style={S.fieldInput}
                    placeholder={f.placeholder}
                    defaultValue=""
                  />
                </div>
              ))}
              <div style={{ ...S.footer, paddingTop: 20, borderTop: '1px solid var(--border)', marginTop: 8 }}>
                <button style={{ ...S.btn, ...S.btnGhost }} onClick={restart}>← 처음으로</button>
                <button style={S.btn} onClick={submitForm}>로드맵 생성 →</button>
              </div>
            </div>
          </div>
        )}

        {/* Processing */}
        {phase === 'processing' && <Processing steps={procSteps} activeIdx={procIdx} />}

        {/* Fatal error */}
        {phase === 'error-result' && (
          <div style={{ width: '100%', maxWidth: 680, padding: 32, textAlign: 'center', color: 'var(--error)', fontSize: 14, lineHeight: 1.8 }}>
            {fatalError}
            <div style={{ marginTop: 24 }}>
              <button style={{ ...S.btn, ...S.btnGhost }} onClick={restart}>← 다시 시도</button>
            </div>
          </div>
        )}

        {/* Roadmap */}
        {phase === 'roadmap' && (
          <div style={{ width: '100%', maxWidth: 680, animation: 'slideUp 0.5s ease both' }}>
            <div style={{ marginBottom: 28 }}>
              <div style={S.secTitle}>맞춤 AI 로드맵</div>
              <div style={S.secDesc}>각 단계를 클릭하면 바로 사용 가능한 프롬프트가 나타납니다.</div>
            </div>
            {steps.map((s, i) => <StepCard key={i} step={s} index={i} />)}
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 36 }}>
              <button style={{ ...S.btn, ...S.btnGhost }} onClick={restart}>← 새 목표 입력</button>
            </div>
          </div>
        )}

        <div style={{ height: 20 }} />

        {/* Error helper (always visible after goal is set) */}
        {goal && phase !== 'processing' && <ErrorSection currentGoal={goal} />}
      </div>
    </>
  )
}
