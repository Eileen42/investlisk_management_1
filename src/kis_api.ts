// ═══════════════════════════════════════════════════
// 한국투자증권 (KIS) OpenAPI Client
// 공식 문서: https://apiportal.koreainvestment.com
//
// 환경변수 설정:
//   로컬 개발: .dev.vars 파일에 KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO 입력
//   프로덕션:  wrangler secret put KIS_APP_KEY  등으로 설정
// ═══════════════════════════════════════════════════

import { calculate10SMA } from './utils/financeSkills'

export interface KisEnv {
  KIS_APP_KEY: string
  KIS_APP_SECRET: string
  KIS_ACCOUNT_NO: string
  KIS_IS_REAL: string          // 'true'=실전투자, 'false'(기본)=모의투자
  CUSTOM_TICKERS: KVNamespace  // KIS 토큰 캐시 용도로 재사용
}

const KIS_BASE_REAL = 'https://openapi.koreainvestment.com:9443'
const KIS_BASE_MOCK = 'https://openapivts.koreainvestment.com:29443'
const TOKEN_KV_KEY  = 'kis_access_token'

const getBase = (env: KisEnv) =>
  env.KIS_IS_REAL === 'true' ? KIS_BASE_REAL : KIS_BASE_MOCK

/** KIS 자격증명이 설정되어 있는지 확인 */
export function isKisConfigured(env: KisEnv): boolean {
  return !!(env.KIS_APP_KEY && env.KIS_APP_SECRET &&
            env.KIS_APP_KEY.length > 5 && env.KIS_APP_SECRET.length > 5)
}

// ───────────────────────────────────────────────────
// 토큰 발급 & KV 캐싱 (유효기간 23시간)
// ───────────────────────────────────────────────────
export async function getKisToken(env: KisEnv): Promise<string | null> {
  if (!isKisConfigured(env)) return null

  // 1) KV 캐시 확인
  try {
    const cached = await env.CUSTOM_TICKERS.get(TOKEN_KV_KEY, 'json') as
      { token: string; expires: number } | null
    if (cached && Date.now() < cached.expires) return cached.token
  } catch (_) { /* KV 오류 무시 */ }

  // 2) 신규 발급
  try {
    const res = await fetch(`${getBase(env)}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: env.KIS_APP_KEY,
        appsecret: env.KIS_APP_SECRET,
      }),
    })
    if (!res.ok) return null

    const json = await res.json() as { access_token?: string }
    if (!json.access_token) return null

    // KV 저장 (23시간 TTL)
    const expires = Date.now() + 23 * 60 * 60 * 1000
    await env.CUSTOM_TICKERS.put(
      TOKEN_KV_KEY,
      JSON.stringify({ token: json.access_token, expires }),
      { expirationTtl: 23 * 60 * 60 }
    )
    return json.access_token
  } catch (_) { return null }
}

// ───────────────────────────────────────────────────
// 공통 GET 요청 래퍼
// ───────────────────────────────────────────────────
async function kisGet<T>(
  env: KisEnv,
  path: string,
  trId: string,
  params: Record<string, string>
): Promise<T | null> {
  const token = await getKisToken(env)
  if (!token) return null

  const url = new URL(`${getBase(env)}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'Content-Type': 'application/json',
        'authorization': `Bearer ${token}`,
        'appkey': env.KIS_APP_KEY,
        'appsecret': env.KIS_APP_SECRET,
        'tr_id': trId,
        'custtype': 'P',
      },
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch (_) { return null }
}

// ───────────────────────────────────────────────────
// 국내 주식 현재가 조회
// ───────────────────────────────────────────────────
export interface KisDomesticPrice {
  hts_kor_isnm: string   // 종목명
  stck_prpr: string      // 현재가
  prdy_vrss: string      // 전일 대비
  prdy_ctrt: string      // 전일 대비율 (%)
  acml_vol: string       // 누적 거래량
  acml_tr_pbmn: string   // 누적 거래대금
}

export async function fetchKisDomesticPrice(
  env: KisEnv, stockCode: string
): Promise<{ price: number; changeRate: number; name: string } | null> {
  const res = await kisGet<{ output: KisDomesticPrice; rt_cd: string }>(
    env,
    '/uapi/domestic-stock/v1/quotations/inquire-price',
    'FHKST01010100',
    { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: stockCode }
  )
  if (!res || res.rt_cd !== '0' || !res.output) return null
  return {
    price: parseInt(res.output.stck_prpr, 10) || 0,
    changeRate: parseFloat(res.output.prdy_ctrt) || 0,
    name: res.output.hts_kor_isnm || '',
  }
}

// ───────────────────────────────────────────────────
// 국내 주식 월봉 데이터 조회 (10이평선 계산용)
// ───────────────────────────────────────────────────
export interface KisMonthlyBar { date: string; close: number }

export async function fetchKisDomesticMonthly(
  env: KisEnv, stockCode: string
): Promise<KisMonthlyBar[]> {
  const today = new Date()
  const start = new Date(today.getFullYear() - 2, today.getMonth(), 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const res = await kisGet<{
    output2: Array<{ stck_bsop_date: string; stck_clpr: string }>
    rt_cd: string
  }>(
    env,
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: stockCode,
      FID_INPUT_DATE_1: fmt(start),
      FID_INPUT_DATE_2: fmt(today),
      FID_PERIOD_DIV_CODE: 'M',
      FID_ORG_ADJ_PRC: '1',  // 1 = 수정주가(Adjusted Close) — 액면분할/배당 반영 필수
    }
  )
  if (!res || res.rt_cd !== '0' || !Array.isArray(res.output2)) return []

  return res.output2
    .filter(r => r.stck_bsop_date && r.stck_clpr)
    .map(r => ({
      date: r.stck_bsop_date.slice(0, 4) + '-' + r.stck_bsop_date.slice(4, 6),
      close: parseInt(r.stck_clpr, 10),
    }))
    .filter(r => r.close > 0)
    .reverse()  // KIS는 최신순 → 오름차순으로 변환
}

// ───────────────────────────────────────────────────
// 국내 주식 주봉 데이터 조회 (퀀트 스캔: MA10W, MA20W, 거래량 계산용)
// KIS API는 FID_PERIOD_DIV_CODE='W'로 주봉을 지원한다.
// 월봉 함수(fetchKisDomesticMonthly)와 동일한 엔드포인트 + 파라미터 패턴.
// ───────────────────────────────────────────────────
export interface KisWeeklyBar {
  date: string    // 'YYYYMMDD' (해당 주의 영업일 기준일)
  close: number   // 수정주가 기준 종가
  volume: number  // 해당 주 거래량
}

export async function fetchKisDomesticWeekly(
  env: KisEnv, stockCode: string
): Promise<KisWeeklyBar[]> {
  // 주봉 MA20 계산에 최소 21개 필요 → 약 1년치 조회 (52주)
  // 안전하게 2년치 조회하여 MA40까지 대응
  const today = new Date()
  const start = new Date(today.getFullYear() - 2, today.getMonth(), 1)
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  const res = await kisGet<{
    output2: Array<{
      stck_bsop_date: string  // 영업일자
      stck_clpr: string       // 종가
      acml_vol: string        // 누적거래량
    }>
    rt_cd: string
  }>(
    env,
    '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
    'FHKST03010100',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_INPUT_ISCD: stockCode,
      FID_INPUT_DATE_1: fmt(start),
      FID_INPUT_DATE_2: fmt(today),
      FID_PERIOD_DIV_CODE: 'W',       // 주봉
      FID_ORG_ADJ_PRC: '1',           // 수정주가 — 절대 원칙 (변경 금지)
    }
  )
  if (!res || res.rt_cd !== '0' || !Array.isArray(res.output2)) return []

  return res.output2
    .filter(r => r.stck_bsop_date && r.stck_clpr)
    .map(r => ({
      date:   r.stck_bsop_date,
      close:  parseInt(r.stck_clpr, 10),
      volume: parseInt(r.acml_vol, 10) || 0,
    }))
    .filter(r => r.close > 0)
    .reverse()  // KIS는 최신순 → 오름차순으로 변환
}

// ───────────────────────────────────────────────────
// KIS 주봉 → 퀀트 스캔용 계산 헬퍼
// fetchMaWeeklyData(Yahoo) 반환값과 동일한 필드를 만들어
// 퀀트 스캔 로직에서 데이터 소스 무관하게 사용 가능하도록 함
// ───────────────────────────────────────────────────
export interface KisWeeklyMaResult {
  ma10w: number | null          // 최근 10주 이동평균 (주봉 10이평선)
  ma10wPrev: number | null      // 전주 기준 10주 이평 (기울기 계산용)
  ma20w: number | null          // 최근 20주 이동평균 (정배열 검증용)
  latestClose: number | null    // 가장 최근 주봉 종가 (현재가 근사치)
  volumeW: number | null        // 이번 주 거래량
  volumeWAvg10: number | null   // 최근 10주 평균 거래량
}

export function calcWeeklyMaFromBars(bars: KisWeeklyBar[]): KisWeeklyMaResult {
  const nil: KisWeeklyMaResult = {
    ma10w: null, ma10wPrev: null, ma20w: null,
    latestClose: null, volumeW: null, volumeWAvg10: null,
  }
  if (bars.length < 10) return nil

  const closes  = bars.map(b => b.close)
  const volumes = bars.map(b => b.volume)

  // 최근 10주 평균 (MA10_W)
  const last10 = closes.slice(-10)
  const ma10w = Math.round(last10.reduce((s, v) => s + v, 0) / 10)

  // 전주 기준 10주 이평 (기울기 계산용)
  let ma10wPrev: number | null = null
  if (closes.length >= 11) {
    const prev10 = closes.slice(-11, -1)
    ma10wPrev = Math.round(prev10.reduce((s, v) => s + v, 0) / 10)
  }

  // 최근 20주 이평 (정배열 검증용)
  let ma20w: number | null = null
  if (closes.length >= 20) {
    const last20 = closes.slice(-20)
    ma20w = Math.round(last20.reduce((s, v) => s + v, 0) / 20)
  }

  // 가장 최근 주봉 종가 (현재가 근사치)
  const latestClose = closes[closes.length - 1] ?? null

  // 거래량: 유효 거래량(>0)만 사용
  const validVols = volumes.filter(v => v > 0)
  const volumeW = validVols.length > 0 ? validVols[validVols.length - 1] : null
  let volumeWAvg10: number | null = null
  if (validVols.length >= 10) {
    const last10v = validVols.slice(-10)
    volumeWAvg10 = Math.round(last10v.reduce((s, v) => s + v, 0) / 10)
  }

  return { ma10w, ma10wPrev, ma20w, latestClose, volumeW, volumeWAvg10 }
}

// ───────────────────────────────────────────────────
// 국내 주식 일봉 데이터 조회 (퀀트 스캔용)
// 동일 엔드포인트에 FID_PERIOD_DIV_CODE='D' 만 바꿔 조회. 수정주가 필수.
//
// ★ KIS 제약: inquire-daily-itemchartprice는 한 번 호출 시 output2 최대 100개 반환.
//   3년치(~750거래일)가 필요하면 FID_INPUT_DATE_1/DATE_2 구간을 바꿔가며 페이지네이션 필수.
//   [2026-04-23] 버그 수정: 기존에는 단일 호출로 100개만 받아
//   월봉 resample 시 ~5개월 → monthlyBars.length<10 → 점수 계산 실패.
//   페이지네이션으로 월봉 10이평, 주봉 20이평에 충분한 250영업일 이상 확보.
// ───────────────────────────────────────────────────
export interface KisDailyBar {
  date:   string   // 'YYYYMMDD'
  close:  number   // 수정주가 종가
  volume: number   // 일간 거래량
  open?:  number   // 당일 시가 (수정주가)  — 눌림목 턴어라운드 판정용
  high?:  number   // 당일 고가 (수정주가)  — 20일 최고가 산출용
}

export async function fetchKisDomesticDaily(
  env: KisEnv, stockCode: string
): Promise<KisDailyBar[]> {
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`

  // KIS inquire-daily-itemchartprice는 한 호출당 output2 최대 100 바만 반환
  //  → 월봉 10이평(~220영업일 필요) 위해 여러 페이지를 **병렬**로 호출.
  //  [2026-04-23] 직렬 페이지네이션은 종목당 900ms+ 소요되어 100종목 스캔 시 22s 데드라인 초과.
  //  페이지들의 date 범위는 서로 독립적이므로 Promise.all로 동시 호출 가능.
  //  중복되는 날짜는 seenDates로 중복 제거. 3페이지 × ~100바 = 최대 ~300바 수집.

  const PAGE_DAYS = 150   // 캘린더 일수 — 영업일 ~100개에 해당
  // 3페이지 병렬 = 최근 ~450일(~15개월) 커버 — 월봉 10이평 충분 확보.
  //  호출부는 동시성을 제어해 한 번에 너무 많은 KIS 요청이 몰리지 않게 할 것
  //  (예: radar/scan batch=3, quant scan batch=4).
  const PAGES     = 3
  const today = new Date()

  // 페이지별 [startDate, endDate] 생성 — 각 페이지가 서로 겹치지 않게 구간 분할
  const ranges: Array<{ start: Date; end: Date }> = []
  for (let p = 0; p < PAGES; p++) {
    const end = new Date(today); end.setDate(end.getDate() - p * PAGE_DAYS)
    const start = new Date(end); start.setDate(start.getDate() - PAGE_DAYS)
    ranges.push({ start, end })
  }

  type KisResp = {
    output2: Array<{
      stck_bsop_date: string
      stck_clpr: string
      stck_oprc?: string
      stck_hgpr?: string
      acml_vol: string
    }>
    rt_cd: string
  }

  const fetchPage = (start: Date, end: Date): Promise<KisResp | null> =>
    kisGet<KisResp>(
      env,
      '/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice',
      'FHKST03010100',
      {
        FID_COND_MRKT_DIV_CODE: 'J',
        FID_INPUT_ISCD:         stockCode,
        FID_INPUT_DATE_1:       fmt(start),
        FID_INPUT_DATE_2:       fmt(end),
        FID_PERIOD_DIV_CODE:    'D',
        FID_ORG_ADJ_PRC:        '1',    // 수정주가 — CLAUDE.md 원칙 1 (변경 금지)
      }
    ).catch(() => null)

  const pages = await Promise.all(ranges.map(r => fetchPage(r.start, r.end)))

  const collected: KisDailyBar[] = []
  const seenDates = new Set<string>()
  for (const res of pages) {
    if (!res || res.rt_cd !== '0' || !Array.isArray(res.output2)) continue
    for (const r of res.output2) {
      if (!r.stck_bsop_date || !r.stck_clpr) continue
      if (seenDates.has(r.stck_bsop_date)) continue
      seenDates.add(r.stck_bsop_date)

      const closeNum = parseInt(r.stck_clpr, 10)
      if (!isFinite(closeNum) || closeNum <= 0) continue
      const open = r.stck_oprc ? parseInt(r.stck_oprc, 10) : 0
      const high = r.stck_hgpr ? parseInt(r.stck_hgpr, 10) : 0
      const bar: KisDailyBar = {
        date:   r.stck_bsop_date,
        close:  closeNum,
        volume: parseInt(r.acml_vol, 10) || 0,
      }
      if (open > 0) bar.open = open
      if (high > 0) bar.high = high
      collected.push(bar)
    }
  }

  // 오름차순(과거→현재) 정렬
  collected.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return collected
}

// ───────────────────────────────────────────────────
// 거래대금 순위 (국내 주식)
// ───────────────────────────────────────────────────
export interface KisVolumeRankItem {
  rank: number
  name: string
  ticker: string
  price: number
  changeRate: number
  tradeAmount: number    // 당일 누적 거래대금 (원)
  prevTradeAmount: number // 전일 거래대금 (원) — 거래대금 증가율 계산용
  marketCap: number      // 시가총액 (원) = 현재가 × 상장주수
}

export async function fetchKisVolumeRank(
  env: KisEnv, limit = 100
): Promise<KisVolumeRankItem[]> {
  const res = await kisGet<{
    output: Array<{
      data_rank: string
      hts_kor_isnm: string
      mksc_shrn_iscd: string
      stck_prpr: string       // 현재가
      prdy_ctrt: string       // 전일 대비 등락률
      acml_tr_pbmn: string    // 당일 누적 거래대금
      prdy_tr_pbmn: string    // 전일 거래대금
      lstn_stcn: string       // 상장 주수 (시총 계산용)
    }>
    rt_cd: string
  }>(
    env,
    '/uapi/domestic-stock/v1/quotations/volume-rank',
    'FHPST01710000',
    {
      FID_COND_MRKT_DIV_CODE: 'J',
      FID_COND_SCR_DIV_CODE:  '20171',
      FID_INPUT_ISCD:         '0000',
      FID_DIV_CLS_CODE:       '0',
      FID_BLNG_CLS_CODE:      '0',
      FID_TRGT_CLS_CODE:      '111111111',
      FID_TRGT_EXLS_CLS_CODE: '000000',
      FID_INPUT_PRICE_1:      '',
      FID_INPUT_PRICE_2:      '',
      FID_VOL_CNT:            '',
      FID_INPUT_DATE_1:       '',
    }
  )
  if (!res || res.rt_cd !== '0' || !Array.isArray(res.output)) return []

  return res.output.slice(0, limit).map(r => {
    const price = parseInt(r.stck_prpr, 10) || 0
    const lstnStcn = parseInt(r.lstn_stcn, 10) || 0
    return {
      rank:            parseInt(r.data_rank, 10)      || 0,
      name:            r.hts_kor_isnm                 || '',
      ticker:          r.mksc_shrn_iscd               || '',
      price,
      changeRate:      parseFloat(r.prdy_ctrt)        || 0,
      tradeAmount:     parseInt(r.acml_tr_pbmn, 10)   || 0,
      prevTradeAmount: parseInt(r.prdy_tr_pbmn, 10)   || 0,
      marketCap:       price * lstnStcn,
    }
  })
}

// ───────────────────────────────────────────────────
// 10이평선 계산 헬퍼 (KIS 월봉 데이터 기반)
// ───────────────────────────────────────────────────
export function calcMa10FromBars(bars: KisMonthlyBar[]): {
  ma10: number | null
  currentClose: number | null
  signal: 'bull' | 'bear' | null
} {
  if (bars.length === 0) return { ma10: null, currentClose: null, signal: null }
  // calculate10SMA() — financeSkills.ts (수정주가 배열 기반 이평선 계산)
  const closes       = bars.map(b => b.close)
  const ma10Raw      = calculate10SMA(closes)
  const ma10         = ma10Raw != null ? Math.round(ma10Raw) : null
  const currentClose = bars[bars.length - 1]?.close ?? null
  const signal: 'bull' | 'bear' | null =
    ma10 != null && currentClose != null
      ? (currentClose > ma10 ? 'bull' : 'bear')
      : null
  return { ma10, currentClose, signal }
}
