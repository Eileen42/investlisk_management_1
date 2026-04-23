// ═══════════════════════════════════════════════════
// 업비트(Upbit) Public API 클라이언트
// 공식 문서: https://docs.upbit.com/
//
// 인증키 불필요 — 공개 API만 사용 (현재가, 월봉 캔들)
// 티커 포맷: KRW-BTC, KRW-ETH 등 업비트 마켓 코드
// ═══════════════════════════════════════════════════

import { calculate10SMA, calculateSMAPrev } from './financeSkills'

/** 업비트 마켓 포맷 여부 확인 (KRW-BTC, KRW-ETH 등) */
export function isUpbitMarket(ticker: string): boolean {
  return /^KRW-[A-Z0-9]+$/i.test(ticker)
}

// ───────────────────────────────────────────────────
// 업비트 API 응답 타입
// ───────────────────────────────────────────────────

/** 업비트 현재가 티커 응답 */
interface UpbitTickerResponse {
  market: string             // 마켓 코드 (KRW-BTC)
  trade_price: number        // 현재가 (원)
  signed_change_rate: number // 전일 대비 등락률 (소수점, 예: 0.0235 = +2.35%)
}

/** 업비트 월봉 캔들 응답 */
interface UpbitMonthCandle {
  market: string                // 마켓 코드
  candle_date_time_kst: string  // 캔들 기준 시간 (KST), 예: "2024-01-01T09:00:00"
  trade_price: number           // 해당 월 마지막 거래가 (종가)
  opening_price: number         // 시가
}

/** 업비트 주봉 캔들 응답 */
interface UpbitWeekCandle {
  market: string
  candle_date_time_kst: string        // 주 시작 기준 (KST)
  trade_price: number                 // 주봉 종가
  candle_acc_trade_volume: number     // 해당 주 거래량 (코인 수량)
}

// ───────────────────────────────────────────────────
// 코인 현재가 조회
// 업비트 퍼블릭 API: GET https://api.upbit.com/v1/ticker?markets=KRW-BTC
// ───────────────────────────────────────────────────

export async function fetchUpbitPrice(
  market: string
): Promise<{ price: number; changeRate: number; name: string } | null> {
  try {
    const url = `https://api.upbit.com/v1/ticker?markets=${encodeURIComponent(market.toUpperCase())}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return null

    const json = await res.json() as UpbitTickerResponse[]
    if (!Array.isArray(json) || json.length === 0) return null

    const item = json[0]
    // trade_price는 원화 기준 — 그대로 KRW 가격으로 반환
    return {
      price: item.trade_price,
      // signed_change_rate는 소수점 비율 (0.0235 = +2.35%)
      changeRate: parseFloat((item.signed_change_rate * 100).toFixed(2)),
      // 코인 이름: "KRW-BTC" → "BTC (코인)"
      name: market.toUpperCase().replace(/^KRW-/, '') + ' (코인)',
    }
  } catch (_) { return null }
}

// ───────────────────────────────────────────────────
// 월봉 캔들 조회 (10이평선 계산용)
// 업비트 퍼블릭 API: GET https://api.upbit.com/v1/candles/months
// 응답은 최신순(내림차순) → 오름차순으로 정렬해서 반환
// ───────────────────────────────────────────────────

export async function fetchUpbitMonthlyCandles(
  market: string,
  count = 13  // 10이평선 계산에는 11개 필요, 여유분 포함 13개 요청
): Promise<Array<{ date: string; close: number }>> {
  try {
    const url = `https://api.upbit.com/v1/candles/months?market=${encodeURIComponent(market.toUpperCase())}&count=${count}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return []

    const json = await res.json() as UpbitMonthCandle[]
    if (!Array.isArray(json) || json.length === 0) return []

    return json
      .filter(c => c.trade_price > 0)
      .map(c => ({
        // candle_date_time_kst: "2024-01-01T09:00:00" → "2024-01"
        date: c.candle_date_time_kst.slice(0, 7),
        close: c.trade_price,
      }))
      .reverse()  // 업비트는 최신순 반환 → 오름차순으로 변환 (calculate10SMA 기준 맞춤)
  } catch (_) { return [] }
}

// ───────────────────────────────────────────────────
// 주봉 캔들 조회 (주봉 MA10/MA20 + 거래량 계산용)
// 업비트 퍼블릭 API: GET https://api.upbit.com/v1/candles/weeks
// 응답은 최신순(내림차순) → 오름차순으로 정렬해서 반환
// ───────────────────────────────────────────────────

export async function fetchUpbitWeeklyCandles(
  market: string,
  count = 42  // MA20 + 여유분 42주 요청
): Promise<Array<{ date: string; close: number; volume: number }>> {
  try {
    const url = `https://api.upbit.com/v1/candles/weeks?market=${encodeURIComponent(market.toUpperCase())}&count=${count}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) return []

    const json = await res.json() as UpbitWeekCandle[]
    if (!Array.isArray(json) || json.length === 0) return []

    return json
      .filter(c => c.trade_price > 0)
      .map(c => ({
        date:   c.candle_date_time_kst.slice(0, 10),
        close:  c.trade_price,
        volume: c.candle_acc_trade_volume ?? 0,
      }))
      .reverse()  // 최신순 → 오름차순
  } catch (_) { return [] }
}

// ───────────────────────────────────────────────────
// 일봉 캔들 조회 (퀀트 스캔용: 월봉 10이평·주봉 10이평·하이브리드 거래량 전체 재가공)
// 업비트 퍼블릭 API: GET https://api.upbit.com/v1/candles/days
// 코인은 24/7 거래라 "영업일" 개념이 없으므로 캘린더 일자 기준.
//
// 업비트 제약: 한 번에 최대 200개 — 월봉 10이평(약 300일 필요)을 위해 페이징으로 이어받음.
// 기본 400개(≈13개월) 요청 → 내부적으로 200개씩 최대 2회 호출.
// `to` 파라미터로 과거 페이지를 역방향으로 이어받음. UTC 시각 기준.
// ───────────────────────────────────────────────────

interface UpbitDayCandle {
  market: string
  candle_date_time_utc: string    // 'YYYY-MM-DDTHH:mm:ss' (UTC) — 다음 페이지 'to' 파라미터 기준
  candle_date_time_kst: string    // 'YYYY-MM-DDTHH:mm:ss' (KST) — 날짜 표시용
  opening_price?: number          // 해당 일의 시가
  high_price?:    number          // 해당 일의 고가
  trade_price: number             // 해당 일의 종가
  candle_acc_trade_volume: number // 해당 일의 누적 거래량 (코인 수량)
}

export async function fetchUpbitDailyCandles(
  market: string,
  count = 400
): Promise<Array<{ date: string; close: number; volume: number; open?: number; high?: number }>> {
  const mkt = encodeURIComponent(market.toUpperCase())
  const collected: UpbitDayCandle[] = []
  let to: string | undefined
  const seenDates = new Set<string>()  // 페이지 경계 중복 방지
  let safetyPages = 0

  while (collected.length < count && safetyPages < 5) {
    safetyPages++
    const need = Math.min(200, count - collected.length)
    let url = `https://api.upbit.com/v1/candles/days?market=${mkt}&count=${need}`
    if (to) url += `&to=${encodeURIComponent(to)}`

    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) break
      const json = await res.json() as UpbitDayCandle[]
      if (!Array.isArray(json) || json.length === 0) break

      for (const c of json) {
        const dateKey = c.candle_date_time_kst?.slice(0, 10)
        if (!dateKey || seenDates.has(dateKey)) continue
        seenDates.add(dateKey)
        collected.push(c)
      }
      if (json.length < need) break  // 더 과거 데이터 없음

      // 다음 페이지: 방금 받은 가장 오래된 바의 UTC 시각 - 1초 (배타적으로 사용)
      const oldest = json[json.length - 1]
      if (!oldest?.candle_date_time_utc) break
      const tDate = new Date(oldest.candle_date_time_utc + 'Z')
      tDate.setUTCSeconds(tDate.getUTCSeconds() - 1)
      to = tDate.toISOString().replace(/\.\d{3}Z$/, 'Z')

      // 업비트 레이트리밋 배려 (분당 600건 제한)
      if (collected.length < count) await new Promise(r => setTimeout(r, 150))
    } catch (_) { break }
  }

  return collected
    .filter(c => c.trade_price > 0)
    .map(c => {
      const bar: { date: string; close: number; volume: number; open?: number; high?: number } = {
        date:   c.candle_date_time_kst.slice(0, 10),  // 'YYYY-MM-DD'
        close:  c.trade_price,
        volume: c.candle_acc_trade_volume ?? 0,
      }
      if (typeof c.opening_price === 'number' && c.opening_price > 0) bar.open = c.opening_price
      if (typeof c.high_price    === 'number' && c.high_price    > 0) bar.high = c.high_price
      return bar
    })
    .reverse()  // 업비트는 최신순 → 오름차순
}

// ───────────────────────────────────────────────────
// 주봉 기반 MA10/MA20 + 거래량 계산 헬퍼 (퀀트 스코어링용)
// fetchMaWeeklyData 와 동일한 반환 구조 (stocks/coins 공통 스코어 함수 재사용)
// ───────────────────────────────────────────────────

export function calcCoinMa10Weekly(bars: Array<{ date: string; close: number; volume: number }>): {
  ma10w:        number | null
  ma10wPrev:    number | null
  ma20w:        number | null
  latestClose:  number | null
  volumeW:      number | null
  volumeWAvg10: number | null
} {
  const empty = { ma10w: null, ma10wPrev: null, ma20w: null, latestClose: null, volumeW: null, volumeWAvg10: null }
  if (bars.length < 10) return empty

  const closes  = bars.map(b => b.close)
  const volumes = bars.map(b => b.volume)

  // MA10W: 최근 10주 평균
  const last10  = closes.slice(-10)
  const ma10w   = parseFloat((last10.reduce((s, v) => s + v, 0) / 10).toFixed(2))

  // MA10W 전주 기준 (기울기 계산용)
  let ma10wPrev: number | null = null
  if (closes.length >= 11) {
    const prev10 = closes.slice(-11, -1)
    ma10wPrev = parseFloat((prev10.reduce((s, v) => s + v, 0) / 10).toFixed(2))
  }

  // MA20W: 최근 20주 평균 (정배열 검증)
  let ma20w: number | null = null
  if (closes.length >= 20) {
    const last20 = closes.slice(-20)
    ma20w = parseFloat((last20.reduce((s, v) => s + v, 0) / 20).toFixed(2))
  }

  const latestClose  = closes[closes.length - 1] ?? null
  const volumeW      = volumes[volumes.length - 1] ?? null
  let volumeWAvg10: number | null = null
  if (volumes.length >= 10) {
    const last10v = volumes.slice(-10)
    volumeWAvg10  = parseFloat((last10v.reduce((s, v) => s + v, 0) / 10).toFixed(4))
  }

  return { ma10w, ma10wPrev, ma20w, latestClose, volumeW, volumeWAvg10 }
}

// ───────────────────────────────────────────────────
// 월봉 기반 10이평선 계산 헬퍼 (업비트 데이터 기반)
// kis_api.ts 의 calcMa10FromBars 와 동일한 반환 구조
// ───────────────────────────────────────────────────

export function calcCoinMa10(bars: Array<{ date: string; close: number }>): {
  ma10: number | null
  smaPrev: number | null
  currentMonthClose: number | null
  signal: 'bull' | 'bear' | null
} {
  if (bars.length === 0) {
    return { ma10: null, smaPrev: null, currentMonthClose: null, signal: null }
  }

  const closes = bars.map(b => b.close)

  // calculate10SMA — financeSkills.ts (최근 10개월 종가 평균 = 현재 10이평선)
  const ma10Raw = calculate10SMA(closes)
  // calculateSMAPrev — 지난달 기준 10이평선 (기울기 계산용)
  const smaRaw  = calculateSMAPrev(closes)

  // 코인 가격은 KRW 원화 기준, 소수점 2자리까지 표시
  const ma10    = ma10Raw != null ? parseFloat(ma10Raw.toFixed(2)) : null
  const smaPrev = smaRaw  != null ? parseFloat(smaRaw.toFixed(2))  : null
  const currentMonthClose = bars[bars.length - 1]?.close ?? null

  // 현재 종가가 이평선 위이면 bull(상승 신호), 아래면 bear(하락 신호)
  const signal: 'bull' | 'bear' | null =
    ma10 != null && currentMonthClose != null
      ? (currentMonthClose > ma10 ? 'bull' : 'bear')
      : null

  return { ma10, smaPrev, currentMonthClose, signal }
}
