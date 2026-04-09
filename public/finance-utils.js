/* ═══════════════════════════════════════════════════
   금융 계산 유틸리티 — 프론트엔드 JavaScript 버전
   ═══════════════════════════════════════════════════
   ⚠️  src/utils/financeSkills.ts 와 항상 동일 로직을 유지할 것
       한 쪽을 수정하면 다른 쪽도 반드시 동기화 (기능·수식 동일)
   ═══════════════════════════════════════════════════ */

/**
 * 가중평균 평단가 계산 (추가 매수 시)
 * 예) 10주 @ 50,000원 + 5주 @ 60,000원 → 새 평단가 53,333원
 *
 * @param {number} existQty  기존 보유 수량
 * @param {number} existAvg  기존 평균 매수단가(원)
 * @param {number} newQty    신규 매수 수량
 * @param {number} newPrice  신규 매수 단가(원)
 * @returns {number} 새로운 가중평균 평단가 (원, 반올림)
 */
function calculateWeightedAvg(existQty, existAvg, newQty, newPrice) {
  var totalQty = existQty + newQty;
  if (totalQty <= 0) return Math.round(newPrice);
  return Math.round((existQty * existAvg + newQty * newPrice) / totalQty);
}

/**
 * 10개월 단순이동평균선(SMA10) 계산
 * ⚠️ 반드시 수정주가(Adjusted Close) 배열을 입력해야 함
 *
 * @param {number[]} closes  월봉 종가 배열 (오름차순, 최소 10개)
 * @returns {number|null} SMA10 값, 데이터 부족 시 null
 */
function calculate10SMA(closes) {
  var last10 = closes.slice(-10);
  if (last10.length < 10) return null;
  return last10.reduce(function(s, c) { return s + c; }, 0) / 10;
}

/**
 * 지난달 기준 SMA10 (이평선 기울기 방향 판단용)
 * getPhase()의 "up" 여부 계산: up = (ma10 현재) > (smaPrev 지난달)
 *
 * @param {number[]} closes  월봉 종가 배열 (오름차순, 최소 11개)
 * @returns {number|null} 지난달 SMA10, 데이터 부족 시 null
 */
function calculateSMAPrev(closes) {
  var prev10 = closes.slice(-11, -1);
  if (prev10.length < 10) return null;
  return prev10.reduce(function(s, c) { return s + c; }, 0) / 10;
}

/**
 * 평가손익금 및 수익률 계산
 * 예) 평단가 50,000원 × 10주, 현재가 60,000원
 *   → profitKrw = +100,000원, profitPct = +20.00%
 *
 * @param {number} curPrice  현재가(원)
 * @param {number} avgPrice  평균 매수단가(원)
 * @param {number} qty       보유 수량
 * @returns {{ profitKrw: number, profitPct: number|null }}
 */
function calculateProfitAndLoss(curPrice, avgPrice, qty) {
  var evalKrw   = curPrice * qty;
  var investKrw = avgPrice * qty;
  var profitKrw = evalKrw - investKrw;
  var profitPct = investKrw > 0
    ? parseFloat(((profitKrw / investKrw) * 100).toFixed(2))
    : null;
  return { profitKrw: profitKrw, profitPct: profitPct };
}

/**
 * 숫자에 천 단위 콤마 포맷 (한국 원화 표기)
 * 예) 1234567 → "1,234,567"
 *
 * @param {number|null|undefined} n
 * @returns {string}
 */
function formatCurrency(n) {
  if (n == null || isNaN(Number(n))) return '-';
  return Math.round(Number(n)).toLocaleString('ko-KR');
}

/**
 * 수익률 문자열 포맷 (부호 + 소수 2자리 + %)
 * 예)  5.23 → "+5.23%"   -2.10 → "-2.10%"   Infinity → "+∞%"
 *
 * @param {number|null|undefined} r
 * @returns {string}
 */
function formatReturnRate(r) {
  if (r == null || isNaN(Number(r))) return '-';
  if (!isFinite(Number(r))) return Number(r) > 0 ? '+∞%' : '-∞%';
  return (Number(r) >= 0 ? '+' : '') + Number(r).toFixed(2) + '%';
}
