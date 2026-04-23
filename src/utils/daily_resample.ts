// ═══════════════════════════════════════════════════
// 일봉 데이터 기반 재가공(Resample) + 하이브리드 거래량 스코어링
// ───────────────────────────────────────────────────
// 퀀트 스캔이 종목당 API를 1번만 호출하도록 하기 위한 공통 유틸.
// 일봉 1회 fetch → 메모리에서 주봉/월봉/10이평선 모두 자체 계산.
//
// CLAUDE.md 보호 원칙:
//  - 수정주가(Adjusted Close) 배열을 입력으로 받는다. 원주가 입력 금지.
//  - 10이평선 계산 공식은 financeSkills.ts 와 동일 (slice(-10), slice(-11,-1)).
//  - 이 모듈은 "퀀트 스캔 내부 재가공"만 담당. 마스터 데이터 시트의
//    10이평선 값은 fetchMa10Data / fetchKisDomesticMonthly 경로를 그대로 쓴다.
// ═══════════════════════════════════════════════════

export interface DailyBar {
  /** 과거→현재(오름차순) 순서의 일봉. 날짜 문자열(YYYY-MM-DD 또는 YYYYMMDD 모두 허용) */
  date:   string
  close:  number     // 수정주가 기준 종가
  volume: number     // 해당 일의 거래량 (주식: 주 수, 코인: 코인 수량)
  // 눌림목 스코어링용 선택 필드 — fetcher가 제공하면 활용, 없으면 close로 폴백
  open?:  number     // 당일 시가 (턴어라운드 양봉/음봉 판정용)
  high?:  number     // 당일 고가 (20영업일 최고가 산출용)
}

// ───────────────────────────────────────────────────
// 1) 일봉 → 월봉 재가공
// 각 캘린더 월(YYYY-MM)의 마지막 영업일 종가를 월봉 종가로 삼는다.
// 입력 일봉은 반드시 오름차순이어야 한다.
// ───────────────────────────────────────────────────
export function resampleDailyToMonthly(bars: DailyBar[]): Array<{ date: string; close: number }> {
  if (bars.length === 0) return []
  const monthMap = new Map<string, DailyBar>()
  for (const b of bars) {
    const ym = toYearMonth(b.date)
    if (!ym) continue
    monthMap.set(ym, b)   // 같은 월의 더 최신 바로 계속 덮어씀 → 마지막 영업일 종가가 남음
  }
  return Array.from(monthMap.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ym, bar]) => ({ date: ym, close: bar.close }))
}

// ───────────────────────────────────────────────────
// 2) 일봉 → 주봉 재가공
// ISO 주 키(year-week) 기준으로 그룹화.
// 주봉 종가 = 해당 주의 마지막 영업일 종가
// 주봉 거래량 = 해당 주의 일간 거래량 합계
// ───────────────────────────────────────────────────
export function resampleDailyToWeekly(
  bars: DailyBar[]
): Array<{ date: string; close: number; volume: number }> {
  if (bars.length === 0) return []
  type W = { date: string; close: number; volume: number }
  const weekMap = new Map<string, W>()
  for (const b of bars) {
    const wk = toIsoWeekKey(b.date)
    if (!wk) continue
    const prev = weekMap.get(wk)
    if (!prev) {
      weekMap.set(wk, { date: wk, close: b.close, volume: b.volume })
    } else {
      // 같은 주에 더 최신 바가 들어오면 종가 덮어쓰기, 거래량은 누적
      prev.close  = b.close
      prev.volume = prev.volume + b.volume
    }
  }
  return Array.from(weekMap.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// ───────────────────────────────────────────────────
// 3) 10이평선 계산 (CLAUDE.md 공식과 동일)
// 최근 10개 종가의 평균 = 현재 10이평선
// 한 개 전 시점 기준 10이평 = slice(-11, -1) 평균
// ───────────────────────────────────────────────────
export function calcMa10(closes: number[]): { ma10: number | null; ma10Prev: number | null } {
  if (closes.length < 10) return { ma10: null, ma10Prev: null }
  const last10 = closes.slice(-10)
  const ma10   = last10.reduce((s, v) => s + v, 0) / 10
  let ma10Prev: number | null = null
  if (closes.length >= 11) {
    const prev10 = closes.slice(-11, -1)
    ma10Prev = prev10.reduce((s, v) => s + v, 0) / 10
  }
  return { ma10, ma10Prev }
}

export function calcMa20(closes: number[]): number | null {
  if (closes.length < 20) return null
  const last20 = closes.slice(-20)
  return last20.reduce((s, v) => s + v, 0) / 20
}

// ───────────────────────────────────────────────────
// 4) 하이브리드 거래량 지표 계산  (롤링 N영업일 원칙)
// 일봉 배열(오름차순)만 입력으로 받아 두 가지 비율을 반환.
//
// 설계 원칙:
//   - 달력상 "이번 주" 개념을 완전히 버린다. ISO 주 계산 라이브러리 불필요.
//   - 분자·분모 모두 순수 일봉 Row 슬라이스로 대칭 계산 → 스캔 시각·요일·
//     국장/미장/코인 시간대에 전혀 의존하지 않음.
//   - 목적: 하루 반짝 돌파는 거르고 며칠 연속 돈이 들어오는 진짜 주도주 탐지.
//
// dailyVolRatio:   오늘 거래량 / 직전 20영업일 평균 (오늘 제외, 일간 방아쇠용)
// rollingWindowRatio: 최근 N개 캔들 합 / 그 직전 N×10개 캔들 합 ÷ 10
//   - N = 주식 5, 코인 7  (코인은 휴장 없으므로 7일 = 캘린더 7개 캔들)
//   - 분모는 "5영업일(코인 7일) 단위 평균 거래량" = 직전 10묶음 평균
//   - 월요일 아침에도 0점 붕괴 없음: 분자는 "지난주 화~금 + 오늘" 5개로 이미 채워짐
// ───────────────────────────────────────────────────
export interface HybridVolMetrics {
  dailyVolRatio:     number
  rollingWindowRatio: number
  /** 디버깅용 원본 수치 */
  todayVol:   number
  avg20Vol:   number
  rollingSum: number
  avg10WkVol: number
}

export function computeHybridVolMetrics(
  dailyBars: DailyBar[],
  isCoin: boolean
): HybridVolMetrics {
  const empty: HybridVolMetrics = {
    dailyVolRatio: 0, rollingWindowRatio: 0,
    todayVol: 0, avg20Vol: 0, rollingSum: 0, avg10WkVol: 0,
  }
  if (dailyBars.length === 0) return empty

  // ── A. 일간 방아쇠 비율 ──
  // 오늘 = 마지막 캔들, 직전 20일 = 마지막 제외 직전 20개 평균
  const volumes = dailyBars.map(b => b.volume)
  const todayVol = volumes[volumes.length - 1] ?? 0
  let avg20Vol = 0
  if (volumes.length >= 21) {
    const prev20 = volumes.slice(-21, -1)
    const validVols = prev20.filter(v => v > 0)
    if (validVols.length > 0) {
      avg20Vol = validVols.reduce((s, v) => s + v, 0) / validVols.length
    }
  }
  const dailyVolRatio = (todayVol > 0 && avg20Vol > 0) ? todayVol / avg20Vol : 0

  // ── B. 롤링 N영업일 주간 검증 비율 ──
  // 분자: 최근 N개 캔들 합 (오늘 포함 — "지난주 화~금 + 오늘 월" 패턴으로 0점 원천 차단)
  // 분모: 그 직전 N×10개 캔들 합 / 10 = N일 단위 평균 거래량
  //       → 달력 주봉 resample도, ISO 주 계산도 사용하지 않는다.
  //       → 국장·미장·코인 어느 시장이든, 월요일이든 금요일이든 동일 결과.
  const windowSize = isCoin ? 7 : 5
  let rollingSum = 0
  if (volumes.length >= windowSize) {
    rollingSum = volumes.slice(-windowSize).reduce((s, v) => s + v, 0)
  }

  let avg10WkVol = 0
  const minRequired = windowSize * 11  // 분자 N일 + 분모 N×10일 = N×11
  if (volumes.length >= minRequired) {
    // 정상 경로: 분자 구간을 제외한 직전 N×10개 캔들 합을 10묶음 평균으로 환산
    const prevSum = volumes
      .slice(-minRequired, -windowSize)
      .reduce((s, v) => s + v, 0)
    avg10WkVol = prevSum / 10
  } else if (volumes.length >= windowSize * 10) {
    // 신규 상장 등 데이터 부족 시: 최근 N×10개 전체 평균 (분자 구간 일부 중복 허용)
    const sum = volumes
      .slice(-windowSize * 10)
      .reduce((s, v) => s + v, 0)
    avg10WkVol = sum / 10
  }
  const rollingWindowRatio = (rollingSum > 0 && avg10WkVol > 0) ? rollingSum / avg10WkVol : 0

  return { dailyVolRatio, rollingWindowRatio, todayVol, avg20Vol, rollingSum, avg10WkVol }
}

// ───────────────────────────────────────────────────
// 5) 하이브리드 거래량 점수 (B 총 30점)
// 일간 방아쇠 (15점) + 롤링 주간 검증 (15점)
// ───────────────────────────────────────────────────

/** 일간 방아쇠 점수 (0-15):  ≥2x → 15,  ≥1.5x → 5,  else → 0 */
export function scoreDailyTrigger(dailyRatio: number): number {
  if (dailyRatio >= 2.0) return 15
  if (dailyRatio >= 1.5) return 5
  return 0
}

/** 롤링 주간 검증 점수 (0-15):  ≥1.5x → 15,  ≥1.0x → 5,  else → 0 */
export function scoreRollingWeekly(rollingRatio: number): number {
  if (rollingRatio >= 1.5) return 15
  if (rollingRatio >= 1.0) return 5
  return 0
}

/** 종합 하이브리드 거래량 점수 (0-30): 일간 + 주간 */
export function scoreHybridVolume(m: HybridVolMetrics): {
  daily: number; weekly: number; total: number
} {
  const daily  = scoreDailyTrigger(m.dailyVolRatio)
  const weekly = scoreRollingWeekly(m.rollingWindowRatio)
  return { daily, weekly, total: daily + weekly }
}

// ───────────────────────────────────────────────────
// 내부 유틸 — 날짜 파싱
// ───────────────────────────────────────────────────

/** 'YYYY-MM-DD' 또는 'YYYYMMDD' 를 Date로 */
function parseDate(s: string): Date | null {
  if (!s) return null
  let y: number, m: number, d: number
  if (s.length === 10 && s[4] === '-') {
    y = parseInt(s.slice(0, 4), 10)
    m = parseInt(s.slice(5, 7), 10)
    d = parseInt(s.slice(8, 10), 10)
  } else if (s.length === 8) {
    y = parseInt(s.slice(0, 4), 10)
    m = parseInt(s.slice(4, 6), 10)
    d = parseInt(s.slice(6, 8), 10)
  } else { return null }
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

// ═══════════════════════════════════════════════════
// 6) 칼만 필터 기반 적응형 이평선 (KMA)
// ───────────────────────────────────────────────────
// 고전적인 SMA/EMA는 고정된 창(window)의 단순/지수 평균이라 가격이
// 급등락하면 한 박자 늦게 따라옵니다. 1차원 스칼라 칼만 필터는
// "관측 잡음 vs 추세 잡음"의 비율을 학습하면서 추세를 부드럽게 추출합니다.
//
// 수식:
//   predict:  x̂_k|k-1 = x̂_k-1,   P_k|k-1 = P_k-1 + Q
//   update:   K = P_k|k-1 / (P_k|k-1 + R)
//             x̂_k = x̂_k|k-1 + K × (z_k - x̂_k|k-1)
//             P_k = (1 - K) × P_k|k-1
//
// Q/R 비율을 가격 평균의 제곱으로 스케일링해, 1만원 주식과 100만원 주식이
// 동일한 응답성을 갖도록 합니다(scale-invariant).
// ═══════════════════════════════════════════════════
export function computeKalmanMa(
  closes: number[],
  processNoiseRatio = 0.02,    // Q 계수: 클수록 추세 변화에 민감
  observationNoiseRatio = 0.1  // R 계수: 클수록 관측값을 덜 신뢰(부드러움)
): number[] {
  if (closes.length === 0) return []
  const priceMean = closes.reduce((s, v) => s + v, 0) / closes.length
  const Q = Math.pow(priceMean * processNoiseRatio, 2)
  const R = Math.pow(priceMean * observationNoiseRatio, 2)

  const kma: number[] = []
  let x = closes[0]
  let P = R
  for (let i = 0; i < closes.length; i++) {
    // predict
    const xPred = x
    const PPred = P + Q
    // update
    const K = PPred / (PPred + R)
    x = xPred + K * (closes[i] - xPred)
    P = (1 - K) * PPred
    kma.push(x)
  }
  return kma
}

/** 마지막 두 KMA 값 비교로 상승 중인지 판정 */
export function kalmanSlopePositive(closes: number[]): boolean {
  const kma = computeKalmanMa(closes)
  if (kma.length < 2) return false
  return kma[kma.length - 1] > kma[kma.length - 2]
}

// ═══════════════════════════════════════════════════
// 7) 눌림목(Pullback) 스코어링 — 총 100점
// ───────────────────────────────────────────────────
// 상승 추세 유지 + 단기 조정 종목에서 "지지선 밀착 + 턴어라운드 + 거래량 가뭄"을
// 복합 평가해 반등 타점을 찾습니다. 돌파(Breakout) 스코어와 별도 체계입니다.
//
// 절대 필터(4종, 하나라도 탈락 시 totalScore=0):
//   ① P > 월봉 SMA10  (거시 상승 추세)
//   ② P > 주봉 SMA10
//   ③ 주봉 KMA 기울기 > 0 (상승 중)
//   ④ P가 최근 20영업일 최고가 대비 -5% 이상 하락 (고점 횡보주 제외)
//
// A. 지지선 밀착 점수 (40점) — 일봉 SMA20 또는 주봉 SMA10 중 더 가까운 선 기준
//   0 ~ 1.5% 이내  → 40
//   1.5 ~ 3.0% 이내 → 20
//   0% 미만(지지선 붕괴) or 3.0% 초과 → 0
//
// B. 턴어라운드 점수 (30점) — 오늘 종가(=실시간 P) vs 오늘 시가 / 어제 종가
//   양봉 AND P > 어제 종가   → 30 ('양봉 반등')
//   양봉 AND P ≤ 어제 종가   → 15 ('양봉 횡보')
//   음봉(P ≤ 오늘 시가)      → 0  ('음봉 하락')
//
// C. 거래량 가뭄 점수 (30점) — 어제 거래량 / 직전 20영업일 평균
//   < 0.5   → 30
//   < 0.75  → 15
//   ≥ 0.75  → 0
// ═══════════════════════════════════════════════════

export type TurnaroundState = '양봉 반등' | '양봉 횡보' | '음봉 하락' | '데이터 부족'

export interface PullbackScoreResult {
  filterPassed:       boolean
  filterReason:       string | null

  // 원시 지표
  rawClose:           number
  ma10m:              number
  ma10w:              number
  sma20d:             number | null
  kmaSlopePositive:   boolean
  recentHigh20d:      number
  drawdownFromHighPct: number    // 음수면 고점 대비 하락 중

  // A. 지지선
  supportPrice:       number
  supportType:        string     // '일봉 20선' | '주봉 10선'
  supportDisparityPct: number    // (P - support) / support × 100

  // B. 턴어라운드
  todayOpen:          number | null
  yesterdayClose:     number | null
  turnaroundState:    TurnaroundState

  // C. 거래량 가뭄
  yesterdayVol:       number | null
  avg20Vol:           number | null
  yesterdayVolRatio:  number | null

  // 점수
  supportScore:       number     // 0-40
  turnaroundScore:    number     // 0-30
  volumeDroughtScore: number     // 0-30
  totalScore:         number     // 필터 탈락 시 0

  badge:              string | null  // 필터 통과 & 85점 이상 시 '🎯 반등 타점 포착'
}

export function buildPullbackScore(
  bars: DailyBar[],
  _isCoin: boolean
): PullbackScoreResult | null {
  // 최소 데이터: 주봉 10이평(≈70일) + 20일 고점 → 넉넉히 70개 이상
  if (bars.length < 70) return null

  const closes = bars.map(b => b.close)
  const P = closes[closes.length - 1]
  if (!P || P <= 0) return null

  // 월봉/주봉 SMA10
  const monthlyBars = resampleDailyToMonthly(bars)
  if (monthlyBars.length < 10) return null
  const { ma10: ma10m } = calcMa10(monthlyBars.map(b => b.close))
  const weeklyBars = resampleDailyToWeekly(bars)
  if (weeklyBars.length < 10) return null
  const weeklyCloses = weeklyBars.map(b => b.close)
  const { ma10: ma10w } = calcMa10(weeklyCloses)
  if (ma10m == null || ma10w == null) return null

  // 일봉 SMA20 (오늘 포함 최근 20일)
  const sma20d = calcMa20(closes)

  // 주봉 KMA 기울기
  const kmaPositive = kalmanSlopePositive(weeklyCloses)

  // 최근 20영업일 최고가 (high 없으면 close 대체)
  const last20 = bars.slice(-20)
  const recentHigh20d = Math.max(...last20.map(b => (b.high ?? b.close)))
  const drawdownFromHighPct = recentHigh20d > 0
    ? ((P - recentHigh20d) / recentHigh20d) * 100
    : 0

  // ─── 절대 필터 ───
  let filterReason: string | null = null
  if (!(P > ma10m))                   filterReason = '월봉 SMA10 이탈 (거시 상승 추세 붕괴)'
  else if (!(P > ma10w))              filterReason = '주봉 SMA10 이탈'
  else if (!kmaPositive)              filterReason = '주봉 칼만 이평선 하락 중'
  else if (drawdownFromHighPct > -5)  filterReason = '20일 고점 대비 -5% 미달 (고점 횡보주)'
  const filterPassed = filterReason === null

  // ─── A. 지지선 밀착 (40점) ───
  // 일봉 20선과 주봉 10선 중 현재가와 더 가까운(절대 이격률 낮은) 선을 지지선으로 채택
  let supportPrice = ma10w
  let supportType  = '주봉 10선'
  if (sma20d != null && sma20d > 0) {
    const distSma20 = Math.abs(P - sma20d) / sma20d
    const distMa10w = Math.abs(P - ma10w)  / ma10w
    if (distSma20 < distMa10w) {
      supportPrice = sma20d
      supportType  = '일봉 20선'
    }
  }
  const supportDisparityPct = supportPrice > 0
    ? ((P - supportPrice) / supportPrice) * 100
    : 0

  let supportScore = 0
  if (supportDisparityPct >= 0 && supportDisparityPct <= 1.5)        supportScore = 40
  else if (supportDisparityPct > 1.5 && supportDisparityPct <= 3.0)  supportScore = 20
  // 0% 미만(지지선 붕괴) 또는 3.0% 초과: 0점

  // ─── B. 턴어라운드 (30점) ───
  const lastBar = bars[bars.length - 1]
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : null
  const todayOpen      = (typeof lastBar.open === 'number' && lastBar.open > 0) ? lastBar.open : null
  const yesterdayClose = prevBar && prevBar.close > 0 ? prevBar.close : null

  let turnaroundScore = 0
  let turnaroundState: TurnaroundState = '데이터 부족'
  if (todayOpen != null && yesterdayClose != null) {
    const isBull    = P > todayOpen
    const aboveYest = P > yesterdayClose
    if (isBull && aboveYest)      { turnaroundScore = 30; turnaroundState = '양봉 반등' }
    else if (isBull)              { turnaroundScore = 15; turnaroundState = '양봉 횡보' }
    else                          { turnaroundScore = 0;  turnaroundState = '음봉 하락' }
  }

  // ─── C. 거래량 가뭄 (30점) ───
  // 어제(D-1) 거래량 vs 그 직전 20영업일 평균 (yesterday 자체는 평균에 불포함)
  let yesterdayVol:      number | null = null
  let avg20Vol:          number | null = null
  let yesterdayVolRatio: number | null = null
  let volumeDroughtScore = 0
  if (bars.length >= 22 && prevBar) {
    const yVol = prevBar.volume
    // bars[-22]부터 bars[-3]까지 = prevBar(bars[-2]) 직전의 20개 바
    const baseline = bars.slice(-22, -2).map(b => b.volume).filter(v => v > 0)
    if (yVol > 0 && baseline.length > 0) {
      const avg = baseline.reduce((s, v) => s + v, 0) / baseline.length
      if (avg > 0) {
        yesterdayVol      = yVol
        avg20Vol          = avg
        yesterdayVolRatio = yVol / avg
        if (yesterdayVolRatio < 0.5)        volumeDroughtScore = 30
        else if (yesterdayVolRatio < 0.75)  volumeDroughtScore = 15
        // ≥ 0.75 → 0점 (투매 의심)
      }
    }
  }

  // ─── 총점 ───
  const rawTotal = supportScore + turnaroundScore + volumeDroughtScore
  const totalScore = filterPassed ? rawTotal : 0
  const badge = (filterPassed && totalScore >= 85) ? '🎯 반등 타점 포착' : null

  return {
    filterPassed,
    filterReason,
    rawClose: P,
    ma10m, ma10w, sma20d,
    kmaSlopePositive: kmaPositive,
    recentHigh20d,
    drawdownFromHighPct,
    supportPrice, supportType, supportDisparityPct,
    todayOpen, yesterdayClose, turnaroundState,
    yesterdayVol, avg20Vol, yesterdayVolRatio,
    supportScore, turnaroundScore, volumeDroughtScore,
    totalScore,
    badge,
  }
}

// ───────────────────────────────────────────────────
// 내부 유틸 — 날짜 파싱
// ───────────────────────────────────────────────────

/** 'YYYY-MM' 반환 — 월봉 그룹 키 */
function toYearMonth(dateStr: string): string | null {
  const d = parseDate(dateStr)
  if (!d) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * ISO 주 키 반환 — 'YYYY-Www' (예: '2026-W17')
 * ISO 8601: 월요일이 주의 시작, 목요일이 속한 주의 연도가 그 주의 연도.
 * 주봉 그룹 키로 사용하기 위한 단순화 구현 (라이브러리 없음).
 */
function toIsoWeekKey(dateStr: string): string | null {
  const d = parseDate(dateStr)
  if (!d) return null
  // ISO: 해당 일자의 목요일(Thu)이 속한 연도·주차를 기준으로 함
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = tmp.getUTCDay() || 7   // 일=0 → 7로 보정
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)   // 그 주의 목요일로 이동
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
