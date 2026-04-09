// Cloudflare Workers 텍스트 모듈 임포트 타입 선언
// wrangler.jsonc의 "type": "Text" 규칙으로 처리되는 파일들
declare module '../public/finance-utils.js' {
  const content: string
  export default content
}
