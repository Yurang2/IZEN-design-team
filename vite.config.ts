import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cloudflare Pages 포함 정적 호스팅에서 하위 경로 배포를 안전하게 지원
export default defineConfig({
  plugins: [react()],
  base: './',
})
