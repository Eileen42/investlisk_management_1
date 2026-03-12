import { Hono } from 'hono'
// HTML 파일을 raw string으로 임포트 (Vite의 ?raw 기능)
import indexHtml from '../public/index.html?raw'

const app = new Hono()

// 루트 경로 → index.html 반환
app.get('/', (c) => {
  return c.html(indexHtml)
})

// 404 fallback도 index.html (SPA 방식)
app.notFound((c) => {
  return c.html(indexHtml)
})

export default app
