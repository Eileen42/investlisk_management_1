// ═══════════════════════════════════════════════════
// 금융 계산 유틸리티 — 백엔드 TypeScript 버전
// ═══════════════════════════════════════════════════
// ⚠️  public/finance-utils.js 와 항상 동일 로직을 유지할 것
//     한 쪽을 수정하면 다른 쪽도 반드시 동기화 (기능·수식 동일, 타입만 다름)
// ═══════════════════════════════════════════════════

/**
 * 가중평균 평단가 계산 (추가 매수 시)
 *
 * 예) 10주 @ 50,000원 보유 중 + 5주 @ 60,000원 추가매수
 *   → 새 평단가 = (10×50,000 + 5×60,000) / 15 = 53,333원
 *
 * @param existQty   기존 보유 수량
 * @param existAvg   기존 평균 매수단가(원)
 * @param newQty     신규 매수 수량
 * @param newPrice   신규 매수 단가(원)
 * @returns 새로운 가중평균 평단가 (원, 반올림)
 */
export function calculateWeightedAvg(
  existQty:  number,
  existAvg:  number,
  newQty:    number,
  newPrice:  number,
): number {
  const totalQty = existQty + newQty
  if (totalQty <= 0) return Math.round(newPrice)
  return Math.round((existQty * existAvg + newQty * newPrice) / totalQty)
}

/**
 * 10개월 단순이동평균선(SMA10) 계산
 *
 * ⚠️ 반드시 수정주가(Adjusted Close) 배열을 입력해야 함 (CLAUDE.md 원칙 1)
 *    액면분할·배당이 반영되지 않은 원주가를 쓰면 이평선이 왜곡됨
 *
 * @param closes  월봉 종가 배열 (오름차순, 최소 10개)
 * @returns SMA10 값, 데이터 부족 시 null
 */
export function calculate10SMA(closes: number[]): number | null {
  const last10 = closes.slice(-10)
  if (last10.length < 10) return null
  return last10.reduce((s, c) => s + c, 0) / 10
}

/**
 * 지난달 기준 SMA10 (이평선 기울기 방향 판단용)
 *
 * getPhase() 의 "up" 여부 계산에 사용:
 *   up = (ma10 현재) > (smaPrev 지난달)
 *
 * @param closes  월봉 종가 배열 (오름차순, 최소 11개)
 * @returns 지난달 SMA10, 데이터 부족 시 null
 */
export function calculateSMAPrev(closes: number[]): number | null {
  const prev10 = closes.slice(-11, -1)
  if (prev10.length < 10) return null
  return prev10.reduce((s, c) => s + c, 0) / 10
}

/**
 * 평가손익금 및 수익률 계산
 *
 * 예) 평단가 50,000원 × 10주 보유, 현재가 60,000원
 *   → profitKrw = +100,000원, profitPct = +20.00%
 *
 * 평단가가 0원(무상취득)인 경우 profitPct = null (분모가 0이므로 의미 없음)
 *
 * @param curPrice  현재가(원)
 * @param avgPrice  평균 매수단가(원)
 * @param qty       보유 수량
 */
export function calculateProfitAndLoss(
  curPrice: number,
  avgPrice: number,
  qty:      number,
): { profitKrw: number; profitPct: number | null } {
  const evalKrw   = curPrice * qty
  const investKrw = avgPrice * qty
  const profitKrw = evalKrw - investKrw
  const profitPct = investKrw > 0
    ? parseFloat(((profitKrw / investKrw) * 100).toFixed(2))
    : null
  return { profitKrw, profitPct }
}

/**
 * 숫자에 천 단위 콤마 포맷 (한국 원화 표기)
 * 예) 1234567 → "1,234,567"
 */
export function formatCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-'
  return Math.round(Number(n)).toLocaleString('ko-KR')
}

/**
 * 수익률 문자열 포맷 (부호 + 소수 2자리 + %)
 * 예)  5.23 → "+5.23%"
 *     -2.10 → "-2.10%"
 *  Infinity → "+∞%"   (무상취득 종목)
 */
export function formatReturnRate(r: number | null | undefined): string {
  if (r == null || isNaN(Number(r))) return '-'
  if (!isFinite(Number(r))) return Number(r) > 0 ? '+∞%' : '-∞%'
  return (Number(r) >= 0 ? '+' : '') + Number(r).toFixed(2) + '%'
}
