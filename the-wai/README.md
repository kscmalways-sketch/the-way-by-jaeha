# The wAI — AI Prompt OS

> ai사용이 막막할때, ai로 무엇을 하고 싶은지 알려주세요

---

## 구조

```
사용자 브라우저
    ↓  POST /api/ai-system  (goal, answers, error만 전송 — 키 없음)
Next.js 서버 (Vercel)
    ↓  OPENAI_API_KEY, GEMINI_API_KEY (환경변수, 절대 노출 안 됨)
OpenAI GPT-4o-mini  +  Google Gemini 1.5 Flash  (동시 호출 → 병합)
    ↓
사용자 화면에 로드맵 표시
```

API 키는 **Vercel 환경변수**에만 존재합니다.  
사용자는 키를 입력할 필요 없고, 소스 코드에도 키가 없습니다.

---

## Vercel 배포 방법 (5분)

### 1. GitHub에 올리기

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/YOUR_ID/the-wai.git
git push -u origin main
```

### 2. Vercel 연결

1. [vercel.com](https://vercel.com) 접속 → **New Project**
2. GitHub 저장소 선택
3. Framework: **Next.js** (자동 감지됨)

### 3. 환경변수 설정 (핵심!)

Vercel 프로젝트 설정 → **Environment Variables** 에 추가:

| Name | Value |
|------|-------|
| `OPENAI_API_KEY` | `sk-proj-...` |
| `GEMINI_API_KEY` | `AIzaSy...` |

### 4. Deploy

**Deploy** 버튼 클릭 → 완료!

URL을 사용자에게 공유하면 됩니다. 키는 Vercel 서버에만 있습니다.

---

## 로컬 개발

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
cp .env.example .env.local
# .env.local 파일을 열어 실제 키 입력

# 3. 실행
npm run dev
# → http://localhost:3000
```

---

## 키 발급

- **OpenAI**: https://platform.openai.com/api-keys
- **Gemini**: https://aistudio.google.com/app/apikey

---

## 기술 스택

- Next.js 14 (App Router)
- TypeScript
- OpenAI GPT-4o-mini
- Google Gemini 1.5 Flash
- Dual AI merge logic (서버사이드)
