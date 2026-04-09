import build from '@hono/vite-build/cloudflare-pages'
import devServer from '@hono/vite-dev-server'
import adapter from '@hono/vite-dev-server/cloudflare'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // .html 파일을 JS 텍스트 모듈로 처리 (wrangler.jsonc의 "type":"Text" 규칙을 Vite dev에도 적용)
    {
      name: 'html-as-text',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('.html') && !id.includes('node_modules')) {
          return { code: `export default ${JSON.stringify(code)}`, map: null }
        }
      }
    },
    build(),
    devServer({
      adapter,
      entry: 'src/index.tsx'
    })
  ]
})
