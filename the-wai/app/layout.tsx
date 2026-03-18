import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'The wAI — AI Prompt OS',
  description: 'AI 사용이 막막할 때, AI로 무엇을 하고 싶은지 알려주세요',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Noto+Sans+KR:wght@300;400;500&family=JetBrains+Mono:wght@300;400&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
