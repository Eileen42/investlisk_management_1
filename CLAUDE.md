# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ★ 최상위 규칙 (모든 작업에 최우선 적용)

### 1. 기능·인터페이스 무단 변경 금지
> **지시한 것 이외의 기능이나 인터페이스는 임의로 수정, 축소, 생략, 삭제 금지.**
- 버그 수정 중에도 인접 코드를 "개선"하거나 "정리"하지 않는다.
- 요청받은 범위 밖의 로직, UI, API 엔드포인트, 데이터 구조는 건드리지 않는다.
- 기능을 추가할 때 기존 기능이 그대로 작동하는지 반드시 확인한다.

### 2. 핵심 로직·워크플로우 보호
아래 항목은 명시적 지시 없이 절대 변경·삭제하지 않는다.

| 보호 대상 | 위치 | 설명 |
|---|---|---|
| **10이평선 연산** | `src/index.tsx` `fetchMa10Data()` | `pairs.slice(-10)` = 현재 SMA10, `pairs.slice(-11,-1)` = 지난달 SMA10 (기울기용) |
| **4단계 국면 판단** | `public/index.html` `getPhase()` | `above×up` 조합으로 1~4단계 결정 — 투자 핵심 로직 |
| **잡초 판별** | `public/index.html` `isWeed()` / 잡초 판별 열 | 평단가 > 현재가 × 기간 임계치 기준 |
| **Google OAuth 흐름** | `initAuth()` → `tryAutoLogin()` → `handleGoogleLogin()` → `onTokenResponse()` | GIS token client 방식, gapi 없이 fetch 직접 호출 |
| **Sheets 저장/로드** | `loadFromSheets()` / `saveToSheets()` | 범위 `A2:R` (18열), 열 순서 고정 |
| **현재가 조회 흐름** | `fetchAllPrices()` → `/api/prices` → Yahoo Finance | 한국 종목 `.KS` suffix 자동 추가 포함 |
| **캐시 레이어** | `getCached()` / `setCache()` | TTL: 시세 15분(장중 1분), KRX 24시간, MA10 1시간 |
| **USD/KRW 환율** | `getUsdKrw()` | open.er-api → frankfurter 2단계 폴백 |

### 3. 투자 원칙 위배 경고
> 위 보호 대상을 변경하는 요청이 들어오면 **먼저 사용자에게 경고**하고 대안을 제시한다.
```
"이 요청은 투자 원칙에 위배됩니다.
[구체적인 이유]
대안: [대안 제시]"
```
예시: "10이평선 계산 기간을 5개월로 줄여달라" → 경고 후 "별도 지표로 추가하는 방식" 대안 제시.

### 4. 코드 품질 원칙
- **모듈화**: 기능 단위로 함수를 분리하고, 100줄 이상 함수는 반드시 쪼갠다.
- **주석**: 주식 초보자도 이해할 수 있는 쉬운 언어로 작성한다.
  - 나쁜 예: `// SMA 계산`
  - 좋은 예: `// 최근 10개월 종가의 평균값(10이평선)을 구합니다. 이 선 위면 상승장, 아래면 하락장`
- **변수명**: 축약어 대신 의미를 알 수 있는 이름 사용 (`ma10`, `smaPrev`, `isEtf` 등 기존 컨벤션 유지).

---

## 프로젝트 개요

**주린이 떡락방지** — 월봉 10이평선 전략 기반 한국 개인투자자용 포트폴리오 관리 웹앱.
Google OAuth + Google Sheets로 로그인/데이터 저장, Yahoo Finance / KRX / 네이버 금융 API로 실시간 시세 조회.

---

## 배포 방식

| 방식 | 명령 | 비고 |
|------|------|------|
| **Cloudflare Workers** (현재 사용) | `npx wrangler deploy` | `wrangler.jsonc`의 `"main"` 사용, `import html from '...html'` (no `?raw`) |
| **Cloudflare Pages** | `npm run deploy` | Vite 빌드 후 배포, `import html from '...html?raw'` 필요 |

> ⚠️ 두 방식은 `src/index.tsx`의 HTML import 방식이 다름:
> - Workers: `import indexHtml from '../public/index.html'` (rules 설정으로 Text 처리)
> - Pages: `import indexHtml from '../public/index.html?raw'` (Vite raw import)

**현재 배포 URL:** `https://jjurinee-stock.tofha42-22.workers.dev`
**Google Cloud 프로젝트:** `929289116665` (OAuth 클라이언트 ID 앞자리)

---

## 개발 명령

```bash
npm install          # 의존성 설치
npm run dev          # 로컬 개발 서버 (Vite + Cloudflare adapter)
npm run build        # Vite 빌드 → dist/_worker.js
npx wrangler deploy  # Workers로 배포 (현재 설정)
npm run deploy       # Pages로 빌드+배포
```

---

## 아키텍처

### 백엔드: `src/index.tsx`
단일 파일. Hono 앱 + 인메모리 캐시 + 외부 API 프록시로 구성.

**API 엔드포인트:**
| 경로 | 설명 |
|------|------|
| `GET /api/search?q=` | 종목 검색 (한국어 → US_KO_MAP → 네이버금융 → KRX폴백, 영문 → 내장목록 → Yahoo자동완성) |
| `GET /api/price?ticker=` | 단일 종목 현재가 (Yahoo Finance v8, 한국 종목은 `.KS` 자동 추가) |
| `GET /api/prices?tickers=` | 다중 현재가 (콤마 구분, 최대 30개) |
| `POST /api/portfolio` | 포트폴리오 총자산/수익률 계산 |
| `GET /api/exchange-rate` | USD/KRW 환율 (open.er-api → frankfurter 폴백) |
| `GET /api/ma10?ticker=` | 월봉 10이평선 + smaPrev (지난달 SMA, 기울기 판단용) |
| `GET /api/ma10s?tickers=` | 다중 10이평선 (최대 20개) |
| `GET /` | `public/index.html` 서빙 (SPA) |

**10이평선 핵심 연산 (변경 금지):**
```typescript
// 최근 10개월 월봉 종가들의 평균 = 현재 10이평선
const last10 = pairs.slice(-10)
const ma10 = last10.reduce((s, p) => s + p.close, 0) / 10

// 한 달 전 기준 10이평선 = 이평선이 오르는지 내리는지 판단하는 기준값
const prev10 = pairs.slice(-11, -1)
const smaPrev = prev10.reduce((s, p) => s + p.close, 0) / 10
```

**캐시 TTL:**
- 시세: 15분 (장중 1분)
- KRX 종목 리스트: 24시간
- 10이평선: 1시간

---

### 프론트엔드: `public/index.html`
단일 HTML 파일 (JS 포함). Tailwind CDN + FontAwesome + Chart.js CDN 사용.
Google Identity Services (GIS) 로 OAuth, gapi 없이 순수 fetch로 Sheets/Drive API 호출.

**주요 전역 변수:**
| 변수 | 설명 |
|------|------|
| `appData.stocks[]` | 보유 종목 배열 (런타임 상태) |
| `ssId` | Google Sheets spreadsheetId (localStorage `jujini_ssid_v4`) |
| `accessToken` | OAuth 액세스 토큰 (localStorage `jujini_token_v4`) |
| `_selectedStockIdx` | 우측 신호 패널에 표시 중인 종목 인덱스 |
| `_signalChartInst` | Chart.js 미니차트 인스턴스 (재렌더 시 destroy 필요) |
| `_weedFilterActive` | 잡초 필터 토글 상태 |

**Google OAuth 흐름 (변경 금지):**
```
페이지 로드
  → initAuth()               // GIS 스크립트 로드 대기 후 tokenClient 초기화
  → tryAutoLogin()           // localStorage 토큰 유효성 확인 → 유효하면 자동 로그인
  → handleGoogleLogin()      // 버튼 클릭 시 팝업으로 Google 로그인
  → onTokenResponse()        // 토큰 수신 → accessToken 저장 → loadUserProfile()
  → initSpreadsheet()        // 기존 시트 확인 or 신규 생성
  → showMainApp()            // 앱 화면 표시
```

**Google Sheets 구조 (`마스터데이터` 시트, 변경 금지):**
| 열 | 내용 |
|----|------|
| A | 증권사 |
| B | 종목명 |
| C | 종류 (시장지수ETF / 개별주식) |
| D | 평단가 |
| E | 현재가 |
| F | 수량 |
| G | 투자원금 |
| H | 평가금액 |
| I | 수익률 |
| J | 잡초판별 |
| K | 말일종가 |
| L | 10이평선 (ma10) |
| M | 자동투자주기 |
| N | 1회금액 |
| O | 월별이체 |
| P | 연간예상 |
| Q | 통제결정 |
| R | **Ticker** (마지막 열 — 반드시 R열 유지) |

- `loadFromSheets`: `A2:R` 범위로 읽기 (Ticker = `r[17]`)
- `saveToSheets`: `A2:R` clear 후 PUT
- **⚠️ 열 추가 시 반드시 R열 뒤(S열~)에 추가. 중간 삽입 금지**

**4단계 국면 판단 로직 (핵심, 변경 금지):**
```javascript
// 현재가가 10이평선 위인지(above), 이평선이 오르고 있는지(up) 두 가지를 조합
function getPhase(s) {
  var above = s.curPrice > s.ma10        // 주가가 이평선 위에 있는가?
  var up    = s.ma10 > s.smaPrev         // 이평선이 지난달보다 올랐는가?
  if (above && up)    return 1  // 🔥 강력한 상승 추세
  if (!above && up)   return 2  // ⚠️ 일시적 조정 (이탈 경계)
  if (!above && !up)  return 3  // ❄️ 빙하기 (강력한 하락장)
  if (above && !up)   return 4  // 🌱 바닥 탈출 (상승 전환 시도)
}
```

**4개 탭:**
1. **대시보드** — 총자산/수익/잡초 요약, 보유종목 리스트 + 우측 신호 패널 + 미니차트
2. **마스터 데이터** — 종목 CRUD, 현재가 일괄 조회
3. **10이평선 통제탑** — 월봉 MA10 자동 조회, 4단계 국면 뱃지/행동지침
4. **현금흐름 통제소** — 자동투자 주기/금액 관리

---

## 주요 주의사항

- **`wrangler.jsonc`의 `"main"` 필드**: Workers 배포용. Pages 배포로 전환 시 `pages_build_output_dir`로 교체 필요
- **스프레드시트 범위**: 반드시 `A2:R` (18열). `A2:Q`로 줄이면 Ticker(R열)가 저장/로드 안 됨
- **`Ma10Result.smaPrev`**: 지난달 SMA10, `null`이면 `simple_above` / `simple_below` 단순 판단으로 폴백
- **한국 종목 ticker**: 6자리 숫자 코드 (`005930`). Yahoo Finance 조회 시 `.KS` 자동 추가
- **인메모리 캐시**: Workers 재시작 시 초기화됨 (stateless)
- **차트 무한루프 방지**: `loadMiniChart` 완료 후 `refreshPhaseBlock(s)` 호출 (전체 `renderSignalPanel` 재호출 금지)
- **Google OAuth**: `redirect_uri_mismatch` 발생 시 Google Cloud Console에서 JavaScript origins에 배포 URL 추가 필요 (반영 최대 수 시간 소요)
