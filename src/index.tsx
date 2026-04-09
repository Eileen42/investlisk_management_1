import { Hono } from 'hono'
import { cors } from 'hono/cors'
import indexHtml from '../public/index.html'
import {
  isKisConfigured, getKisToken,
  fetchKisDomesticPrice, fetchKisDomesticMonthly, fetchKisDomesticWeekly,
  fetchKisVolumeRank,
  calcMa10FromBars, calcWeeklyMaFromBars, type KisEnv
} from './kis_api'
import {
  fetchUpbitPrice, fetchUpbitMonthlyCandles, fetchUpbitWeeklyCandles,
  calcCoinMa10, calcCoinMa10Weekly,
} from './utils/upbit_api'
import {
  calculateWeightedAvg, calculate10SMA, calculateSMAPrev, calculateProfitAndLoss,
} from './utils/financeSkills'

// Cloudflare Workers 환경 바인딩 타입
interface Env {
  // 사용자가 수동 등록한 한국어 이름 ↔ 티커 매핑을 영구 저장하는 KV 스토어
  // KIS 토큰 캐시 + 레이더 관심종목 저장에도 함께 사용
  CUSTOM_TICKERS: KVNamespace

  // ── 한국투자증권 API 자격증명 ──────────────────────
  // 로컬: .dev.vars 파일에 설정
  // 프로덕션: wrangler secret put KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NO
  KIS_APP_KEY: string
  KIS_APP_SECRET: string
  KIS_ACCOUNT_NO: string
  KIS_IS_REAL: string   // 'true'=실전, 'false'(기본)=모의
}

const app = new Hono<{ Bindings: Env }>()
app.use('/api/*', cors())

// ═══════════════════════════════════════════════════
// 캐시 레이어
// ═══════════════════════════════════════════════════
interface CacheEntry { data: unknown; timestamp: number }
const _cache = new Map<string, CacheEntry>()
const CACHE_TTL       = 15 * 60 * 1000   // 15분 (시세)
const CACHE_TTL_KRX   = 24 * 60 * 60 * 1000  // 24시간 (종목 리스트)

function getCached(key: string, ttl = CACHE_TTL): unknown | null {
  const e = _cache.get(key)
  if (!e) return null
  if (Date.now() - e.timestamp > ttl) { _cache.delete(key); return null }
  return e.data
}
function setCache(key: string, data: unknown): void {
  _cache.set(key, { data, timestamp: Date.now() })
}

// ═══════════════════════════════════════════════════
// KRX 종목 리스트 (한국 상장 주식 전체)
// 출처: KRX 정보데이터시스템 Open API (무료, 인증 불필요)
// ═══════════════════════════════════════════════════
interface KrxStock { name: string; ticker: string; market: string }

// 내장 주요 종목 맵 (API 실패 시 폴백 + 즉시 응답)
const KRX_FALLBACK: KrxStock[] = [
  { name:'삼성전자', ticker:'005930', market:'KOSPI' },
  { name:'삼성전자우', ticker:'005935', market:'KOSPI' },
  { name:'SK하이닉스', ticker:'000660', market:'KOSPI' },
  { name:'LG에너지솔루션', ticker:'373220', market:'KOSPI' },
  { name:'삼성바이오로직스', ticker:'207940', market:'KOSPI' },
  { name:'현대차', ticker:'005380', market:'KOSPI' },
  { name:'기아', ticker:'000270', market:'KOSPI' },
  { name:'셀트리온', ticker:'068270', market:'KOSPI' },
  { name:'POSCO홀딩스', ticker:'005490', market:'KOSPI' },
  { name:'LG화학', ticker:'051910', market:'KOSPI' },
  { name:'삼성SDI', ticker:'006400', market:'KOSPI' },
  { name:'KB금융', ticker:'105560', market:'KOSPI' },
  { name:'신한지주', ticker:'055550', market:'KOSPI' },
  { name:'하나금융지주', ticker:'086790', market:'KOSPI' },
  { name:'우리금융지주', ticker:'316140', market:'KOSPI' },
  { name:'카카오', ticker:'035720', market:'KOSPI' },
  { name:'카카오뱅크', ticker:'323410', market:'KOSPI' },
  { name:'카카오페이', ticker:'377300', market:'KOSPI' },
  { name:'네이버', ticker:'035420', market:'KOSPI' },
  { name:'크래프톤', ticker:'259960', market:'KOSPI' },
  { name:'넷마블', ticker:'251270', market:'KOSPI' },
  { name:'엔씨소프트', ticker:'036570', market:'KOSPI' },
  { name:'넥슨게임즈', ticker:'225570', market:'KOSDAQ' },
  { name:'카카오게임즈', ticker:'293490', market:'KOSDAQ' },
  { name:'두산에너빌리티', ticker:'034020', market:'KOSPI' },
  { name:'HMM', ticker:'011200', market:'KOSPI' },
  { name:'LG전자', ticker:'066570', market:'KOSPI' },
  { name:'삼성물산', ticker:'028260', market:'KOSPI' },
  { name:'현대모비스', ticker:'012330', market:'KOSPI' },
  { name:'SK이노베이션', ticker:'096770', market:'KOSPI' },
  { name:'SK텔레콤', ticker:'017670', market:'KOSPI' },
  { name:'KT', ticker:'030200', market:'KOSPI' },
  { name:'LG유플러스', ticker:'032640', market:'KOSPI' },
  { name:'롯데케미칼', ticker:'011170', market:'KOSPI' },
  { name:'CJ제일제당', ticker:'097950', market:'KOSPI' },
  { name:'아모레퍼시픽', ticker:'090430', market:'KOSPI' },
  { name:'LG생활건강', ticker:'051900', market:'KOSPI' },
  { name:'한국전력', ticker:'015760', market:'KOSPI' },
  { name:'한화에어로스페이스', ticker:'012450', market:'KOSPI' },
  { name:'한화솔루션', ticker:'009830', market:'KOSPI' },
  { name:'OCI홀딩스', ticker:'010060', market:'KOSPI' },
  { name:'포스코퓨처엠', ticker:'003670', market:'KOSPI' },
  { name:'에코프로', ticker:'086520', market:'KOSDAQ' },
  { name:'에코프로비엠', ticker:'247540', market:'KOSDAQ' },
  { name:'KODEX 200', ticker:'069500', market:'KOSPI' },
  { name:'KODEX 레버리지', ticker:'122630', market:'KOSPI' },
  { name:'KODEX 인버스', ticker:'114800', market:'KOSPI' },
  { name:'TIGER 미국S&P500', ticker:'360750', market:'KOSPI' },
  { name:'TIGER 미국나스닥100', ticker:'133690', market:'KOSPI' },
  { name:'KODEX 미국S&P500TR', ticker:'379800', market:'KOSPI' },
  { name:'KODEX 나스닥100TR', ticker:'379810', market:'KOSPI' },
  { name:'TIGER 차이나전기차SOLACTIVE', ticker:'371460', market:'KOSPI' },
  { name:'삼성중공업', ticker:'010140', market:'KOSPI' },
  { name:'현대건설', ticker:'000720', market:'KOSPI' },
  { name:'GS건설', ticker:'006360', market:'KOSPI' },
  { name:'대우건설', ticker:'047040', market:'KOSPI' },
  { name:'포스코인터내셔널', ticker:'047050', market:'KOSPI' },
  { name:'한미약품', ticker:'128940', market:'KOSPI' },
  { name:'유한양행', ticker:'000100', market:'KOSPI' },
  { name:'종근당', ticker:'185750', market:'KOSPI' },
  { name:'녹십자', ticker:'006280', market:'KOSPI' },
  { name:'셀트리온헬스케어', ticker:'091990', market:'KOSDAQ' },
  { name:'SK바이오사이언스', ticker:'302440', market:'KOSPI' },
  { name:'삼성화재', ticker:'000810', market:'KOSPI' },
  { name:'DB손해보험', ticker:'005830', market:'KOSPI' },
  { name:'메리츠화재', ticker:'000060', market:'KOSPI' },
  { name:'한국투자증권', ticker:'071050', market:'KOSPI' },
  { name:'미래에셋증권', ticker:'006800', market:'KOSPI' },
  { name:'키움증권', ticker:'039490', market:'KOSDAQ' },
  { name:'삼성증권', ticker:'016360', market:'KOSPI' },
  { name:'현대제철', ticker:'004020', market:'KOSPI' },
  { name:'고려아연', ticker:'010130', market:'KOSPI' },
  { name:'풍산', ticker:'103140', market:'KOSPI' },
  { name:'효성첨단소재', ticker:'298050', market:'KOSPI' },
  { name:'롯데쇼핑', ticker:'023530', market:'KOSPI' },
  { name:'이마트', ticker:'139480', market:'KOSPI' },
  { name:'BGF리테일', ticker:'282330', market:'KOSPI' },
  { name:'GS리테일', ticker:'007070', market:'KOSPI' },
  { name:'현대백화점', ticker:'069960', market:'KOSPI' },
  { name:'신세계', ticker:'004170', market:'KOSPI' },
  { name:'쿠팡', ticker:'CPNG', market:'NYSE' },
  { name:'하이브', ticker:'352820', market:'KOSPI' },
  { name:'SM엔터테인먼트', ticker:'041510', market:'KOSDAQ' },
  { name:'JYP Ent.', ticker:'035900', market:'KOSDAQ' },
  { name:'YG엔터테인먼트', ticker:'122870', market:'KOSDAQ' },
  { name:'펄어비스', ticker:'263750', market:'KOSDAQ' },
  { name:'리노공업', ticker:'058470', market:'KOSDAQ' },
  { name:'씨에스윈드', ticker:'112610', market:'KOSPI' },
  { name:'두산밥캣', ticker:'241560', market:'KOSPI' },
  { name:'HD현대', ticker:'267250', market:'KOSPI' },
  { name:'HD현대중공업', ticker:'329180', market:'KOSPI' },
  { name:'한국조선해양', ticker:'009540', market:'KOSPI' },
  { name:'삼성전기', ticker:'009150', market:'KOSPI' },
  { name:'한화', ticker:'000880', market:'KOSPI' },
  { name:'대한항공', ticker:'003490', market:'KOSPI' },
  { name:'SK', ticker:'034730', market:'KOSPI' },
  { name:'오리온', ticker:'271560', market:'KOSPI' },
  { name:'LG디스플레이', ticker:'034220', market:'KOSPI' },
  { name:'현대글로비스', ticker:'086280', market:'KOSPI' },
  { name:'메리츠금융지주', ticker:'138040', market:'KOSPI' },
]

// ── 한글 → 미국 주식 티커 맵 ──
// 한국 증권사 앱 공식 표기(순수 한글명 + 영문혼합명 + ADR 표기) 모두 포함
const US_KO_MAP: Record<string, string> = {
  // ── 빅테크 ──
  '애플': 'AAPL',
  '마이크로소프트': 'MSFT', '마소': 'MSFT',
  '엔비디아': 'NVDA',
  '아마존': 'AMZN', '아마존닷컴': 'AMZN',
  '알파벳': 'GOOGL', '알파벳A': 'GOOGL', '알파벳C': 'GOOG', '구글': 'GOOGL',
  '메타': 'META', '페이스북': 'META', '메타플랫폼스': 'META', '메타플랫폼스A': 'META',
  '테슬라': 'TSLA',
  '브로드컴': 'AVGO',
  // ── 반도체 ──
  '인텔': 'INTC',
  '에이엠디': 'AMD', 'AMD': 'AMD',
  '마이크론': 'MU', '마이크론테크놀로지': 'MU',
  '퀄컴': 'QCOM',
  '텍사스인스트루먼츠': 'TXN', '텍사스인스트루': 'TXN',
  '어플라이드머티어리얼즈': 'AMAT', '어플라이드머티리얼즈': 'AMAT',
  'ASML홀딩': 'ASML', 'ASML홀딩ADR': 'ASML',
  '람리서치': 'LRCX',
  'KLA': 'KLAC',
  // ── 소프트웨어 / 클라우드 ──
  '오라클': 'ORCL',
  '세일즈포스': 'CRM',
  '어도비': 'ADBE',
  '서비스나우': 'NOW',
  '인튜이트': 'INTU',
  '워크데이': 'WDAY', '워크데이A': 'WDAY',
  '팔로알토네트웍스': 'PANW', '팰로알토': 'PANW',
  '크라우드스트라이크': 'CRWD', '크라우드스트라이크홀딩스A': 'CRWD',
  '클라우드플레어': 'NET', '클라우드플레어N': 'NET',
  '스노우플레이크': 'SNOW',
  '데이터독': 'DDOG', '데이터독A': 'DDOG',
  '몽고디비': 'MDB', '몽고DB': 'MDB',
  '옥타': 'OKTA', '옥타A': 'OKTA',
  '트윌리오': 'TWLO', '트윌리오A': 'TWLO',
  '깃랩': 'GTLB', '깃랩B': 'GTLB',
  '허브스팟': 'HUBS',
  '줌': 'ZM', '줌비디오': 'ZM', '줌비디오커뮤니케이션스A': 'ZM',
  '시스코': 'CSCO', '시스코시스템즈': 'CSCO',
  // ── 핀테크 / 금융 ──
  '비자': 'V',
  '마스터카드': 'MA', '마스터카드A': 'MA',
  '페이팔': 'PYPL',
  '블록': 'SQ', '스퀘어': 'SQ',
  '코인베이스': 'COIN', '코인베이스글로벌A': 'COIN',
  '로빈후드': 'HOOD', '로빈후드마켓A': 'HOOD',
  '어펌': 'AFRM',
  'JP모간체이스': 'JPM', 'JP모건체이스': 'JPM', '제이피모건': 'JPM',
  '뱅크오브아메리카': 'BAC',
  '골드만삭스': 'GS', '골드만삭스그룹': 'GS',
  '모건스탠리': 'MS',
  '블랙록': 'BLK',
  '버크셔해서웨이B': 'BRK-B', '버크셔해서웨이A': 'BRK-A', '버크셔': 'BRK-B', '워렌버핏': 'BRK-B',
  // ── 소비재 / 유통 ──
  '월마트': 'WMT',
  '코스트코': 'COST',
  '홈디포': 'HD',
  '맥도날드': 'MCD',
  '스타벅스': 'SBUX',
  '코카콜라': 'KO',
  '펩시코': 'PEP',
  '나이키': 'NKE', '나이키B': 'NKE',
  '디즈니': 'DIS',
  '넷플릭스': 'NFLX',
  // ── 헬스케어 / 제약 ──
  '일라이릴리': 'LLY',
  '유나이티드헬스': 'UNH', '유나이티드헬스그룹': 'UNH',
  '존슨앤드존슨': 'JNJ', '존슨앤존슨': 'JNJ',
  '화이자': 'PFE',
  '모더나': 'MRNA',
  '애브비': 'ABBV',
  '머크': 'MRK',
  '일루미나': 'ILMN',
  // ── 에너지 ──
  '엑손모빌': 'XOM',
  '쉐브론': 'CVX', '셰브론': 'CVX',
  '코노코필립스': 'COP',
  // ── 산업 ──
  '보잉': 'BA',
  '캐터필러': 'CAT',
  '디어앤컴퍼니': 'DE', '디어': 'DE',
  '록히드마틴': 'LMT',
  '레이시온': 'RTX', '레이테온': 'RTX',
  '허니웰': 'HON',
  '프록터앤드갬블': 'PG', '피앤지': 'PG',
  // ── 모빌리티 / EV ──
  '우버테크놀로지스': 'UBER',
  '리프트': 'LYFT', '리프트A': 'LYFT',
  '리비안': 'RIVN', '리비안오토모티브A': 'RIVN', '리비안오토모티브': 'RIVN',
  '루시드': 'LCID', '루시드그룹': 'LCID',
  '니오': 'NIO', '니오ADR': 'NIO',
  '샤오펑': 'XPEV', '샤오펑ADR': 'XPEV',
  '리오토': 'LI', '리오토ADR': 'LI', '이상오토모티브ADR': 'LI',
  // ── 이커머스 / 플랫폼 ──
  '우버': 'UBER', '쿠팡': 'CPNG',
  '쇼피파이': 'SHOP', '쇼피파이A': 'SHOP',
  '에어비앤비': 'ABNB', '에어비앤비A': 'ABNB',
  '도어대시': 'DASH', '도어대시A': 'DASH',
  '스포티파이': 'SPOT', '스포티파이테크놀로지': 'SPOT',
  '스냅': 'SNAP', '스냅A': 'SNAP',
  '핀터레스트': 'PINS', '핀터레스트A': 'PINS',
  // ── AI / 신기술 ──
  '팔란티어': 'PLTR', '팔란티어테크놀로지스A': 'PLTR', '팔란티어테크놀로지스': 'PLTR',
  '암홀딩스': 'ARM', '암홀딩스ADR': 'ARM', 'ARM홀딩스': 'ARM',
  // ── 중국 ADR ──
  '알리바바': 'BABA', '알리바바그룹': 'BABA', '알리바바그룹홀딩ADR': 'BABA',
  '바이두': 'BIDU', '바이두ADR': 'BIDU',
  '징둥': 'JD', 'JD닷컴': 'JD', 'JD닷컴ADR': 'JD',
  '핀둬둬': 'PDD', '핀둬둬홀딩스ADR': 'PDD', '테무': 'PDD',
  '넷이즈': 'NTES', '넷이즈ADR': 'NTES',
  '빌리빌리': 'BILI', '빌리빌리ADR': 'BILI',
  '트립닷컴': 'TCOM', '트립닷컴그룹ADR': 'TCOM',
  // ── ETF (한글/공식명) ──
  'S&P500': 'SPY', 'sp500': 'SPY', '에스앤피500': 'SPY', '에스앤피': 'SPY',
  'SPDR S&P500 ETF트러스트': 'SPY', 'SPDRSP500': 'SPY',
  '나스닥': 'QQQ', '나스닥100': 'QQQ', '인베스코QQQ': 'QQQ', '인베스코QQQ트러스트시리즈1': 'QQQ',
  '나스닥3배': 'TQQQ', '레버리지': 'TQQQ', '프로셰어즈울트라프로QQQ': 'TQQQ',
  '반도체3배': 'SOXL', '반도체레버리지': 'SOXL', '디렉시온데일리반도체불3X': 'SOXL', '디렉시온반도체3배': 'SOXL',
  '금': 'GLD', 'SPDR골드셰어즈': 'GLD',
  '국채': 'TLT', '아이셰어즈20+년만기미국채': 'TLT',
  '배당': 'SCHD', '슈드': 'SCHD', '슈왑미국배당주': 'SCHD', '슈왑미국배당주식': 'SCHD',
  '아크': 'ARKK', '아크이노베이션': 'ARKK', 'ARK이노베이션': 'ARKK',
  '뱅가드': 'VOO', '뱅가드S&P500': 'VOO',
  '뱅가드전체': 'VTI', '뱅가드토탈스톡마켓': 'VTI',
  '아이셰어즈코어S&P500': 'IVV',
}

// ═══════════════════════════════════════════════════
// 한국어 이름 ↔ 티커 커스텀 매핑
// ─────────────────────────────────────────────────
// [역할] 자동 검색(네이버·KRX)에서 누락되는 소형주·특수 종목을 위한 수동 매핑 테이블.
// 사용자가 앱에서 "한국어 이름 등록" 버튼으로 추가하면 KV에 영구 저장되며,
// 여기 BUILTIN 맵은 KV 저장이 없어도 항상 적용되는 하드코딩 기본값.
//
// ticker 형식: "6자리코드.KQ" (KOSDAQ) 또는 "6자리코드.KS" (KOSPI)
// ═══════════════════════════════════════════════════
const CUSTOM_KO_BUILTIN: Record<string, string> = {
  '한성크린텍': '066980.KQ',
  // 앞으로 누락 종목이 발견될 때마다 여기에 추가
}

// KV(영구 저장) + BUILTIN(하드코딩) 두 곳을 합쳐서 전체 커스텀 매핑을 반환합니다.
// KV에 없어도 BUILTIN 값은 항상 살아있어서, Worker 재시작 후에도 빠짐없이 작동합니다.
async function getCustomKoMap(kv?: KVNamespace): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...CUSTOM_KO_BUILTIN }
  if (!kv) return merged
  try {
    const stored = await kv.get('ko_map', 'json') as Record<string, string> | null
    if (stored) Object.assign(merged, stored)  // KV 값이 BUILTIN보다 우선
  } catch (_) { /* KV 오류 시 BUILTIN만 사용 */ }
  return merged
}

// 인기 미국 ETF / 주식 내장 맵
const US_STOCKS: Array<{ name: string; ticker: string; desc: string }> = [
  { name:'SPY',  ticker:'SPY',  desc:'SPDR S&P 500 ETF' },
  { name:'QQQ',  ticker:'QQQ',  desc:'Invesco QQQ (나스닥100)' },
  { name:'IVV',  ticker:'IVV',  desc:'iShares Core S&P 500 ETF' },
  { name:'VTI',  ticker:'VTI',  desc:'Vanguard Total Stock Market' },
  { name:'VOO',  ticker:'VOO',  desc:'Vanguard S&P 500 ETF' },
  { name:'SCHD', ticker:'SCHD', desc:'Schwab US Dividend ETF' },
  { name:'TQQQ', ticker:'TQQQ', desc:'ProShares UltraPro QQQ (3x레버리지)' },
  { name:'SOXL', ticker:'SOXL', desc:'Direxion 반도체 3x 레버리지' },
  { name:'ARKK', ticker:'ARKK', desc:'ARK Innovation ETF' },
  { name:'GLD',  ticker:'GLD',  desc:'SPDR Gold Shares (금)' },
  { name:'TLT',  ticker:'TLT',  desc:'iShares 20+ Year Treasury Bond' },
  { name:'AAPL', ticker:'AAPL', desc:'Apple Inc.' },
  { name:'MSFT', ticker:'MSFT', desc:'Microsoft Corporation' },
  { name:'GOOGL',ticker:'GOOGL',desc:'Alphabet Inc. (Google)' },
  { name:'AMZN', ticker:'AMZN', desc:'Amazon.com Inc.' },
  { name:'NVDA', ticker:'NVDA', desc:'NVIDIA Corporation' },
  { name:'TSLA', ticker:'TSLA', desc:'Tesla Inc.' },
  { name:'META', ticker:'META', desc:'Meta Platforms (Facebook)' },
  { name:'NFLX', ticker:'NFLX', desc:'Netflix Inc.' },
  { name:'AMD',  ticker:'AMD',  desc:'Advanced Micro Devices' },
  { name:'INTC', ticker:'INTC', desc:'Intel Corporation' },
  { name:'BABA', ticker:'BABA', desc:'Alibaba Group' },
  { name:'DIS',  ticker:'DIS',  desc:'The Walt Disney Company' },
  { name:'JPM',  ticker:'JPM',  desc:'JPMorgan Chase & Co.' },
  { name:'COIN', ticker:'COIN', desc:'Coinbase Global Inc.' },
  { name:'PLTR', ticker:'PLTR', desc:'Palantir Technologies' },
  { name:'CPNG', ticker:'CPNG', desc:'Coupang Inc. (쿠팡)' },
]

// KRX Open API에서 전체 상장 종목 가져오기 (24시간 캐싱)
async function fetchKrxList(): Promise<KrxStock[]> {
  const cached = getCached('krx_list', CACHE_TTL_KRX)
  if (cached) return cached as KrxStock[]

  const results: KrxStock[] = [...KRX_FALLBACK]

  try {
    // KRX 데이터포털 KOSPI 종목 (인증 불필요)
    const kospiUrl = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=stockMkt'
    const kosdaqUrl = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=kosdaqMkt'

    const fetchMarket = async (url: string, market: string) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml' }
      })
      if (!res.ok) return
      const text = await res.text()
      // HTML 테이블에서 파싱
      const rowRegex = /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>(\d{6})<\/td>/gi
      let m: RegExpExecArray | null
      while ((m = rowRegex.exec(text)) !== null) {
        const name = m[1].trim()
        const ticker = m[2].trim()
        if (name && ticker && !results.find(r => r.ticker === ticker)) {
          results.push({ name, ticker, market })
        }
      }
    }

    await Promise.allSettled([
      fetchMarket(kospiUrl, 'KOSPI'),
      fetchMarket(kosdaqUrl, 'KOSDAQ'),
    ])
  } catch (_) { /* KRX 실패 시 fallback 사용 */ }

  setCache('krx_list', results)
  return results
}

// ═══════════════════════════════════════════════════
// 한국 주식 검색 서브 함수들 (병렬 실행용)
// ═══════════════════════════════════════════════════

// [방법 1] 네이버 금융 자동완성 - 인기 종목에 빠름, 소형주는 누락될 수 있음
async function searchNaverAc(query: string): Promise<KrxStock[]> {
  try {
    const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=utf-8&st=111&r_format=json&r_enc=utf-8`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://finance.naver.com', 'Accept': 'application/json' }
    })
    if (!res.ok) return []
    const json = await res.json() as { items?: string[][][] }
    // items[0] = 국내주식, items[1] = 해외/기타
    const allItems = [...(json?.items?.[0] || []), ...(json?.items?.[1] || [])]
    return allItems
      .filter(item => item[0] && item[1] && /^\d{6}$/.test(item[1]))
      .map(item => ({ name: item[0], ticker: item[1], market: 'KR' }))
  } catch (_) { return [] }
}

// [방법 2] 네이버 모바일 통합검색 - 자동완성보다 더 많은 종목 커버
async function searchNaverMobile(query: string): Promise<KrxStock[]> {
  try {
    const url = `https://m.stock.naver.com/api/search/all?keyword=${encodeURIComponent(query)}&page=1&pageSize=15`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://m.stock.naver.com/',
        'Accept': 'application/json'
      }
    })
    if (!res.ok) return []
    const json = await res.json() as {
      result?: { stocks?: Array<{ itemCode?: string; itemName?: string; stockExchangeType?: { shortName?: string } }> }
    }
    return (json?.result?.stocks || [])
      .filter(s => s.itemCode && s.itemName && /^\d{6}$/.test(s.itemCode))
      .map(s => ({ name: s.itemName!, ticker: s.itemCode!, market: s.stockExchangeType?.shortName || 'KR' }))
  } catch (_) { return [] }
}

// [방법 3] KRX 데이터포털 종목 검색 - 전체 상장 종목 대상, 가장 완전한 검색
// 증권사 앱처럼 KOSPI+KOSDAQ 전종목을 이름으로 검색 가능
async function searchKrxPortal(query: string): Promise<KrxStock[]> {
  try {
    const body = new URLSearchParams({
      bld: 'dbms/comm/finder/finder_stkisu',
      locale: 'ko_KR',
      mktsel: 'ALL',   // ALL = KOSPI + KOSDAQ 전체
      searchText: query,
      pagePath: '/comm/finder/finder_stkisu.jsp'
    })
    const res = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://data.krx.co.kr/contents/MDC/MAIN/main/index.cmd',
        'Origin': 'https://data.krx.co.kr'
      },
      body: body.toString()
    })
    if (!res.ok) return []
    const json = await res.json() as {
      block1?: Array<{ short_code?: string; codeName?: string; marketName?: string }>
    }
    return (json?.block1 || [])
      .filter(s => s.short_code && s.codeName)
      .map(s => ({ name: s.codeName!, ticker: s.short_code!, market: s.marketName || 'KR' }))
  } catch (_) { return [] }
}

// ═══════════════════════════════════════════════════
// 종목 검색 함수 (한/영 통합)
// ═══════════════════════════════════════════════════
interface SearchResult {
  name: string
  ticker: string
  market: string
  desc?: string
  isKorean: boolean
  isCoin?: boolean  // 코인 여부 (업비트 KRW-BTC 포맷)
}

// ── 업비트 코인 내장 목록 (공개 API 검색 전 즉시 응답용) ──
// 업비트 KRW 마켓 전체 기준 주요 코인 목록
const COIN_LIST: Array<{ name: string; ticker: string; market: string; desc: string }> = [
  // ── 대형 코인 ──
  { name: '비트코인',         ticker: 'KRW-BTC',   market: 'UPBIT', desc: 'Bitcoin BTC' },
  { name: '이더리움',         ticker: 'KRW-ETH',   market: 'UPBIT', desc: 'Ethereum ETH' },
  { name: '리플',             ticker: 'KRW-XRP',   market: 'UPBIT', desc: 'XRP Ripple' },
  { name: '솔라나',           ticker: 'KRW-SOL',   market: 'UPBIT', desc: 'Solana SOL' },
  { name: '도지코인',         ticker: 'KRW-DOGE',  market: 'UPBIT', desc: 'Dogecoin DOGE' },
  { name: '에이다',           ticker: 'KRW-ADA',   market: 'UPBIT', desc: 'Cardano ADA' },
  { name: '트론',             ticker: 'KRW-TRX',   market: 'UPBIT', desc: 'TRON TRX' },
  { name: '아발란체',         ticker: 'KRW-AVAX',  market: 'UPBIT', desc: 'Avalanche AVAX' },
  { name: '체인링크',         ticker: 'KRW-LINK',  market: 'UPBIT', desc: 'Chainlink LINK' },
  { name: '수이',             ticker: 'KRW-SUI',   market: 'UPBIT', desc: 'Sui SUI' },
  { name: '폴카닷',           ticker: 'KRW-DOT',   market: 'UPBIT', desc: 'Polkadot DOT' },
  { name: '비트코인캐시',     ticker: 'KRW-BCH',   market: 'UPBIT', desc: 'Bitcoin Cash BCH' },
  { name: '이더리움클래식',   ticker: 'KRW-ETC',   market: 'UPBIT', desc: 'Ethereum Classic ETC' },
  { name: '스텔라루멘',       ticker: 'KRW-XLM',   market: 'UPBIT', desc: 'Stellar XLM' },
  { name: '클레이튼',         ticker: 'KRW-KLAY',  market: 'UPBIT', desc: 'Klaytn KLAY' },
  { name: '샌드박스',         ticker: 'KRW-SAND',  market: 'UPBIT', desc: 'The Sandbox SAND' },
  { name: '매틱',             ticker: 'KRW-MATIC', market: 'UPBIT', desc: 'Polygon MATIC' },
  { name: '앱토스',           ticker: 'KRW-APT',   market: 'UPBIT', desc: 'Aptos APT' },
  { name: '아비트럼',         ticker: 'KRW-ARB',   market: 'UPBIT', desc: 'Arbitrum ARB' },
  { name: '옵티미즘',         ticker: 'KRW-OP',    market: 'UPBIT', desc: 'Optimism OP' },
  // ── 추가: 대형 레이어1/레이어2 ──
  { name: '톤코인',           ticker: 'KRW-TON',   market: 'UPBIT', desc: 'Toncoin TON' },
  { name: '라이트코인',       ticker: 'KRW-LTC',   market: 'UPBIT', desc: 'Litecoin LTC' },
  { name: '니어프로토콜',     ticker: 'KRW-NEAR',  market: 'UPBIT', desc: 'NEAR Protocol NEAR' },
  { name: '코스모스',         ticker: 'KRW-ATOM',  market: 'UPBIT', desc: 'Cosmos ATOM' },
  { name: '알고랜드',         ticker: 'KRW-ALGO',  market: 'UPBIT', desc: 'Algorand ALGO' },
  { name: '파일코인',         ticker: 'KRW-FIL',   market: 'UPBIT', desc: 'Filecoin FIL' },
  { name: '이오스',           ticker: 'KRW-EOS',   market: 'UPBIT', desc: 'EOS' },
  { name: '플로우',           ticker: 'KRW-FLOW',  market: 'UPBIT', desc: 'Flow FLOW' },
  { name: '퀀텀',             ticker: 'KRW-QTUM',  market: 'UPBIT', desc: 'Qtum QTUM' },
  { name: '이오스트',         ticker: 'KRW-IOST',  market: 'UPBIT', desc: 'IOST' },
  { name: '아이콘',           ticker: 'KRW-ICX',   market: 'UPBIT', desc: 'ICON ICX' },
  { name: '질리카',           ticker: 'KRW-ZIL',   market: 'UPBIT', desc: 'Zilliqa ZIL' },
  { name: '온톨로지',         ticker: 'KRW-ONT',   market: 'UPBIT', desc: 'Ontology ONT' },
  { name: '네오',             ticker: 'KRW-NEO',   market: 'UPBIT', desc: 'NEO' },
  { name: '비체인',           ticker: 'KRW-VET',   market: 'UPBIT', desc: 'VeChain VET' },
  { name: '스택스',           ticker: 'KRW-STX',   market: 'UPBIT', desc: 'Stacks STX' },
  { name: '인젝티브',         ticker: 'KRW-INJ',   market: 'UPBIT', desc: 'Injective INJ' },
  { name: '셀로',             ticker: 'KRW-CELO',  market: 'UPBIT', desc: 'Celo CELO' },
  { name: '만타네트워크',     ticker: 'KRW-MANTA', market: 'UPBIT', desc: 'Manta Network MANTA' },
  // ── 밈코인 ──
  { name: '시바이누',         ticker: 'KRW-SHIB',  market: 'UPBIT', desc: 'Shiba Inu SHIB' },
  { name: '페페',             ticker: 'KRW-PEPE',  market: 'UPBIT', desc: 'Pepe PEPE' },
  { name: '봉크',             ticker: 'KRW-BONK',  market: 'UPBIT', desc: 'Bonk BONK' },
  { name: '도그위프햇',       ticker: 'KRW-WIF',   market: 'UPBIT', desc: 'dogwifhat WIF' },
  // ── DeFi ──
  { name: '유니스왑',         ticker: 'KRW-UNI',   market: 'UPBIT', desc: 'Uniswap UNI' },
  { name: '주피터',           ticker: 'KRW-JUP',   market: 'UPBIT', desc: 'Jupiter JUP' },
  // ── 한국 블록체인 ──
  { name: '위믹스',           ticker: 'KRW-WEMIX', market: 'UPBIT', desc: 'WEMIX' },
  { name: '보라',             ticker: 'KRW-BORA',  market: 'UPBIT', desc: 'BORA' },
  { name: '메디블록',         ticker: 'KRW-MED',   market: 'UPBIT', desc: 'MediBloc MED' },
  { name: '무비블록',         ticker: 'KRW-MBL',   market: 'UPBIT', desc: 'MovieBloc MBL' },
  { name: '피르마체인',       ticker: 'KRW-FCT2',  market: 'UPBIT', desc: 'FirmaChain FCT2' },
  // ── 기타 주요 코인 ──
  { name: '오미세고',         ticker: 'KRW-OMG',   market: 'UPBIT', desc: 'OMG Network OMG' },
  { name: '비트코인골드',     ticker: 'KRW-BTG',   market: 'UPBIT', desc: 'Bitcoin Gold BTG' },
  { name: '스팀',             ticker: 'KRW-STEEM', market: 'UPBIT', desc: 'Steem STEEM' },
  { name: '리스크',           ticker: 'KRW-LSK',   market: 'UPBIT', desc: 'Lisk LSK' },
  { name: '시아코인',         ticker: 'KRW-SC',    market: 'UPBIT', desc: 'Siacoin SC' },
  { name: '웨이브',           ticker: 'KRW-WAVES', market: 'UPBIT', desc: 'Waves WAVES' },
  { name: '아크',             ticker: 'KRW-ARK',   market: 'UPBIT', desc: 'Ark ARK' },
  { name: '스트라티스',       ticker: 'KRW-STRAX', market: 'UPBIT', desc: 'Stratis STRAX' },
  { name: '넴',               ticker: 'KRW-XEM',   market: 'UPBIT', desc: 'NEM XEM' },
  { name: '매직',             ticker: 'KRW-MTL',   market: 'UPBIT', desc: 'Metal MTL' },
  { name: '제타체인',         ticker: 'KRW-ZETA',  market: 'UPBIT', desc: 'ZetaChain ZETA' },
  { name: '글림머',           ticker: 'KRW-GLM',   market: 'UPBIT', desc: 'Golem GLM' },
  { name: '코스',             ticker: 'KRW-COS',   market: 'UPBIT', desc: 'Contentos COS' },
  { name: '고스트',           ticker: 'KRW-GRS',   market: 'UPBIT', desc: 'Groestlcoin GRS' },
  { name: '폴리곤',           ticker: 'KRW-MATIC', market: 'UPBIT', desc: 'Polygon MATIC' },
  { name: '스와이프',         ticker: 'KRW-SXP',   market: 'UPBIT', desc: 'SXP Solar' },
  { name: '핀시아',           ticker: 'KRW-FNSA',  market: 'UPBIT', desc: 'Finschia FNSA' },
  { name: '밀크',             ticker: 'KRW-MLK',   market: 'UPBIT', desc: 'MiL.k MLK' },
  { name: '에이피엠코인',     ticker: 'KRW-APM',   market: 'UPBIT', desc: 'APM Coin APM' },
  { name: '드레이곤베인',     ticker: 'KRW-DVI',   market: 'UPBIT', desc: 'Dvision Network DVI' },
  { name: '오르빗브릿지',     ticker: 'KRW-ORBS',  market: 'UPBIT', desc: 'Orbs ORBS' },
  { name: '원월드',           ticker: 'KRW-AQT',   market: 'UPBIT', desc: 'Alpha Quark AQT' },
  { name: '아르고',           ticker: 'KRW-ARGO',  market: 'UPBIT', desc: 'ArGo ARGO' },
  { name: '에스알엑스',       ticker: 'KRW-SRX',   market: 'UPBIT', desc: 'StorX SRX' },
]

async function searchStocks(query: string, kv?: KVNamespace): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const results: SearchResult[] = []
  const seen = new Set<string>()
  const addResult = (r: SearchResult) => {
    // 한국 6자리 종목코드는 거래소 접미사 무관하게 중복 체크 (같은 종목 다른 접미사 방지)
    const key = /^\d{6}/.test(r.ticker) ? r.ticker.slice(0, 6) : r.ticker
    if (!seen.has(key)) { seen.add(key); results.push(r) }
  }
  // 거래소 정보가 있는 한국 종목을 추가할 때 접미사 포함 티커로 저장
  // → 이후 fetchYahooPrice 등에서 올바른 거래소로 바로 조회 가능
  const addKoreanResult = (s: KrxStock) => {
    const suffix = getYhSuffix(s.market)
    const ticker = suffix ? s.ticker + suffix : s.ticker
    addResult({ ...s, ticker, isKorean: true })
  }

  const qLower = q.toLowerCase()
  const isKorean = /[가-힣]/.test(q)
  const isNumber = /^\d+$/.test(q)

  // ── 0-A. 코인 검색 최우선 (업비트 KRW- 마켓) ──
  // 한글/영문/티커 모두 매칭. 한국 Bitcoin ETF 검색결과에 묻히지 않도록 맨 먼저 추가.
  const qUpCoin = q.toUpperCase()
  const coinMatches = COIN_LIST.filter(c => {
    const qLowCoin = q.toLowerCase()
    return c.name.includes(q) ||
      c.ticker.toUpperCase().includes(qUpCoin) ||
      c.ticker.replace('KRW-', '').startsWith(qUpCoin) ||
      (c.desc && c.desc.toLowerCase().includes(qLowCoin))
  })
  coinMatches.slice(0, 5).forEach(c => {
    if (!seen.has(c.ticker)) {
      seen.add(c.ticker)
      results.push({ name: c.name, ticker: c.ticker, market: 'UPBIT', desc: c.desc, isKorean: false, isCoin: true })
    }
  })

  // ── 0-A2. COIN_LIST에 없는 코인도 KRW- 형식으로 입력 시 업비트 API에서 동적 검색 ──
  // "KRW-XXX" 또는 "XXX"(3~8자 영문) 입력 시 업비트 마켓 목록에서 추가 검색
  const isLikelyCoin = /^KRW-[A-Z0-9]+$/i.test(q) ||
    (/^[A-Z0-9]{2,10}$/i.test(q) && !isNumber)
  if (isLikelyCoin && coinMatches.length === 0) {
    try {
      const upbitMarketsRes = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', {
        headers: { Accept: 'application/json' }
      })
      if (upbitMarketsRes.ok) {
        const upbitMarkets = await upbitMarketsRes.json() as Array<{ market: string; korean_name: string; english_name: string }>
        const krwMarkets = upbitMarkets.filter((m: any) => m.market.startsWith('KRW-'))
        const dynCoinQ = q.toUpperCase().replace('KRW-', '')
        const dynMatches = krwMarkets.filter((m: any) =>
          m.market.includes(dynCoinQ) ||
          m.korean_name.includes(q) ||
          m.english_name.toLowerCase().includes(q.toLowerCase())
        )
        dynMatches.slice(0, 5).forEach((m: any) => {
          if (!seen.has(m.market)) {
            seen.add(m.market)
            const coinName = m.korean_name || m.english_name
            results.push({ name: coinName, ticker: m.market, market: 'UPBIT', desc: m.english_name, isKorean: false, isCoin: true })
          }
        })
      }
    } catch (_) { /* 업비트 API 실패 시 조용히 무시 */ }
  }

  // ── 0-B. 커스텀 매핑 우선 조회 (한/영 모든 쿼리에 적용) ──
  // 사용자가 수동으로 등록한 이름 + BUILTIN 하드코딩 목록에서 먼저 찾습니다.
  // 소형주나 자동 검색에 누락된 종목도 여기서 정확하게 매칭됩니다.
  const customMap = await getCustomKoMap(kv)
  const customMatches = Object.entries(customMap).filter(([koName]) => koName.toLowerCase().includes(q.toLowerCase()))
  customMatches.slice(0, 5).forEach(([koName, fullTicker]) => {
    // fullTicker는 "066980.KQ" 형식 — 거래소 접미사 포함
    const isKq = fullTicker.toUpperCase().endsWith('.KQ')
    const isKs = fullTicker.toUpperCase().endsWith('.KS')
    const market = isKq ? 'KOSDAQ' : isKs ? 'KOSPI' : 'KR'
    addResult({ name: koName, ticker: fullTicker, market, isKorean: true })
  })

  // ── 1. 한국어 쿼리 처리 ──
  if (isKorean) {
    // 1-A. 미국 주식 한글명 딕셔너리 매칭 (애플, 테슬라 등)
    const koMatches = Object.entries(US_KO_MAP).filter(([k]) => k.includes(q))
    koMatches.slice(0, 5).forEach(([koName, ticker]) => {
      const usSt = US_STOCKS.find(s => s.ticker === ticker)
      addResult({ name: koName + ' (' + ticker + ')', ticker, market: 'US', desc: usSt?.desc || ticker, isKorean: false })
    })

    // 1-B. 네이버 자동완성 + 네이버 모바일 + KRX 포털을 동시에 조회
    // → 세 곳에서 병렬로 검색해서 빠짐없이 찾음 (Promise.allSettled = 하나 실패해도 나머지 결과 유지)
    const [acRes, mobileRes, krxRes] = await Promise.allSettled([
      searchNaverAc(q),
      searchNaverMobile(q),
      searchKrxPortal(q)
    ])
    // Naver AC는 거래소 정보 없음(market:'KR') → addResult 사용 (접미사 없이 저장, .KQ 폴백으로 대응)
    if (acRes.status === 'fulfilled')     acRes.value.forEach(s => addResult({ ...s, isKorean: true }))
    // Naver Mobile/KRX 포털은 KOSPI/KOSDAQ 정보 있음 → addKoreanResult로 .KS/.KQ 접미사 포함 티커 저장
    if (mobileRes.status === 'fulfilled') mobileRes.value.forEach(s => addKoreanResult(s))
    if (krxRes.status === 'fulfilled')    krxRes.value.forEach(s => addKoreanResult(s))

    // 1-C. 위 세 곳 모두 실패하거나 결과가 적으면 KRX 전체 목록에서 검색 (최후 폴백)
    if (results.filter(r => r.isKorean).length < 3) {
      const krxList = await fetchKrxList()
      const matches = krxList.filter(s => s.name.toLowerCase().includes(qLower))
      matches.sort((a, b) => {
        const aE = a.name.toLowerCase() === qLower ? 0 : a.name.toLowerCase().startsWith(qLower) ? 1 : 2
        const bE = b.name.toLowerCase() === qLower ? 0 : b.name.toLowerCase().startsWith(qLower) ? 1 : 2
        return aE - bE
      })
      matches.slice(0, 10).forEach(s => addKoreanResult(s))
    }
  }

  // ── 숫자(종목코드) 검색 ──
  if (isNumber) {
    const krxList = await fetchKrxList()
    krxList.filter(s => s.ticker.startsWith(q)).slice(0, 8)
      .forEach(s => addKoreanResult(s))
  }

  // ── ETF 영문 접두어 검색 ──
  if (!isKorean && (q.toUpperCase().startsWith('KODEX') || q.toUpperCase().startsWith('TIGER') || q.toUpperCase().startsWith('KBSTAR') || q.toUpperCase().startsWith('HANARO'))) {
    const krxList = await fetchKrxList()
    krxList.filter(s => s.name.toLowerCase().includes(qLower)).slice(0, 8)
      .forEach(s => addKoreanResult(s))
  }

  // ── 2. 미국 주식/ETF 검색 (영문 입력 시) ──
  if (!isKorean) {
    const qUp = q.toUpperCase()
    // 내장 리스트에서 먼저 검색
    const localMatches = US_STOCKS.filter(s =>
      s.ticker.startsWith(qUp) || s.name.toLowerCase().includes(qLower) || s.desc.toLowerCase().includes(qLower)
    )
    localMatches.sort((a, b) => {
      const aExact = a.ticker === qUp ? 0 : a.ticker.startsWith(qUp) ? 1 : 2
      const bExact = b.ticker === qUp ? 0 : b.ticker.startsWith(qUp) ? 1 : 2
      return aExact - bExact
    })
    localMatches.slice(0, 8).forEach(s =>
      addResult({ name: s.name, ticker: s.ticker, market: 'US', desc: s.desc, isKorean: false })
    )

    // Yahoo Finance 자동완성 API (실시간 검색)
    if (results.length < 10) {
      try {
        const yhUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=en-US&region=US&quotesCount=8&newsCount=0&enableFuzzyQuery=false`
        const yhRes = await fetch(yhUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
        })
        if (yhRes.ok) {
          const yhJson = await yhRes.json() as {
            quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }>
          }
          const quotes = yhJson?.quotes || []
          quotes
            .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF' || q.quoteType === 'MUTUALFUND'))
            .slice(0, 8)
            .forEach(q => {
              const sym = q.symbol!
              // 한국 주식인 경우 .KS / .KQ 제거
              const isKs = sym.endsWith('.KS') || sym.endsWith('.KQ')
              const cleanTicker = isKs ? sym.replace(/\.(KS|KQ)$/, '') : sym
              const name = q.shortname || q.longname || sym
              addResult({
                name: name,
                ticker: cleanTicker,
                market: isKs ? (sym.endsWith('.KS') ? 'KOSPI' : 'KOSDAQ') : (q.exchange || 'US'),
                desc: q.longname || q.shortname,
                isKorean: isKs
              })
            })
        }
      } catch (_) { /* Yahoo 실패 무시 */ }
    }
  }

  return results.slice(0, 15)
}

// ═══════════════════════════════════════════════════
// USD/KRW 환율
// ═══════════════════════════════════════════════════
async function getUsdKrw(): Promise<number> {
  const cached = getCached('usd_krw')
  if (cached) return cached as number
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { headers: { 'Accept': 'application/json' } })
    if (res.ok) {
      const j = await res.json() as { rates?: { KRW?: number } }
      const rate = j?.rates?.KRW
      if (rate && rate > 0) { setCache('usd_krw', rate); return rate }
    }
  } catch (_) {}
  try {
    const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW')
    if (res2.ok) {
      const j2 = await res2.json() as { rates?: { KRW?: number } }
      const rate2 = j2?.rates?.KRW
      if (rate2 && rate2 > 0) { setCache('usd_krw', rate2); return rate2 }
    }
  } catch (_) {}
  return 1380
}

// ═══════════════════════════════════════════════════
// Yahoo Finance 현재가 조회
// ═══════════════════════════════════════════════════
interface PriceData { price: number; currency: string; marketState: string; regularMarketPreviousClose: number; exchangeName: string }

// 거래소 이름을 Yahoo Finance 티커 접미사로 변환
// KOSPI → .KS, KOSDAQ → .KQ, 기타 → '' (미국 주식 등)
function getYhSuffix(market: string): string {
  const m = market.toUpperCase()
  if (m === 'KOSDAQ') return '.KQ'
  if (m === 'KOSPI' || m === 'KSE' || m === 'KR') return '.KS'
  return ''
}

// yhTicker: Yahoo Finance에서 사용하는 전체 티커 (예: '005930.KS', '078130.KQ', 'AAPL')
// 한국 종목은 .KS/.KQ 접미사가 포함된 상태로 전달해야 정확한 시세를 조회할 수 있음
async function fetchYahooPrice(yhTicker: string): Promise<PriceData | null> {
  const cacheKey = `price_${yhTicker}`
  const cached = getCached(cacheKey)
  if (cached) return cached as PriceData

  // Yahoo Finance v8 API 단일 호출
  const tryFetch = async (yt: string): Promise<PriceData | null> => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=1d&range=1d`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
      })
      if (!res.ok) return null
      const json = await res.json() as {
        chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string; marketState?: string; regularMarketPreviousClose?: number; chartPreviousClose?: number; exchangeName?: string } }>; error?: unknown }
      }
      const meta = json?.chart?.result?.[0]?.meta
      if (!meta) return null
      const price = meta.regularMarketPrice ?? 0
      if (price <= 0) return null
      return {
        price,
        currency: meta.currency ?? 'USD',
        marketState: meta.marketState ?? 'REGULAR',
        regularMarketPreviousClose: meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? price,
        // 거래소 코드: KSC=KOSPI(.KS), KOE=KOSDAQ(.KQ) — 아래 거래소 검증에 사용
        exchangeName: meta.exchangeName ?? ''
      }
    } catch (_) { return null }
  }

  let result: PriceData | null

  // 6자리 한국 종목: .KS/.KQ 동시 조회 후 거래소 코드(exchangeName)로 정확한 종목 선택
  // 이유: 동일한 6자리 코드가 KOSPI에 과거 상장됐던 종목과 겹치는 경우,
  //       .KS 단독 조회 시 폐지·이관된 종목의 잘못된 가격이 반환될 수 있음
  //       → .KS와 .KQ를 동시에 조회하고, exchangeName(KSC/KOE)으로 올바른 거래소 확인
  if (/^\d{6}\.(KS|KQ)$/i.test(yhTicker)) {
    const code = yhTicker.slice(0, 6)
    const [ksResult, kqResult] = await Promise.all([
      tryFetch(code + '.KS'),
      tryFetch(code + '.KQ')
    ])
    if (ksResult?.exchangeName === 'KSC') result = ksResult          // KOSPI 확인
    else if (kqResult?.exchangeName === 'KOE') result = kqResult     // KOSDAQ 확인
    else result = ksResult ?? kqResult ?? null                        // exchangeName 없을 때 유효한 데이터 사용
  } else {
    result = await tryFetch(yhTicker)
  }

  if (!result) return null

  const ttl = (['REGULAR', 'PRE', 'POST'].includes(result.marketState))
    ? 60 * 1000   // 장중: 1분 캐시
    : CACHE_TTL   // 장외: 15분 캐시
  _cache.set(cacheKey, { data: result, timestamp: Date.now() - (CACHE_TTL - ttl) })
  return result
}

// 입력된 티커 문자열을 파싱하여 Yahoo Finance / Upbit 조회에 필요한 정보를 반환
// yhTicker: Yahoo Finance API에 직접 사용하는 전체 티커 (거래소 접미사 포함)
// isCoin: 업비트 코인 티커 여부 (KRW-BTC, KRW-ETH 등)
function inferTicker(t: string): { ticker: string; isKorean: boolean; isCoin: boolean; yhTicker: string } {
  // 이미 거래소 접미사가 포함된 경우 (.KQ / .KS)
  if (/^\d{6}\.KQ$/i.test(t)) return { ticker: t.slice(0, 6), isKorean: true, isCoin: false, yhTicker: t.slice(0, 6) + '.KQ' }
  if (/^\d{6}\.KS$/i.test(t)) return { ticker: t.slice(0, 6), isKorean: true, isCoin: false, yhTicker: t.slice(0, 6) + '.KS' }
  // 접미사 없는 6자리 코드: 일단 .KS로 시도, 실패 시 fetchYahooPrice 내부에서 .KQ 폴백
  if (/^\d{6}$/.test(t)) return { ticker: t, isKorean: true, isCoin: false, yhTicker: t + '.KS' }
  // 업비트 코인 포맷: KRW-BTC, KRW-ETH 등 (대소문자 무관)
  if (/^KRW-[A-Z0-9]+$/i.test(t)) return { ticker: t.toUpperCase(), isKorean: false, isCoin: true, yhTicker: '' }
  return { ticker: t.toUpperCase(), isKorean: false, isCoin: false, yhTicker: t.toUpperCase() }
}

// ═══════════════════════════════════════════════════
// API 라우트
// ═══════════════════════════════════════════════════

// ── 종목 검색 (자동완성) ──────────────────────────
app.get('/api/search', async (c) => {
  const q = c.req.query('q') || ''
  if (q.length < 1) return c.json({ results: [] })
  // kv를 넘겨서 커스텀 매핑(수동 등록 종목)도 검색에 포함
  const results = await searchStocks(q, c.env.CUSTOM_TICKERS)
  return c.json({ results, query: q })
})

// ── 커스텀 티커 매핑 저장 ──────────────────────────
// 사용자가 영문 이름 종목(한성크린텍 등)을 코드로 찾아 한국어 이름을 등록합니다.
// 저장된 이름은 KV에 영구 보관되어 모든 사용자의 검색에 바로 반영됩니다.
app.post('/api/custom-ticker', async (c) => {
  const { koName, ticker } = await c.req.json() as { koName?: string; ticker?: string }
  if (!koName?.trim() || !ticker?.trim()) {
    return c.json({ error: '이름(koName)과 티커(ticker)가 필요합니다' }, 400)
  }
  try {
    // 기존 KV 맵을 불러와서 새 항목 추가 후 저장
    const existing = (await c.env.CUSTOM_TICKERS.get('ko_map', 'json') as Record<string, string>) || {}
    existing[koName.trim()] = ticker.trim()
    await c.env.CUSTOM_TICKERS.put('ko_map', JSON.stringify(existing))
    return c.json({ ok: true, koName: koName.trim(), ticker: ticker.trim() })
  } catch (e) {
    return c.json({ error: 'KV 저장 실패: ' + String(e) }, 500)
  }
})

// ── 커스텀 티커 전체 목록 조회 ──────────────────────
app.get('/api/custom-tickers', async (c) => {
  const map = await getCustomKoMap(c.env.CUSTOM_TICKERS)
  return c.json({ map })
})

// ── 단일 종목 현재가 ──────────────────────────────
app.get('/api/price', async (c) => {
  const raw = c.req.query('ticker')
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400)

  const { ticker, isKorean, isCoin, yhTicker } = inferTicker(raw)
  const kisEnv = c.env as unknown as KisEnv

  // 코인: 업비트 Public API 사용 (인증키 불필요)
  if (isCoin) {
    const coinData = await fetchUpbitPrice(ticker)
    if (!coinData) return c.json({ error: `${ticker} 코인 시세 조회 실패`, ticker }, 404)
    return c.json({
      ticker, name: coinData.name, originalTicker: raw, isKorean: false,
      priceUsd: null, priceKrw: coinData.price,
      changeRate: coinData.changeRate,
      currency: 'KRW', usdKrw: null,
      marketState: 'REGULAR', prevCloseKrw: null,
      source: 'upbit', updatedAt: new Date().toISOString(),
    })
  }

  // 국내 종목: KIS 우선 → Yahoo 폴백
  if (isKorean && isKisConfigured(kisEnv)) {
    const kisData = await fetchKisDomesticPrice(kisEnv, ticker)
    if (kisData) {
      return c.json({
        ticker, name: kisData.name, originalTicker: raw, isKorean,
        priceUsd: null, priceKrw: kisData.price,
        changeRate: kisData.changeRate,
        currency: 'KRW', usdKrw: null,
        marketState: 'REGULAR', prevCloseKrw: null,
        source: 'kis', updatedAt: new Date().toISOString(),
      })
    }
  }

  // 미국 주식 또는 KIS 조회 실패 시 Yahoo 폴백
  const [priceData, usdKrw] = await Promise.all([
    fetchYahooPrice(yhTicker),
    isKorean ? Promise.resolve(1) : getUsdKrw()
  ])
  if (!priceData) return c.json({ error: `${ticker} 가격 조회 실패`, ticker }, 404)

  const priceKrw = isKorean ? priceData.price : Math.round(priceData.price * usdKrw)
  // 전일 대비 등락률 계산 (전일 종가 기준)
  const changeRate = priceData.regularMarketPreviousClose > 0
    ? parseFloat(((priceData.price - priceData.regularMarketPreviousClose) / priceData.regularMarketPreviousClose * 100).toFixed(2))
    : 0
  return c.json({
    ticker, name: ticker, originalTicker: raw, isKorean,
    priceUsd: isKorean ? null : priceData.price,
    priceKrw, changeRate,
    currency: priceData.currency,
    usdKrw: isKorean ? null : usdKrw,
    marketState: priceData.marketState,
    prevCloseKrw: isKorean ? priceData.regularMarketPreviousClose : Math.round(priceData.regularMarketPreviousClose * usdKrw),
    source: 'yahoo', updatedAt: new Date().toISOString()
  })
})

// ── 다중 종목 현재가 ──────────────────────────────
app.get('/api/prices', async (c) => {
  const raw = c.req.query('tickers')
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400)
  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (rawList.length > 30) return c.json({ error: '최대 30개까지 가능합니다' }, 400)

  const kisEnv = c.env as unknown as KisEnv
  const usdKrw = await getUsdKrw()

  const results = await Promise.all(rawList.map(async (raw) => {
    const { ticker, isKorean, isCoin, yhTicker } = inferTicker(raw)

    // 코인: 업비트 Public API 사용
    if (isCoin) {
      const coinData = await fetchUpbitPrice(ticker)
      if (!coinData) return { ticker, originalTicker: raw, isKorean: false, isCoin: true, error: '조회 실패', priceKrw: null, changeRate: 0 }
      return {
        ticker, name: coinData.name, originalTicker: raw, isKorean: false,
        priceUsd: null, priceKrw: coinData.price,
        changeRate: coinData.changeRate,
        currency: 'KRW', usdKrw: null,
        marketState: 'REGULAR', prevCloseKrw: null, source: 'upbit',
      }
    }

    // 국내 종목: KIS 우선 → Yahoo 폴백
    if (isKorean && isKisConfigured(kisEnv)) {
      const kisData = await fetchKisDomesticPrice(kisEnv, ticker)
      if (kisData) {
        return {
          ticker, name: kisData.name, originalTicker: raw, isKorean,
          priceUsd: null, priceKrw: kisData.price,
          changeRate: kisData.changeRate,
          currency: 'KRW', usdKrw: null,
          marketState: 'REGULAR', prevCloseKrw: null, source: 'kis',
        }
      }
    }

    // 미국 주식 또는 KIS 실패 시 Yahoo 폴백
    const pd = await fetchYahooPrice(yhTicker)
    if (!pd) return { ticker, originalTicker: raw, isKorean, error: '조회 실패', priceKrw: null, changeRate: 0 }
    const priceKrw = isKorean ? pd.price : Math.round(pd.price * usdKrw)
    const changeRate = pd.regularMarketPreviousClose > 0
      ? parseFloat(((pd.price - pd.regularMarketPreviousClose) / pd.regularMarketPreviousClose * 100).toFixed(2))
      : 0
    return {
      ticker, name: ticker, originalTicker: raw, isKorean,
      priceUsd: isKorean ? null : pd.price,
      priceKrw, changeRate,
      currency: pd.currency,
      usdKrw: isKorean ? null : usdKrw,
      marketState: pd.marketState,
      prevCloseKrw: isKorean ? pd.regularMarketPreviousClose : Math.round(pd.regularMarketPreviousClose * usdKrw),
      source: 'yahoo',
    }
  }))
  return c.json({ results, usdKrw, totalKrw: results.reduce((s, r) => s + (r.priceKrw ?? 0), 0), count: results.length, updatedAt: new Date().toISOString() })
})

// ── 포트폴리오 총자산 ─────────────────────────────
app.post('/api/portfolio', async (c) => {
  let body: { holdings?: Array<{ name?: string; ticker?: string; avgPriceKrw?: number; qty?: number }> }
  try { body = await c.req.json() } catch (_) { return c.json({ error: '잘못된 JSON' }, 400) }
  const holdings = body?.holdings
  if (!Array.isArray(holdings) || holdings.length === 0) return c.json({ error: 'holdings 배열 필요' }, 400)

  const usdKrw = await getUsdKrw()
  const details = await Promise.all(holdings.map(async (h) => {
    if (!h.ticker) return { name: h.name ?? '?', ticker: null, avgPriceKrw: h.avgPriceKrw ?? 0, curPriceKrw: null, qty: h.qty ?? 0, totalKrw: null, profitPct: null, error: 'ticker 없음' }
    const { ticker, isKorean, yhTicker } = inferTicker(h.ticker)
    const pd = await fetchYahooPrice(yhTicker)
    if (!pd) return { name: h.name ?? ticker, ticker, avgPriceKrw: h.avgPriceKrw ?? 0, curPriceKrw: null, qty: h.qty ?? 0, totalKrw: null, profitPct: null, error: '가격 조회 실패' }
    const curPriceKrw = isKorean ? pd.price : Math.round(pd.price * usdKrw)
    const qty = h.qty ?? 0
    const totalKrw  = curPriceKrw * qty
    const investKrw = (h.avgPriceKrw ?? 0) * qty
    // calculateProfitAndLoss() — financeSkills.ts 에서 계산 (원칙 1 준수)
    const { profitPct } = calculateProfitAndLoss(curPriceKrw, h.avgPriceKrw ?? 0, qty)
    return { name: h.name ?? ticker, ticker, avgPriceKrw: h.avgPriceKrw ?? 0, curPriceKrw, qty, totalKrw, profitPct, currency: pd.currency, marketState: pd.marketState, usdKrw: isKorean ? null : usdKrw }
  }))
  const totalPortfolioKrw = details.reduce((s, d) => s + (d.totalKrw ?? 0), 0)
  const totalInvestKrw    = details.reduce((s, d) => s + ((d.avgPriceKrw ?? 0) * (d.qty ?? 0)), 0)
  const totalProfitKrw    = totalPortfolioKrw - totalInvestKrw
  return c.json({
    holdings: details,
    summary: { totalPortfolioKrw, totalInvestKrw, totalProfitKrw, totalProfitPct: totalInvestKrw > 0 ? parseFloat((totalProfitKrw / totalInvestKrw * 100).toFixed(2)) : 0, usdKrw },
    updatedAt: new Date().toISOString()
  })
})

// ── 환율 ──────────────────────────────────────────
app.get('/api/exchange-rate', async (c) => {
  const rate = await getUsdKrw()
  return c.json({ usdKrw: rate, updatedAt: new Date().toISOString() })
})

// ── 10개월 월봉 종가 + SMA10 ──────────────────────
// 캐시 TTL: 1시간 (월봉 데이터는 자주 변하지 않음)
const CACHE_TTL_MA10 = 60 * 60 * 1000

interface Ma10Result {
  ticker: string
  monthlyCloses: Array<{ date: string; close: number }>
  ma10: number | null
  smaPrev: number | null
  currentMonthClose: number | null
  marketState: string
  signal: 'bull' | 'bear' | null
  exchangeName?: string  // 거래소 검증용 (KSC=KOSPI, KOE=KOSDAQ), 클라이언트에 노출 안 됨
}

async function fetchMa10Data(yhTicker: string): Promise<Ma10Result | null> {
  const cacheKey = `ma10_${yhTicker}`
  const cached = getCached(cacheKey, CACHE_TTL_MA10)
  if (cached) return cached as Ma10Result

  // 한국 종목 여부: .KS 또는 .KQ 접미사로 판단
  const isKrTicker = /\.(KS|KQ)$/i.test(yhTicker)

  const tryFetchMa10 = async (yt: string): Promise<Ma10Result | null> => {
    try {
    // Yahoo Finance v8 chart API - 2년치 월봉 데이터
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=1mo&range=2y`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    })
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: { regularMarketPrice?: number; currency?: string; marketState?: string; exchangeName?: string }
          timestamp?: number[]
          indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> }
        }>
        error?: unknown
      }
    }

    const result = json?.chart?.result?.[0]
    if (!result) return null

    const meta = result.meta
    const timestamps = result.timestamp || []
    // adjclose가 있으면 우선 사용, 없으면 quote.close
    const closes = result.indicators?.adjclose?.[0]?.adjclose
      ?? result.indicators?.quote?.[0]?.close
      ?? []

    if (timestamps.length === 0 || closes.length === 0) return null

    // 유효한 종가만 추출
    const pairs: Array<{ date: string; close: number }> = []
    for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
      const cl = closes[i]
      if (cl == null || cl <= 0) continue
      const d = new Date(timestamps[i] * 1000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      pairs.push({ date: dateStr, close: isKrTicker ? Math.round(cl) : parseFloat(cl.toFixed(2)) })
    }

    if (pairs.length === 0) return null

    // 최근 10개월 SMA (이번 달 기준)
    const last10 = pairs.slice(-10)
    const ma10 = last10.length === 10
      ? parseFloat((last10.reduce((s, p) => s + p.close, 0) / 10).toFixed(isKrTicker ? 0 : 2))
      : null

    // 지난달 기준 SMA10 (기울기 계산용)
    const prev10 = pairs.slice(-11, -1)
    const smaPrev = prev10.length === 10
      ? parseFloat((prev10.reduce((s, p) => s + p.close, 0) / 10).toFixed(isKrTicker ? 0 : 2))
      : null

    // 이번 달 말일 종가 = 가장 마지막 월봉 종가
    const currentMonthClose = pairs[pairs.length - 1]?.close ?? null
    const marketState = meta?.marketState ?? 'CLOSED'
    const signal: 'bull' | 'bear' | null =
      ma10 != null && currentMonthClose != null
        ? (currentMonthClose > ma10 ? 'bull' : 'bear')
        : null

    const ma10Result: Ma10Result = {
      ticker: yhTicker,
      monthlyCloses: pairs.slice(-13), // 최근 13개월 반환 (차트용)
      ma10,
      smaPrev,
      currentMonthClose,
      marketState,
      signal,
      exchangeName: meta?.exchangeName ?? ''  // 거래소 검증용
    }
    return ma10Result
    } catch (_) { return null }
  }

  let result: Ma10Result | null

  // 6자리 한국 종목: .KS/.KQ 동시 조회 후 거래소 코드로 정확한 종목 선택 (현재가 API와 동일 로직)
  if (/^\d{6}\.(KS|KQ)$/i.test(yhTicker)) {
    const code = yhTicker.slice(0, 6)
    const [ksResult, kqResult] = await Promise.all([
      tryFetchMa10(code + '.KS'),
      tryFetchMa10(code + '.KQ')
    ])
    if (ksResult?.exchangeName === 'KSC') result = ksResult
    else if (kqResult?.exchangeName === 'KOE') result = kqResult
    else result = ksResult ?? kqResult ?? null
  } else {
    result = await tryFetchMa10(yhTicker)
  }

  if (!result) return null
  setCache(cacheKey, result)
  return result
}

// ── 10이평선 데이터 API ───────────────────────────
app.get('/api/ma10', async (c) => {
  const raw = c.req.query('ticker')
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400)

  const { ticker, isKorean, isCoin, yhTicker } = inferTicker(raw)
  const kisEnv = c.env as unknown as KisEnv

  // 코인: 업비트 월봉 데이터로 10이평선 계산
  if (isCoin) {
    const cacheKey = `coin_ma10_${ticker}`
    const cached = getCached(cacheKey, CACHE_TTL_MA10)
    if (cached) return c.json(cached)

    const bars = await fetchUpbitMonthlyCandles(ticker, 13)
    if (bars.length < 10) return c.json({ error: `${ticker} 코인 월봉 데이터 부족 (최소 10개월 필요)`, ticker }, 404)

    const { ma10, smaPrev, currentMonthClose, signal } = calcCoinMa10(bars)
    const coinMa10Result = {
      ticker, ma10, smaPrev, currentMonthClose, signal,
      monthlyCloses: bars.slice(-13),
      usdKrw: null, source: 'upbit', updatedAt: new Date().toISOString(),
    }
    setCache(cacheKey, coinMa10Result)
    return c.json(coinMa10Result)
  }

  // 국내 종목: KIS 월봉 우선 → Yahoo 폴백
  if (isKorean && isKisConfigured(kisEnv)) {
    const bars = await fetchKisDomesticMonthly(kisEnv, ticker)
    if (bars.length >= 10) {
      // calculate10SMA / calculateSMAPrev — financeSkills.ts (수정주가 배열 기반)
      const closes  = bars.map(b => b.close)
      const ma10Raw = calculate10SMA(closes)
      const smaRaw  = calculateSMAPrev(closes)
      const ma10    = ma10Raw != null ? Math.round(ma10Raw) : null
      const smaPrev = smaRaw  != null ? Math.round(smaRaw)  : null
      const currentMonthClose = bars[bars.length - 1]?.close ?? null
      const signal = ma10 != null && currentMonthClose != null
        ? (currentMonthClose > ma10 ? 'bull' : 'bear') : null
      const monthlyCloses = bars.slice(-13).map(b => ({ date: b.date, close: b.close }))
      return c.json({
        ticker, ma10, smaPrev, currentMonthClose, signal,
        monthlyCloses, usdKrw: null,
        source: 'kis', updatedAt: new Date().toISOString(),
      })
    }
  }

  // 미국 주식 또는 KIS 실패 시 Yahoo 폴백 (USD→KRW 환산 필요)
  const [data, usdKrw] = await Promise.all([
    fetchMa10Data(yhTicker),
    isKorean ? Promise.resolve(1) : getUsdKrw()
  ])
  if (!data) return c.json({ error: `${ticker} 10이평선 데이터 조회 실패`, ticker }, 404)

  const result = isKorean ? data : {
    ...data,
    ma10: data.ma10 != null ? Math.round(data.ma10 * usdKrw) : null,
    smaPrev: data.smaPrev != null ? Math.round(data.smaPrev * usdKrw) : null,
    currentMonthClose: data.currentMonthClose != null ? Math.round(data.currentMonthClose * usdKrw) : null,
  }
  return c.json({ ...result, usdKrw: isKorean ? null : usdKrw, source: 'yahoo', updatedAt: new Date().toISOString() })
})

// ── 다중 10이평선 데이터 API ─────────────────────
app.get('/api/ma10s', async (c) => {
  const raw = c.req.query('tickers')
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400)
  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (rawList.length > 30) return c.json({ error: '최대 30개까지 가능합니다' }, 400)

  const kisEnv = c.env as unknown as KisEnv
  const usdKrw = await getUsdKrw()

  const results = await Promise.all(rawList.map(async (r) => {
    const { ticker, isKorean, isCoin, yhTicker } = inferTicker(r)

    // 코인: 업비트 월봉 데이터로 10이평선 계산
    if (isCoin) {
      const cacheKey = `coin_ma10_${ticker}`
      const cached = getCached(cacheKey, CACHE_TTL_MA10)
      if (cached) return { ...(cached as object), originalTicker: r }

      const bars = await fetchUpbitMonthlyCandles(ticker, 13)
      if (bars.length < 10) return { ticker, originalTicker: r, error: '데이터 부족', ma10: null, currentMonthClose: null, signal: null }

      const { ma10, smaPrev, currentMonthClose, signal } = calcCoinMa10(bars)
      const coinResult = { ticker, originalTicker: r, ma10, smaPrev, currentMonthClose, signal, monthlyCloses: bars.slice(-13), usdKrw: null, source: 'upbit' }
      setCache(cacheKey, coinResult)
      return coinResult
    }

    // 국내 종목: KIS 월봉 우선 → Yahoo 폴백
    if (isKorean && isKisConfigured(kisEnv)) {
      const bars = await fetchKisDomesticMonthly(kisEnv, ticker)
      if (bars.length >= 10) {
        const closes  = bars.map(b => b.close)
        const ma10Raw = calculate10SMA(closes)
        const smaRaw  = calculateSMAPrev(closes)
        const ma10    = ma10Raw != null ? Math.round(ma10Raw) : null
        const smaPrev = smaRaw  != null ? Math.round(smaRaw)  : null
        const currentMonthClose = bars[bars.length - 1]?.close ?? null
        const signal = ma10 != null && currentMonthClose != null
          ? (currentMonthClose > ma10 ? 'bull' : 'bear') : null
        const monthlyCloses = bars.slice(-13).map(b => ({ date: b.date, close: b.close }))
        return { ticker, originalTicker: r, ma10, smaPrev, currentMonthClose, signal, monthlyCloses, usdKrw: null, source: 'kis' }
      }
    }

    // 미국 주식 또는 KIS 실패 시 Yahoo 폴백
    const data = await fetchMa10Data(yhTicker)
    if (!data) return { ticker, originalTicker: r, error: '조회 실패', ma10: null, currentMonthClose: null, signal: null }
    if (isKorean) return { ...data, originalTicker: r, source: 'yahoo' }
    return {
      ...data,
      originalTicker: r,
      ma10: data.ma10 != null ? Math.round(data.ma10 * usdKrw) : null,
      smaPrev: data.smaPrev != null ? Math.round(data.smaPrev * usdKrw) : null,
      currentMonthClose: data.currentMonthClose != null ? Math.round(data.currentMonthClose * usdKrw) : null,
      usdKrw, source: 'yahoo',
    }
  }))

  return c.json({ results, count: results.length, updatedAt: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════
// 주봉 이동평균선 (MA10_W / MA40_W) — 5단계 국면 판단 중 골든크로스 검증에 사용
// MA10_W: 최근 10주 종가 평균 / MA40_W: 최근 40주 종가 평균 (≈10개월)
// ═══════════════════════════════════════════════════
const CACHE_TTL_MA10W = 60 * 60 * 1000  // 1시간 캐시

interface Ma10WeeklyResult {
  ticker: string
  ma10w: number | null         // 주봉 10주 이동평균
  ma10wPrev: number | null     // 전주 기준 10주 이평 (기울기 계산용)
  ma20w: number | null         // 주봉 20주 이동평균 (정배열 검증용)
  ma40w: number | null         // 주봉 40주 이동평균
  latestClose: number | null   // 가장 최근 주봉 종가 (현재가 근사치)
  volumeW?: number | null      // 이번 주 거래량 (가장 최근 주봉)
  volumeWAvg10?: number | null // 최근 10주 평균 거래량
  exchangeName?: string        // 거래소 검증용 (내부 사용)
}

async function fetchMaWeeklyData(yhTicker: string): Promise<Ma10WeeklyResult | null> {
  const cacheKey = `ma10w_${yhTicker}`
  const cached = getCached(cacheKey, CACHE_TTL_MA10W)
  if (cached) return cached as Ma10WeeklyResult

  const isKrTicker = /\.(KS|KQ)$/i.test(yhTicker)

  // 주봉 2년치 조회 — MA40(40주) 계산에 최소 40개 필요
  const tryFetch = async (yt: string): Promise<Ma10WeeklyResult | null> => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=1wk&range=2y`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
      })
      if (!res.ok) return null

      const json = await res.json() as {
        chart?: { result?: Array<{
          meta?: { exchangeName?: string }
          timestamp?: number[]
          indicators?: {
            adjclose?: Array<{ adjclose?: number[] }>
            quote?: Array<{ close?: number[]; volume?: number[] }>
          }
        }>; error?: unknown }
      }
      const result = json?.chart?.result?.[0]
      if (!result) return null

      const quotes    = result.indicators?.quote?.[0]
      const rawCloses = result.indicators?.adjclose?.[0]?.adjclose ?? quotes?.close ?? []
      const rawVols   = quotes?.volume ?? []

      // closes와 volumes를 동일 인덱스로 함께 수집 (유효한 종가 기준 정렬)
      const closes:  number[] = []
      const volumes: number[] = []
      for (let i = 0; i < rawCloses.length; i++) {
        const cl = rawCloses[i]
        if (cl != null && cl > 0) {
          closes.push(isKrTicker ? Math.round(cl) : parseFloat(cl.toFixed(2)))
          const vol = rawVols[i]
          volumes.push(vol != null && vol > 0 ? Math.round(vol) : 0)
        }
      }
      if (closes.length < 10) return null

      // 최근 10주 평균 (MA10_W)
      const last10 = closes.slice(-10)
      const ma10w = parseFloat((last10.reduce((s, v) => s + v, 0) / 10).toFixed(isKrTicker ? 0 : 2))

      // 전주 기준 10주 이평 (기울기 계산용)
      let ma10wPrev: number | null = null
      if (closes.length >= 11) {
        const prev10 = closes.slice(-11, -1)
        ma10wPrev = parseFloat((prev10.reduce((s, v) => s + v, 0) / 10).toFixed(isKrTicker ? 0 : 2))
      }

      // 최근 20주 이평 (정배열 검증용)
      let ma20w: number | null = null
      if (closes.length >= 20) {
        const last20 = closes.slice(-20)
        ma20w = parseFloat((last20.reduce((s, v) => s + v, 0) / 20).toFixed(isKrTicker ? 0 : 2))
      }

      // 최근 40주 평균 (MA40_W) — 데이터가 충분할 때만
      let ma40w: number | null = null
      if (closes.length >= 40) {
        const last40 = closes.slice(-40)
        ma40w = parseFloat((last40.reduce((s, v) => s + v, 0) / 40).toFixed(isKrTicker ? 0 : 2))
      }

      // 가장 최근 주봉 종가 (현재가 근사치)
      const latestClose = closes.length > 0 ? closes[closes.length - 1] : null

      // 거래량 스파이크 계산: 유효 거래량(>0)만 사용
      const validVols = volumes.filter(v => v > 0)
      const volumeW      = validVols.length > 0 ? validVols[validVols.length - 1] : null  // 이번 주
      let volumeWAvg10: number | null = null
      if (validVols.length >= 10) {
        const last10v = validVols.slice(-10)
        volumeWAvg10 = Math.round(last10v.reduce((s, v) => s + v, 0) / 10)
      }

      return { ticker: yt, ma10w, ma10wPrev, ma20w, ma40w, latestClose, volumeW, volumeWAvg10, exchangeName: result.meta?.exchangeName ?? '' }
    } catch (_) { return null }
  }

  let result: Ma10WeeklyResult | null

  // 6자리 한국 종목: exchangeName 검증으로 정확한 거래소 선택 (현재가 API와 동일 로직)
  if (/^\d{6}\.(KS|KQ)$/i.test(yhTicker)) {
    const code = yhTicker.slice(0, 6)
    const [ksResult, kqResult] = await Promise.all([
      tryFetch(code + '.KS'),
      tryFetch(code + '.KQ')
    ])
    if (ksResult?.exchangeName === 'KSC') result = ksResult
    else if (kqResult?.exchangeName === 'KOE') result = kqResult
    else result = ksResult ?? kqResult ?? null
  } else {
    result = await tryFetch(yhTicker)
  }

  if (!result) return null
  setCache(cacheKey, result)
  return result
}

// ── 다중 주봉 이동평균선 API ──────────────────────
app.get('/api/ma10ws', async (c) => {
  const raw = c.req.query('tickers')
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400)
  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (rawList.length > 30) return c.json({ error: '최대 30개까지 가능합니다' }, 400)

  const usdKrw = await getUsdKrw()

  const results = await Promise.all(rawList.map(async (r) => {
    const { ticker, isKorean, yhTicker } = inferTicker(r)
    const data = await fetchMaWeeklyData(yhTicker)
    if (!data) return { ticker, originalTicker: r, error: '조회 실패', ma10w: null, ma40w: null, volumeW: null, volumeWAvg10: null }
    // 미국 주식: 가격(MA)은 USD→KRW 환산, 거래량은 주 수이므로 환산 불필요
    if (!isKorean) {
      return {
        ticker, originalTicker: r,
        ma10w: data.ma10w != null ? Math.round(data.ma10w * usdKrw) : null,
        ma40w: data.ma40w != null ? Math.round(data.ma40w * usdKrw) : null,
        volumeW: data.volumeW ?? null,
        volumeWAvg10: data.volumeWAvg10 ?? null,
      }
    }
    return { ticker, originalTicker: r, ma10w: data.ma10w, ma40w: data.ma40w, volumeW: data.volumeW ?? null, volumeWAvg10: data.volumeWAvg10 ?? null }
  }))

  return c.json({ results, count: results.length, updatedAt: new Date().toISOString() })
})

// ── OHLCV 캔들 데이터 조회 (캔들스틱 차트용) ─────────
// interval: 1d=일봉, 1wk=주봉, 1mo=월봉, 3mo=분기봉
interface CandleBar { time: string; open: number; high: number; low: number; close: number; volume?: number }

async function fetchOhlcData(yhTicker: string, interval: string): Promise<CandleBar[] | null> {
  const validIntervals = ['1d', '1wk', '1mo', '3mo']
  if (!validIntervals.includes(interval)) interval = '1mo'

  const rangeMap: Record<string, string> = { '1d': '6mo', '1wk': '2y', '1mo': '3y', '3mo': '5y' }
  const ttlMap:   Record<string, number>  = { '1d': 3*60*1000, '1wk': 30*60*1000, '1mo': CACHE_TTL_MA10, '3mo': CACHE_TTL_MA10 }

  const cacheKey = `ohlc_${yhTicker}_${interval}`
  const cached = getCached(cacheKey, ttlMap[interval] ?? CACHE_TTL)
  if (cached) return cached as CandleBar[]

  // 한국 종목 여부: .KS 또는 .KQ 접미사로 판단
  const isKrTicker = /\.(KS|KQ)$/i.test(yhTicker)

  const tryFetchOhlc = async (yt: string): Promise<CandleBar[] | null> => {
    try {
    const range = rangeMap[interval]
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yt)}?interval=${interval}&range=${range}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
    })
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: { result?: Array<{
        timestamp?: number[]
        indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }> }
      }>; error?: unknown }
    }
    const result = json?.chart?.result?.[0]
    if (!result) return null

    const timestamps = result.timestamp || []
    const quote      = result.indicators?.quote?.[0]
    if (!quote || timestamps.length === 0) return null

    const round = (v: number) => isKrTicker ? Math.round(v) : parseFloat(v.toFixed(2))
    const candles: CandleBar[] = []

    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i], h = quote.high?.[i], l = quote.low?.[i], c = quote.close?.[i]
      if (o == null || h == null || l == null || c == null || o <= 0 || h <= 0 || l <= 0 || c <= 0) continue
      const d = new Date(timestamps[i] * 1000)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const vol = quote.volume?.[i]
      candles.push({ time: dateStr, open: round(o), high: round(h), low: round(l), close: round(c), volume: (vol != null && vol > 0) ? vol : undefined })
    }

    if (candles.length === 0) return null
    return candles
    } catch (_) { return null }
  }

  let candles = await tryFetchOhlc(yhTicker)

  // .KS로 조회 실패 시 .KQ(KOSDAQ)로 재시도
  if (!candles && yhTicker.toUpperCase().endsWith('.KS')) {
    candles = await tryFetchOhlc(yhTicker.slice(0, -3) + '.KQ')
  }

  if (!candles) return null
  setCache(cacheKey, candles)
  return candles
}

app.get('/api/chart', async (c) => {
  const raw      = c.req.query('ticker')
  const interval = c.req.query('interval') || '1mo'
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400)

  const { ticker, yhTicker } = inferTicker(raw)
  const candles = await fetchOhlcData(yhTicker, interval)
  if (!candles) return c.json({ error: '차트 데이터 조회 실패', ticker }, 404)

  return c.json({ ticker, interval, candles, count: candles.length, updatedAt: new Date().toISOString() })
})

// ═══════════════════════════════════════════════════
// 레이더 - 관심종목 유니버스 & 10이평선 감시
// ═══════════════════════════════════════════════════

// S&P500 상위 100 종목 (시가총액 기준 정적 목록, 분기마다 수동 갱신)
const SP500_TOP100: Array<{ rank: number; name: string; ticker: string }> = [
  { rank:1,   name:'Apple',            ticker:'AAPL'  }, { rank:2,   name:'Microsoft',       ticker:'MSFT'  },
  { rank:3,   name:'NVIDIA',           ticker:'NVDA'  }, { rank:4,   name:'Amazon',           ticker:'AMZN'  },
  { rank:5,   name:'Alphabet (A)',     ticker:'GOOGL' }, { rank:6,   name:'Meta Platforms',   ticker:'META'  },
  { rank:7,   name:'Tesla',            ticker:'TSLA'  }, { rank:8,   name:'Broadcom',         ticker:'AVGO'  },
  { rank:9,   name:'Berkshire B',      ticker:'BRK-B' }, { rank:10,  name:'JPMorgan Chase',   ticker:'JPM'   },
  { rank:11,  name:'Eli Lilly',        ticker:'LLY'   }, { rank:12,  name:'Visa',             ticker:'V'     },
  { rank:13,  name:'ExxonMobil',       ticker:'XOM'   }, { rank:14,  name:'UnitedHealth',     ticker:'UNH'   },
  { rank:15,  name:'Mastercard',       ticker:'MA'    }, { rank:16,  name:'Costco',           ticker:'COST'  },
  { rank:17,  name:'Home Depot',       ticker:'HD'    }, { rank:18,  name:'Procter & Gamble', ticker:'PG'    },
  { rank:19,  name:'Johnson & Johnson',ticker:'JNJ'   }, { rank:20,  name:'Netflix',          ticker:'NFLX'  },
  { rank:21,  name:'Bank of America',  ticker:'BAC'   }, { rank:22,  name:'Merck',            ticker:'MRK'   },
  { rank:23,  name:'AbbVie',          ticker:'ABBV'  }, { rank:24,  name:'Chevron',          ticker:'CVX'   },
  { rank:25,  name:'Oracle',           ticker:'ORCL'  }, { rank:26,  name:'Salesforce',       ticker:'CRM'   },
  { rank:27,  name:'Coca-Cola',        ticker:'KO'    }, { rank:28,  name:'PepsiCo',          ticker:'PEP'   },
  { rank:29,  name:'AMD',              ticker:'AMD'   }, { rank:30,  name:'McDonald\'s',      ticker:'MCD'   },
  { rank:31,  name:'Cisco',            ticker:'CSCO'  }, { rank:32,  name:'Goldman Sachs',    ticker:'GS'    },
  { rank:33,  name:'Intuitive Surg.',  ticker:'ISRG'  }, { rank:34,  name:'Qualcomm',         ticker:'QCOM'  },
  { rank:35,  name:'T-Mobile',         ticker:'TMUS'  }, { rank:36,  name:'Morgan Stanley',   ticker:'MS'    },
  { rank:37,  name:'Intuit',           ticker:'INTU'  }, { rank:38,  name:'IBM',              ticker:'IBM'   },
  { rank:39,  name:'Texas Instruments',ticker:'TXN'   }, { rank:40,  name:'GE Aerospace',     ticker:'GE'    },
  { rank:41,  name:'Uber',             ticker:'UBER'  }, { rank:42,  name:'Applied Materials',ticker:'AMAT'  },
  { rank:43,  name:'Palo Alto Nets.',  ticker:'PANW'  }, { rank:44,  name:'Analog Devices',   ticker:'ADI'   },
  { rank:45,  name:'ServiceNow',       ticker:'NOW'   }, { rank:46,  name:'Caterpillar',      ticker:'CAT'   },
  { rank:47,  name:'Amgen',            ticker:'AMGN'  }, { rank:48,  name:'Philip Morris',    ticker:'PM'    },
  { rank:49,  name:'BlackRock',        ticker:'BLK'   }, { rank:50,  name:'RTX (Raytheon)',   ticker:'RTX'   },
  { rank:51,  name:'S&P Global',       ticker:'SPGI'  }, { rank:52,  name:'AmEx',             ticker:'AXP'   },
  { rank:53,  name:'Lam Research',     ticker:'LRCX'  }, { rank:54,  name:'Honeywell',        ticker:'HON'   },
  { rank:55,  name:'NextEra Energy',   ticker:'NEE'   }, { rank:56,  name:'Pfizer',           ticker:'PFE'   },
  { rank:57,  name:'Palantir',         ticker:'PLTR'  }, { rank:58,  name:'Deere & Co.',      ticker:'DE'    },
  { rank:59,  name:'KLA Corp.',        ticker:'KLAC'  }, { rank:60,  name:'Lockheed Martin',  ticker:'LMT'   },
  { rank:61,  name:'Chipotle',         ticker:'CMG'   }, { rank:62,  name:'Booking Holdings', ticker:'BKNG'  },
  { rank:63,  name:'Regeneron',        ticker:'REGN'  }, { rank:64,  name:'Snowflake',        ticker:'SNOW'  },
  { rank:65,  name:'Airbnb',           ticker:'ABNB'  }, { rank:66,  name:'CrowdStrike',      ticker:'CRWD'  },
  { rank:67,  name:'Datadog',          ticker:'DDOG'  }, { rank:68,  name:'Cloudflare',       ticker:'NET'   },
  { rank:69,  name:'Coinbase',         ticker:'COIN'  }, { rank:70,  name:'ARM Holdings',     ticker:'ARM'   },
  { rank:71,  name:'Walt Disney',      ticker:'DIS'   }, { rank:72,  name:'Walmart',          ticker:'WMT'   },
  { rank:73,  name:'Nike',             ticker:'NKE'   }, { rank:74,  name:'Shopify',          ticker:'SHOP'  },
  { rank:75,  name:'Micron',           ticker:'MU'    }, { rank:76,  name:'Starbucks',        ticker:'SBUX'  },
  { rank:77,  name:'Intel',            ticker:'INTC'  }, { rank:78,  name:'3M',               ticker:'MMM'   },
  { rank:79,  name:'PayPal',           ticker:'PYPL'  }, { rank:80,  name:'Block (SQ)',        ticker:'SQ'    },
  { rank:81,  name:'DoorDash',         ticker:'DASH'  }, { rank:82,  name:'Spotify',          ticker:'SPOT'  },
  { rank:83,  name:'Zoom Video',       ticker:'ZM'    }, { rank:84,  name:'Snap',             ticker:'SNAP'  },
  { rank:85,  name:'Pinterest',        ticker:'PINS'  }, { rank:86,  name:'Rivian',           ticker:'RIVN'  },
  { rank:87,  name:'Lucid Group',      ticker:'LCID'  }, { rank:88,  name:'NIO',              ticker:'NIO'   },
  { rank:89,  name:'Alibaba',          ticker:'BABA'  }, { rank:90,  name:'Baidu',            ticker:'BIDU'  },
  { rank:91,  name:'JD.com',           ticker:'JD'    }, { rank:92,  name:'PDD Holdings',     ticker:'PDD'   },
  { rank:93,  name:'Robinhood',        ticker:'HOOD'  }, { rank:94,  name:'GitLab',           ticker:'GTLB'  },
  { rank:95,  name:'MongoDB',          ticker:'MDB'   }, { rank:96,  name:'Okta',             ticker:'OKTA'  },
  { rank:97,  name:'Twilio',           ticker:'TWLO'  }, { rank:98,  name:'HubSpot',          ticker:'HUBS'  },
  { rank:99,  name:'Workday',          ticker:'WDAY'  }, { rank:100, name:'Coupang',          ticker:'CPNG'  },
]

const RADAR_WATCHLIST_KV_KEY = 'radar_watchlist'
const CACHE_TTL_UNIVERSE = 60 * 60 * 1000  // 1시간 (거래대금 순위)

interface RadarWatchItem { name: string; ticker: string; market: string }

async function getRadarWatchlist(kv: KVNamespace): Promise<RadarWatchItem[]> {
  try {
    const data = await kv.get(RADAR_WATCHLIST_KV_KEY, 'json') as RadarWatchItem[] | null
    return Array.isArray(data) ? data : []
  } catch (_) { return [] }
}

// ── 레이더 유니버스 조회 ──────────────────────────
// type=kr : KIS 거래대금 상위 100 (KIS 미설정 시 KRX_FALLBACK 반환)
// type=us : S&P500 Top 100 정적 목록
app.get('/api/radar/universe', async (c) => {
  const type = c.req.query('type') || 'kr'

  if (type === 'us') {
    return c.json({ type: 'us', items: SP500_TOP100, count: SP500_TOP100.length, static: true })
  }

  // KR: KIS 거래대금 순위
  const kisEnv = c.env as unknown as KisEnv
  const cacheKey = 'radar_universe_kr'
  const cached = getCached(cacheKey, CACHE_TTL_UNIVERSE)
  if (cached) return c.json(cached)

  if (!isKisConfigured(kisEnv)) {
    // KIS 미설정 → KRX_FALLBACK 전체 (100개)
    const items = KRX_FALLBACK.map((s, i) => ({
      rank: i + 1, name: s.name, ticker: s.ticker, price: 0, changeRate: 0, tradeAmount: 0,
    }))
    return c.json({ type: 'kr', items, count: items.length, source: 'fallback_kis_not_configured' })
  }

  // KIS 거래대금 상위 50 조회
  const kisItems = await fetchKisVolumeRank(kisEnv, 50)

  // KIS 결과를 기반으로 하되, 부족하면 KRX_FALLBACK으로 100개까지 보충
  const kisTickerSet = new Set(kisItems.map(i => i.ticker))
  const supplementItems = KRX_FALLBACK
    .filter(s => !kisTickerSet.has(s.ticker))
    .slice(0, 100 - kisItems.length)
    .map((s, i) => ({
      rank: kisItems.length + i + 1,
      name: s.name, ticker: s.ticker,
      price: 0, changeRate: 0, tradeAmount: 0,
    }))

  const items = [...kisItems, ...supplementItems]
  const result = { type: 'kr', items, count: items.length, source: 'kis', updatedAt: new Date().toISOString() }
  setCache(cacheKey, result)
  return c.json(result)
})

// ── 레이더 관심종목 CRUD ─────────────────────────
app.get('/api/radar/watchlist', async (c) => {
  const items = await getRadarWatchlist(c.env.CUSTOM_TICKERS)
  return c.json({ items, count: items.length })
})

app.post('/api/radar/watchlist', async (c) => {
  const { name, ticker, market } = await c.req.json() as Partial<RadarWatchItem>
  if (!name || !ticker) return c.json({ error: 'name, ticker 필요' }, 400)
  const items = await getRadarWatchlist(c.env.CUSTOM_TICKERS)
  if (!items.find(i => i.ticker === ticker)) {
    items.push({ name, ticker, market: market || 'KR' })
    await c.env.CUSTOM_TICKERS.put(RADAR_WATCHLIST_KV_KEY, JSON.stringify(items))
  }
  return c.json({ ok: true, items })
})

app.delete('/api/radar/watchlist', async (c) => {
  const { ticker } = await c.req.json() as { ticker?: string }
  if (!ticker) return c.json({ error: 'ticker 필요' }, 400)
  let items = await getRadarWatchlist(c.env.CUSTOM_TICKERS)
  items = items.filter(i => i.ticker !== ticker)
  await c.env.CUSTOM_TICKERS.put(RADAR_WATCHLIST_KV_KEY, JSON.stringify(items))
  return c.json({ ok: true, items })
})

// ── 레이더 10이평선 스캔 ──────────────────────────
// body: { tickers: string[], scores?: boolean }
// KR 종목: KIS 월봉 데이터 우선, 실패 시 Yahoo Finance 폴백
// US 종목: Yahoo Finance
// scores=true 시: 주봉+월봉 병렬 조회 → A/B/C/D 4가지 퀀트 점수 추가 반환
app.post('/api/radar/scan', async (c) => {
  let body: { tickers?: string[]; scores?: boolean }
  try { body = await c.req.json() } catch (_) { return c.json({ error: '잘못된 JSON' }, 400) }
  const tickers = body?.tickers
  if (!Array.isArray(tickers) || tickers.length === 0) return c.json({ error: 'tickers 배열 필요' }, 400)
  if (tickers.length > 50) return c.json({ error: '최대 50개까지 가능합니다' }, 400)

  const withScores = !!body?.scores
  const kisEnv = c.env as unknown as KisEnv
  const kisReady = isKisConfigured(kisEnv)
  const usdKrw = await getUsdKrw()

  type ScanItem = {
    ticker: string; name?: string; ma10: number | null;
    curPrice: number | null; signal: 'bull' | 'bear' | null; source: string;
    score?: number; scoreA?: number; scoreB?: number; scoreC?: number; scoreD?: number;
    gapPct?: number; volRatio?: number; weeklySlope?: number; monthlySlope?: number;
    ma10w?: number | null;
  }

  // 동시 요청 5개로 제한 (KIS API 속도 제한 배려)
  const results: ScanItem[] = []

  const queue = [...tickers]
  while (queue.length > 0) {
    const batch = queue.splice(0, 5)
    const batchResults = await Promise.all(batch.map(async (raw): Promise<ScanItem> => {
      const { ticker, isKorean, isCoin, yhTicker } = inferTicker(raw)
      const cleanCode = ticker.slice(0, 6)

      // ── 코인: 업비트 기준 ──
      if (isCoin) {
        if (withScores) {
          // 월봉 + 주봉 병렬 조회 → 점수 계산
          const [monthlyBars, weeklyBars] = await Promise.all([
            fetchUpbitMonthlyCandles(ticker, 13),
            fetchUpbitWeeklyCandles(ticker, 42),
          ])
          if (monthlyBars.length < 5) return { ticker: raw, ma10: null, curPrice: null, signal: null, source: 'upbit_fail' }
          const monthly = calcCoinMa10(monthlyBars)
          const weekly  = weeklyBars.length >= 10 ? calcCoinMa10Weekly(weeklyBars) : null
          const priceData = await fetchUpbitPrice(ticker)
          const rawClose = priceData?.price ?? weekly?.latestClose ?? monthly.currentMonthClose
          let score = 0, scoreA = 0, scoreB = 0, scoreC = 0, scoreD = 0
          let gapPct = 0, volRatio = 0, weeklySlope = 0, monthlySlope = 0
          if (weekly?.ma10w) {
            gapPct    = rawClose && weekly.ma10w ? (rawClose - weekly.ma10w) / weekly.ma10w * 100 : 0
            volRatio  = weekly.volumeW && weekly.volumeWAvg10 && weekly.volumeWAvg10 > 0 ? weekly.volumeW / weekly.volumeWAvg10 : 0
            weeklySlope = weekly.ma10wPrev && weekly.ma10wPrev > 0 ? (weekly.ma10w - weekly.ma10wPrev) / weekly.ma10wPrev * 100 : 0
            monthlySlope = monthly.smaPrev && monthly.smaPrev > 0 && monthly.ma10 ? (monthly.ma10 - monthly.smaPrev) / monthly.smaPrev * 100 : 0
            scoreA = scoreQuantGap(gapPct); scoreB = scoreQuantVol(volRatio)
            scoreC = scoreQuantWeeklySlope(weeklySlope); scoreD = scoreQuantMonthlySlope(monthlySlope)
            score = scoreA + scoreB + scoreC + scoreD
          }
          return {
            ticker: raw, name: priceData?.name,
            ma10: monthly.ma10, curPrice: rawClose, signal: monthly.signal, source: 'upbit',
            score, scoreA, scoreB, scoreC, scoreD,
            gapPct: parseFloat(gapPct.toFixed(2)), volRatio: parseFloat(volRatio.toFixed(2)),
            weeklySlope: parseFloat(weeklySlope.toFixed(3)), monthlySlope: parseFloat(monthlySlope.toFixed(3)),
            ma10w: weekly?.ma10w ? Math.round(weekly.ma10w) : null,
          }
        }
        // 점수 없이 신호만
        const bars = await fetchUpbitMonthlyCandles(ticker, 13)
        if (bars.length === 0) return { ticker: raw, ma10: null, curPrice: null, signal: null, source: 'upbit_fail' }
        const { ma10, currentMonthClose, signal } = calcCoinMa10(bars)
        const priceData = await fetchUpbitPrice(ticker)
        return { ticker: raw, name: priceData?.name, ma10, curPrice: priceData?.price ?? currentMonthClose, signal, source: 'upbit' }
      }

      // ── 점수 포함 스캔: Yahoo 월봉+주봉 병렬 ──
      if (withScores) {
        const [monthly, weekly] = await Promise.all([
          fetchMa10Data(yhTicker),
          fetchMaWeeklyData(yhTicker),
        ])
        if (!monthly) return { ticker: raw, ma10: null, curPrice: null, signal: null, source: 'yahoo_fail' }
        const toKrw = isKorean ? 1 : usdKrw
        const rawClose = weekly?.latestClose ?? monthly.currentMonthClose ?? 0
        let score = 0, scoreA = 0, scoreB = 0, scoreC = 0, scoreD = 0
        let gapPct = 0, volRatio = 0, weeklySlope = 0, monthlySlope = 0
        if (weekly?.ma10w) {
          gapPct    = rawClose && weekly.ma10w ? (rawClose - weekly.ma10w) / weekly.ma10w * 100 : 0
          volRatio  = weekly.volumeW && weekly.volumeWAvg10 && weekly.volumeWAvg10 > 0 ? weekly.volumeW / weekly.volumeWAvg10 : 0
          weeklySlope = weekly.ma10wPrev && weekly.ma10wPrev > 0 ? (weekly.ma10w - weekly.ma10wPrev) / weekly.ma10wPrev * 100 : 0
          monthlySlope = monthly.smaPrev && monthly.smaPrev > 0 && monthly.ma10 ? (monthly.ma10 - monthly.smaPrev) / monthly.smaPrev * 100 : 0
          scoreA = scoreQuantGap(gapPct); scoreB = scoreQuantVol(volRatio)
          scoreC = scoreQuantWeeklySlope(weeklySlope); scoreD = scoreQuantMonthlySlope(monthlySlope)
          score = scoreA + scoreB + scoreC + scoreD
        }
        return {
          ticker: raw,
          ma10:     monthly.ma10     != null ? Math.round(monthly.ma10 * toKrw) : null,
          curPrice: rawClose ? Math.round(rawClose * toKrw) : null,
          signal:   monthly.signal, source: 'yahoo',
          score, scoreA, scoreB, scoreC, scoreD,
          gapPct: parseFloat(gapPct.toFixed(2)), volRatio: parseFloat(volRatio.toFixed(2)),
          weeklySlope: parseFloat(weeklySlope.toFixed(3)), monthlySlope: parseFloat(monthlySlope.toFixed(3)),
          ma10w: weekly?.ma10w != null ? Math.round(weekly.ma10w * toKrw) : null,
        }
      }

      // ── KR 종목: KIS 우선 (신호만) ──
      if (isKorean && kisReady) {
        const bars = await fetchKisDomesticMonthly(kisEnv, cleanCode)
        if (bars.length >= 5) {
          const { ma10, currentClose, signal } = calcMa10FromBars(bars)
          const priceData = await fetchKisDomesticPrice(kisEnv, cleanCode)
          return { ticker: raw, name: priceData?.name, ma10, curPrice: priceData?.price ?? currentClose, signal, source: 'kis' }
        }
      }

      // ── Yahoo Finance 폴백 (KR 실패 or US, 신호만) ──
      const data = await fetchMa10Data(yhTicker)
      if (!data) return { ticker: raw, ma10: null, curPrice: null, signal: null, source: 'yahoo_fail' }
      const toKrw = isKorean ? 1 : usdKrw
      return {
        ticker: raw,
        ma10:     data.ma10             != null ? Math.round(data.ma10 * toKrw)             : null,
        curPrice: data.currentMonthClose != null ? Math.round(data.currentMonthClose * toKrw) : null,
        signal:   data.signal, source: 'yahoo',
      }
    }))
    results.push(...batchResults)
  }

  return c.json({ results, count: results.length, usdKrw, updatedAt: new Date().toISOString() })
})

// ── KIS 연결 상태 확인 ────────────────────────────
app.get('/api/kis/status', async (c) => {
  const kisEnv = c.env as unknown as KisEnv
  if (!isKisConfigured(kisEnv)) {
    return c.json({ configured: false, message: 'KIS API 자격증명이 설정되지 않았습니다.' })
  }
  const token = await getKisToken(kisEnv)
  return c.json({
    configured: true,
    connected: !!token,
    mode: kisEnv.KIS_IS_REAL === 'true' ? '실전투자' : '모의투자',
    message: token ? 'KIS API 연결 정상' : 'KIS 토큰 발급 실패 - 자격증명을 확인해주세요',
  })
})

// ═══════════════════════════════════════════════════
// 상승 초기 퀀트 TOP 50 — 절대 필터 + 4가지 스코어링
// ═══════════════════════════════════════════════════
const QUANT_TOP50_KV_KEY = 'quant_top50_v2'
const QUANT_TTL_MS       = 1 * 60 * 60 * 1000   // 1시간 캐시

interface QuantStockResult {
  rank:         number
  ticker:       string
  name:         string
  price:        number          // 현재가 (KRW 환산)
  score:        number          // 총점 (0–100)
  scoreA:       number          // A. 이격도 점수 (30점)
  scoreB:       number          // B. 거래량 점수 (30점)
  scoreC:       number          // C. 주봉 기울기 점수 (20점)
  scoreD:       number          // D. 월봉 기울기 점수 (20점)
  gapPct:       number          // (P – SMA10W) / SMA10W × 100
  volRatio:     number          // volW / volWAvg10
  weeklySlope:  number          // (SMA10W – SMA10WPrev) / SMA10WPrev × 100
  monthlySlope: number          // (SMA10M – SMA10MPrev) / SMA10MPrev × 100
  market:       'us' | 'kr'
  ma10m:        number | null   // 월봉 10이평 (KRW)
  ma10w:        number | null   // 주봉 10이평 (KRW)
}

interface QuantCacheData {
  items:        QuantStockResult[]
  builtAt:      string
  totalScanned: number
  passed:       number
}

// A. 이격도 점수 (0-30점, 3단계 선형)
// ① 0~2%  (초밀착 구간): 30점 고정
// ② 2~8%  (현실적 돌파): 30→15 선형 감소  (5%≈23점 → 거래량 합산 80점대 돌파 가능)
// ③ 8~15% (단기 과열):  15→0 선형 감소
// ④ 15% 초과 (추격위험): 0점
function scoreQuantGap(pct: number): number {
  if (pct < 0 || pct > 15) return 0
  if (pct <= 2) return 30
  if (pct <= 8)  return Math.round(30 - (pct - 2) / 6 * 15)   // 2%→30, 8%→15
  return Math.round(15 * (15 - pct) / 7)                       // 8%→15, 15%→0
}

// B. 주간 거래량 폭발 점수 (0-30점, 1점 단위 선형)
// 1.0x 미만: 0점, 1.0x→5점(하한 고정), 2.0x 이상→30점(상한 고정)
function scoreQuantVol(ratio: number): number {
  if (ratio < 1.0) return 0
  if (ratio >= 2.0) return 30
  return Math.round(5 + (ratio - 1.0) / 1.0 * 25)   // 1.0x=5, 2.0x=30 선형
}

// C. 주봉 10이평선 단기 기울기 점수 (0-20점, 1점 단위 선형)
// 0% 이하: 0점, 0%초과→최소 1점, 1.0% 이상→20점 상한
function scoreQuantWeeklySlope(pct: number): number {
  if (pct <= 0) return 0
  if (pct >= 1.0) return 20
  return Math.max(1, Math.round(pct * 20))            // 0→20 선형
}

// D. 월봉 10이평선 거시 기울기 점수 (0-20점, 1점 단위 선형)
// 0% 이하: 0점, 0%초과→최소 1점, 0.5% 이상→20점 상한
function scoreQuantMonthlySlope(pct: number): number {
  if (pct <= 0) return 0
  if (pct >= 0.5) return 20
  return Math.max(1, Math.round(pct / 0.5 * 20))     // 0→20 선형
}

async function buildQuantTop50(env: Env): Promise<QuantCacheData> {
  const kisEnv   = env as unknown as KisEnv
  const kisReady = isKisConfigured(kisEnv)
  const usdKrw   = await getUsdKrw()

  // ① 유니버스 구성: US=SP500 Top100, KR=KIS 순위 50 + KRX 폴백 50
  const usUniverse = SP500_TOP100.map(s => ({
    name: s.name, ticker: s.ticker, market: 'us' as const,
  }))

  let krUniverse: Array<{ name: string; ticker: string; market: 'kr' }> = []
  if (kisReady) {
    const kisItems = await fetchKisVolumeRank(kisEnv, 50)
    const kisSet   = new Set(kisItems.map(i => i.ticker))
    krUniverse = [
      ...kisItems.map(i => ({ name: i.name, ticker: i.ticker, market: 'kr' as const })),
      ...KRX_FALLBACK
        .filter(s => !kisSet.has(s.ticker))
        .slice(0, 50)
        .map(s => ({ name: s.name, ticker: s.ticker, market: 'kr' as const })),
    ]
  } else {
    krUniverse = KRX_FALLBACK.slice(0, 100).map(s => ({
      name: s.name, ticker: s.ticker, market: 'kr' as const,
    }))
  }

  // 코인 유니버스 (업비트 주요 15개) — Yahoo Finance 불필요, 업비트 API 직접 사용
  const COIN_UNIVERSE: Array<{ name: string; ticker: string; market: 'coin' }> = [
    { name: '비트코인',       ticker: 'KRW-BTC',  market: 'coin' },
    { name: '이더리움',       ticker: 'KRW-ETH',  market: 'coin' },
    { name: '리플',           ticker: 'KRW-XRP',  market: 'coin' },
    { name: '솔라나',         ticker: 'KRW-SOL',  market: 'coin' },
    { name: '도지코인',       ticker: 'KRW-DOGE', market: 'coin' },
    { name: '에이다',         ticker: 'KRW-ADA',  market: 'coin' },
    { name: '트론',           ticker: 'KRW-TRX',  market: 'coin' },
    { name: '아발란체',       ticker: 'KRW-AVAX', market: 'coin' },
    { name: '체인링크',       ticker: 'KRW-LINK', market: 'coin' },
    { name: '수이',           ticker: 'KRW-SUI',  market: 'coin' },
    { name: '폴카닷',         ticker: 'KRW-DOT',  market: 'coin' },
    { name: '비트코인캐시',   ticker: 'KRW-BCH',  market: 'coin' },
    { name: '이더리움클래식', ticker: 'KRW-ETC',  market: 'coin' },
    { name: '스텔라루멘',     ticker: 'KRW-XLM',  market: 'coin' },
    { name: '앱토스',         ticker: 'KRW-APT',  market: 'coin' },
  ]

  const passed: QuantStockResult[] = []

  // ── 공통 스코어링 헬퍼 (필터 + 점수 계산) ──
  // 코인/KR/US 모든 그룹이 동일한 절대 필터 + 스코어링 로직을 사용
  function scoreStock(p: {
    ticker: string; name: string; market: 'us' | 'kr'
    isKorean: boolean
    rawClose: number
    ma10mRaw: number; ma10mPrv: number | null
    ma10wRaw: number; ma10wPrv: number | null; ma20wRaw: number
    volumeW: number | null; volumeWAvg10: number | null
  }): QuantStockResult | null {
    const { rawClose, ma10mRaw, ma10wRaw, ma20wRaw, ma10wPrv, ma10mPrv } = p

    // ─── 절대 필터 4종 (한 가지라도 탈락 시 즉시 제외) ───
    // ⓪ 주가 하한선 필터 (동전주·페니스톡 제외)
    //    객단가가 너무 낮은 주식은 변동성이 비정상적으로 크고
    //    세력 조작에 취약하여 10이평선 추세추종 전략에 부적합
    //    코인은 단가가 낮아도 정상이므로 필터 제외 (도지코인 ~200원 등)
    const isCoin = (p.market as string) === 'coin'
    if (!isCoin && p.isKorean && rawClose < 2000) return null  // 한국 주식: 2,000원 미만 제외
    if (!isCoin && !p.isKorean && rawClose < 5)   return null  // 미국 주식: $5 미만 제외
    if (rawClose <= ma10mRaw) return null   // ① P > SMA10_M
    if (rawClose <= ma10wRaw) return null   // ② P > SMA10_W
    if (ma10wRaw <= ma20wRaw) return null   // ③ SMA10_W > SMA20_W (정배열 초기)

    // ─── 스코어링 (비율 기반 → 통화 무관, 데이터 소스와 무관하게 동작) ───
    const gapPct     = (rawClose - ma10wRaw) / ma10wRaw * 100
    const volRatio   = (p.volumeW && p.volumeWAvg10 && p.volumeWAvg10 > 0)
      ? p.volumeW / p.volumeWAvg10 : 0
    const weekSlope  = (ma10wPrv && ma10wPrv > 0)
      ? (ma10wRaw - ma10wPrv) / ma10wPrv * 100 : 0
    const monthSlope = (ma10mPrv && ma10mPrv > 0)
      ? (ma10mRaw - ma10mPrv) / ma10mPrv * 100 : 0

    const scoreA = scoreQuantGap(gapPct)
    const scoreB = scoreQuantVol(volRatio)
    const scoreC = scoreQuantWeeklySlope(weekSlope)
    const scoreD = scoreQuantMonthlySlope(monthSlope)
    const score  = scoreA + scoreB + scoreC + scoreD

    const toKrw = p.isKorean ? 1 : usdKrw
    return {
      rank: 0, ticker: p.ticker, name: p.name,
      price:        Math.round(rawClose * toKrw),
      score, scoreA, scoreB, scoreC, scoreD,
      gapPct:       parseFloat(gapPct.toFixed(2)),
      volRatio:     parseFloat(volRatio.toFixed(2)),
      weeklySlope:  parseFloat(weekSlope.toFixed(3)),
      monthlySlope: parseFloat(monthSlope.toFixed(3)),
      market:       p.market,
      ma10m: Math.round(ma10mRaw * toKrw),
      ma10w: Math.round(ma10wRaw * toKrw),
    } as QuantStockResult
  }

  // ═══════════════════════════════════════════════════
  // 3개 그룹 동시 병렬 스캔: 코인(업비트) / KR(KIS) / US(Yahoo)
  // 기존: 코인 → (KR+US 섞어서 순차) = 60초+
  // 개선: 3그룹 동시 출발 → 가장 느린 그룹 기준 = ~15-20초
  // ═══════════════════════════════════════════════════

  // ── 그룹 A: 코인 스캔 (업비트 API, 15개 전체 병렬) ──
  async function scanCoins(): Promise<QuantStockResult[]> {
    const results = await Promise.all(COIN_UNIVERSE.map(async (coin) => {
      try {
        const [monthlyBars, weeklyBars] = await Promise.all([
          fetchUpbitMonthlyCandles(coin.ticker, 13),
          fetchUpbitWeeklyCandles(coin.ticker, 42),
        ])
        if (monthlyBars.length < 10 || weeklyBars.length < 20) return null

        const monthly = calcCoinMa10(monthlyBars)
        const weekly  = calcCoinMa10Weekly(weeklyBars)

        const rawClose = weekly.latestClose ?? monthly.currentMonthClose
        if (!rawClose || !monthly.ma10 || !weekly.ma10w || !weekly.ma20w) return null

        return scoreStock({
          ticker: coin.ticker, name: coin.name,
          market: 'coin' as unknown as 'us' | 'kr',
          isKorean: true,  // 코인은 KRW 기준이므로 환산 불필요 (toKrw=1)
          rawClose, ma10mRaw: monthly.ma10, ma10mPrv: monthly.smaPrev,
          ma10wRaw: weekly.ma10w, ma10wPrv: weekly.ma10wPrev, ma20wRaw: weekly.ma20w,
          volumeW: weekly.volumeW, volumeWAvg10: weekly.volumeWAvg10,
        })
      } catch (_) { return null }
    }))
    return results.filter((r): r is QuantStockResult => r != null)
  }

  // ── 그룹 B: 한국 주식 (KIS 우선, 20개씩 병렬 — 딜레이 불필요) ──
  async function scanKrStocks(): Promise<QuantStockResult[]> {
    const KR_BATCH = 20  // KIS는 Yahoo보다 안정적이므로 배치 크기 증가
    const results: QuantStockResult[] = []
    for (let i = 0; i < krUniverse.length; i += KR_BATCH) {
      const batch = await Promise.all(krUniverse.slice(i, i + KR_BATCH).map(async (stock) => {
        try {
          const { yhTicker } = inferTicker(stock.ticker)
          let ma10mRaw: number | null = null
          let ma10mPrv: number | null = null
          let ma10wRaw: number | null = null
          let ma10wPrv: number | null = null
          let ma20wRaw: number | null = null
          let rawClose = 0
          let volumeW: number | null = null
          let volumeWAvg10: number | null = null

          if (kisReady) {
            // KIS 직접 조회 (수정주가, 실시간)
            const [kisMBars, kisWBars] = await Promise.all([
              fetchKisDomesticMonthly(kisEnv, stock.ticker),
              fetchKisDomesticWeekly(kisEnv, stock.ticker),
            ])
            const kisM = (kisMBars.length >= 10) ? calcMa10FromBars(kisMBars) : null
            const kisW = (kisWBars.length >= 10) ? calcWeeklyMaFromBars(kisWBars) : null

            if (kisM?.ma10 && kisW?.ma10w) {
              ma10mRaw = kisM.ma10
              if (kisMBars.length >= 11) {
                const prev10 = kisMBars.slice(-11, -1).map(b => b.close)
                ma10mPrv = Math.round(prev10.reduce((s, v) => s + v, 0) / 10)
              }
              ma10wRaw     = kisW.ma10w
              ma10wPrv     = kisW.ma10wPrev
              ma20wRaw     = kisW.ma20w
              rawClose     = kisW.latestClose ?? kisM.currentClose ?? 0
              volumeW      = kisW.volumeW
              volumeWAvg10 = kisW.volumeWAvg10
            } else {
              // KIS 실패 → Yahoo 폴백
              const [monthly, weekly] = await Promise.all([
                fetchMa10Data(yhTicker), fetchMaWeeklyData(yhTicker),
              ])
              if (!monthly || !weekly) return null
              ma10mRaw = monthly.ma10; ma10mPrv = monthly.smaPrev
              ma10wRaw = weekly.ma10w; ma10wPrv = weekly.ma10wPrev; ma20wRaw = weekly.ma20w
              rawClose = weekly.latestClose ?? monthly.currentMonthClose ?? 0
              volumeW = weekly.volumeW ?? null; volumeWAvg10 = weekly.volumeWAvg10 ?? null
            }
          } else {
            // KIS 미설정 → Yahoo 사용
            const [monthly, weekly] = await Promise.all([
              fetchMa10Data(yhTicker), fetchMaWeeklyData(yhTicker),
            ])
            if (!monthly || !weekly) return null
            ma10mRaw = monthly.ma10; ma10mPrv = monthly.smaPrev
            ma10wRaw = weekly.ma10w; ma10wPrv = weekly.ma10wPrev; ma20wRaw = weekly.ma20w
            rawClose = weekly.latestClose ?? monthly.currentMonthClose ?? 0
            volumeW = weekly.volumeW ?? null; volumeWAvg10 = weekly.volumeWAvg10 ?? null
          }

          if (!rawClose || !ma10mRaw || !ma10wRaw || !ma20wRaw) return null
          return scoreStock({
            ticker: stock.ticker, name: stock.name, market: 'kr',
            isKorean: true, rawClose,
            ma10mRaw, ma10mPrv, ma10wRaw, ma10wPrv, ma20wRaw,
            volumeW, volumeWAvg10,
          })
        } catch (_) { return null }
      }))
      batch.forEach(r => { if (r) results.push(r) })
    }
    return results
  }

  // ── 그룹 C: 미국 주식 (Yahoo Finance, 10개씩 + 배치 간 300ms 딜레이) ──
  async function scanUsStocks(): Promise<QuantStockResult[]> {
    const US_BATCH = 10
    const US_DELAY = 300
    const results: QuantStockResult[] = []
    for (let i = 0; i < usUniverse.length; i += US_BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, US_DELAY))
      const batch = await Promise.all(usUniverse.slice(i, i + US_BATCH).map(async (stock) => {
        try {
          const { yhTicker } = inferTicker(stock.ticker)
          // Yahoo 월봉+주봉 병렬, 실패 시 1회 재시도
          let monthly = await fetchMa10Data(yhTicker)
          let weekly  = await fetchMaWeeklyData(yhTicker)
          if (!monthly || !weekly) {
            await new Promise(r => setTimeout(r, 300))
            if (!monthly) monthly = await fetchMa10Data(yhTicker)
            if (!weekly)  weekly  = await fetchMaWeeklyData(yhTicker)
          }
          if (!monthly || !weekly) return null

          const rawClose = weekly.latestClose ?? monthly.currentMonthClose ?? 0
          if (!rawClose || !monthly.ma10 || !weekly.ma10w || !weekly.ma20w) return null

          return scoreStock({
            ticker: stock.ticker, name: stock.name, market: 'us',
            isKorean: false, rawClose,
            ma10mRaw: monthly.ma10, ma10mPrv: monthly.smaPrev,
            ma10wRaw: weekly.ma10w, ma10wPrv: weekly.ma10wPrev, ma20wRaw: weekly.ma20w,
            volumeW: weekly.volumeW ?? null, volumeWAvg10: weekly.volumeWAvg10 ?? null,
          })
        } catch (_) { return null }
      }))
      batch.forEach(r => { if (r) results.push(r) })
    }
    return results
  }

  // ── 3개 그룹 동시 실행 ──
  const [coinResults, krResults, usResults] = await Promise.all([
    scanCoins(),
    scanKrStocks(),
    scanUsStocks(),
  ])
  passed.push(...coinResults, ...krResults, ...usResults)

  // 총점 내림차순 정렬 → Top 50 선정
  passed.sort((a, b) => b.score - a.score)
  const top50 = passed.slice(0, 50).map((item, idx) => ({ ...item, rank: idx + 1 }))

  const cacheData: QuantCacheData = {
    items:        top50,
    builtAt:      new Date().toISOString(),
    totalScanned: krUniverse.length + usUniverse.length + COIN_UNIVERSE.length,
    passed:       passed.length,
  }

  // KV 저장 (2시간 TTL)
  try {
    await env.CUSTOM_TICKERS.put(
      QUANT_TOP50_KV_KEY,
      JSON.stringify(cacheData),
      { expirationTtl: 2 * 60 * 60 }
    )
  } catch (_) {}

  return cacheData
}

// ── 퀀트 TOP50 조회 API ───────────────────────────
// GET /api/quant-top50          → KV 캐시 우선 반환 (24시간)
// GET /api/quant-top50?refresh=1 → 강제 재스캔
app.get('/api/quant-top50', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1'

  if (!forceRefresh) {
    try {
      const cached = await c.env.CUSTOM_TICKERS.get(QUANT_TOP50_KV_KEY, 'json') as QuantCacheData | null
      if (cached?.builtAt && Date.now() - new Date(cached.builtAt).getTime() < QUANT_TTL_MS) {
        return c.json({ ...cached, fromCache: true })
      }
    } catch (_) {}
  }

  const result = await buildQuantTop50(c.env)
  return c.json({ ...result, fromCache: false })
})

// ═══════════════════════════════════════════════════
// 인기 코인 TOP50 — 업비트 24시간 거래대금 상위 50개 + 퀀트 점수
// ═══════════════════════════════════════════════════
const COIN_TOP50_KV_KEY = 'coin_top50_v1'
const COIN_TOP50_TTL_MS  = 1 * 60 * 60 * 1000  // 1시간 캐시

interface UpbitMarketInfo { market: string; korean_name: string; english_name: string }
interface UpbitTicker24h  { market: string; trade_price: number; acc_trade_price_24h: number }

async function fetchUpbitAllKrwMarkets(): Promise<UpbitMarketInfo[]> {
  try {
    const res = await fetch('https://api.upbit.com/v1/market/all', { headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const json = await res.json() as UpbitMarketInfo[]
    return json.filter(m => m.market.startsWith('KRW-'))
  } catch (_) { return [] }
}

async function fetchUpbitTickerBatch(markets: string[]): Promise<UpbitTicker24h[]> {
  if (!markets.length) return []
  try {
    const chunks: string[][] = []
    for (let i = 0; i < markets.length; i += 100) chunks.push(markets.slice(i, i + 100))
    const all: UpbitTicker24h[] = []
    for (const chunk of chunks) {
      const res = await fetch(`https://api.upbit.com/v1/ticker?markets=${chunk.join(',')}`, { headers: { Accept: 'application/json' } })
      if (!res.ok) continue
      const json = await res.json() as UpbitTicker24h[]
      all.push(...json)
    }
    return all
  } catch (_) { return [] }
}

app.get('/api/coin-top50', async (c) => {
  const forceRefresh = c.req.query('refresh') === '1'

  if (!forceRefresh) {
    try {
      const cached = await c.env.CUSTOM_TICKERS.get(COIN_TOP50_KV_KEY, 'json') as { builtAt: string; items: unknown[] } | null
      if (cached?.builtAt && Date.now() - new Date(cached.builtAt).getTime() < COIN_TOP50_TTL_MS) {
        return c.json({ ...cached, fromCache: true })
      }
    } catch (_) {}
  }

  // ① 모든 KRW 마켓 목록 + 24h 티커 조회
  const allMarkets = await fetchUpbitAllKrwMarkets()
  const nameMap = Object.fromEntries(allMarkets.map(m => [m.market, m.korean_name]))
  const tickers24h = await fetchUpbitTickerBatch(allMarkets.map(m => m.market))
  tickers24h.sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h)
  const top50 = tickers24h.slice(0, 50)

  // ② 각 코인: 월봉 + 주봉 병렬 조회 → 신호 + 퀀트 점수
  const rawItems = (await Promise.all(top50.map(async (item, idx) => {
    try {
      const [monthlyBars, weeklyBars] = await Promise.all([
        fetchUpbitMonthlyCandles(item.market, 13),
        fetchUpbitWeeklyCandles(item.market, 42),
      ])
      if (monthlyBars.length < 3) return null
      const monthly = calcCoinMa10(monthlyBars)
      const weekly  = weeklyBars.length >= 10 ? calcCoinMa10Weekly(weeklyBars) : null

      const rawClose = item.trade_price || weekly?.latestClose || monthly.currentMonthClose || 0
      let score = 0, scoreA = 0, scoreB = 0, scoreC = 0, scoreD = 0
      let gapPct = 0, volRatio = 0, weeklySlope = 0, monthlySlope = 0
      if (weekly?.ma10w) {
        gapPct      = rawClose && weekly.ma10w ? (rawClose - weekly.ma10w) / weekly.ma10w * 100 : 0
        volRatio    = weekly.volumeW && weekly.volumeWAvg10 && weekly.volumeWAvg10 > 0 ? weekly.volumeW / weekly.volumeWAvg10 : 0
        weeklySlope = weekly.ma10wPrev && weekly.ma10wPrev > 0 ? (weekly.ma10w - weekly.ma10wPrev) / weekly.ma10wPrev * 100 : 0
        monthlySlope = monthly.smaPrev && monthly.smaPrev > 0 && monthly.ma10 ? (monthly.ma10 - monthly.smaPrev) / monthly.smaPrev * 100 : 0
        scoreA = scoreQuantGap(gapPct); scoreB = scoreQuantVol(volRatio)
        scoreC = scoreQuantWeeklySlope(weeklySlope); scoreD = scoreQuantMonthlySlope(monthlySlope)
        score = scoreA + scoreB + scoreC + scoreD
      }
      return {
        rank: 0,  // 필터 후 재부여
        ticker: item.market,
        name: nameMap[item.market] || item.market.replace('KRW-', ''),
        price: Math.round(rawClose),
        signal: monthly.signal,
        ma10m:  monthly.ma10 ? Math.round(monthly.ma10) : null,
        ma10w:  weekly?.ma10w ? Math.round(weekly.ma10w) : null,
        score, scoreA, scoreB, scoreC, scoreD,
        gapPct: parseFloat(gapPct.toFixed(2)), volRatio: parseFloat(volRatio.toFixed(2)),
        weeklySlope: parseFloat(weeklySlope.toFixed(3)), monthlySlope: parseFloat(monthlySlope.toFixed(3)),
        accTradePrice24h: item.acc_trade_price_24h,
      }
    } catch (_) { return null }
  }))).filter(Boolean)

  // 24h 거래대금 순 유지 + 순번 재부여 (일부 null 제거 후 번호 연속 보장)
  const items = rawItems.map((it, i) => ({ ...it!, rank: i + 1 }))

  const cacheData = { items, builtAt: new Date().toISOString(), totalScanned: top50.length }
  try {
    await c.env.CUSTOM_TICKERS.put(COIN_TOP50_KV_KEY, JSON.stringify(cacheData), { expirationTtl: 2 * 60 * 60 })
  } catch (_) {}

  return c.json({ ...cacheData, fromCache: false })
})

// ── 텔레그램 봇 알림 발송 ──────────────────────────
// 사용자 측에서 봇 토큰/채팅ID를 넘겨주면 Telegram sendMessage API 호출
// Workers에서 직접 외부 API를 호출 (CORS 우회 역할)
app.post('/api/notify/telegram', async (c) => {
  try {
    const body = await c.req.json() as { botToken: string; chatId: string; message: string }
    const { botToken, chatId, message } = body
    if (!botToken || !chatId || !message) {
      return c.json({ ok: false, error: '봇 토큰, 채팅 ID, 메시지가 모두 필요합니다' }, 400)
    }
    const tgUrl = `https://api.telegram.org/bot${botToken}/sendMessage`
    const res = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    })
    const tgResult = await res.json() as { ok: boolean; description?: string }
    if (!tgResult.ok) {
      return c.json({ ok: false, error: tgResult.description || '텔레그램 API 오류' }, 500)
    }
    return c.json({ ok: true })
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message || e) }, 500)
  }
})

// ── 업비트 마켓 전체 목록 프록시 (코인 동적 검색용, 24h 캐시) ──
app.get('/api/upbit/markets', async (c) => {
  const cacheKey = 'upbit_markets_all'
  const cached = getCached(cacheKey, CACHE_TTL_KRX) as any[] | null
  if (cached) return c.json({ markets: cached })
  try {
    const res = await fetch('https://api.upbit.com/v1/market/all?isDetails=false', {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return c.json({ markets: [] })
    const all = await res.json() as Array<{ market: string; korean_name: string; english_name: string }>
    const krwOnly = all.filter((m: any) => m.market.startsWith('KRW-'))
    setCache(cacheKey, krwOnly)
    return c.json({ markets: krwOnly })
  } catch (_) {
    return c.json({ markets: [] })
  }
})

// ── HTML 서빙 ─────────────────────────────────────
app.get('/', (c) => {
  // 브라우저 캐시 방지: 배포 후 최신 HTML이 항상 서빙되도록 함
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate')
  c.header('Pragma', 'no-cache')
  return c.html(indexHtml)
})

app.notFound((c) => c.html(indexHtml))

// ═══════════════════════════════════════════════════
// Cron Trigger: 자산 스냅샷 자동 기록
// ─────────────────────────────────────────────────
// 설계 제약: Cloudflare Cron은 서버리스로 실행되기 때문에
// 각 사용자의 Google OAuth 토큰을 보유하고 있지 않습니다.
// 현재 아키텍처에서 완전 자동화를 위해서는 두 가지 방법이 있습니다:
//
// ① Google Apps Script (GAS) 방식 [권장 - 즉시 사용 가능]:
//    사용자 구글 시트 > 확장프로그램 > Apps Script에
//    아래 GAS 코드를 붙여넣고 시간 기반 트리거(매일 오후 6시)를 설정하세요.
//
// ② Cloudflare KV 기반 방식 [향후 구현]:
//    사용자가 로그인할 때 refresh_token을 KV에 저장하고,
//    크론이 실행될 때 토큰을 갱신하여 시트에 접근하는 방식입니다.
//
// ─── GAS 코드 (구글 시트 > 확장프로그램 > Apps Script에 붙여넣기) ───
//
// function saveAssetSnapshot() {
//   var ss = SpreadsheetApp.getActiveSpreadsheet();
//   var master = ss.getSheetByName('마스터데이터');
//   var snapshot = ss.getSheetByName('자산스냅샷');
//   if (!master || !snapshot) return;
//
//   var data = master.getRange('A2:R').getValues().filter(function(r){ return r[0] || r[1]; });
//   var totalInvest = 0, totalEval = 0;
//   data.forEach(function(r) {
//     var avgPrice = parseFloat(r[3]) || 0;
//     var qty      = parseFloat(r[5]) || 0;
//     totalInvest += avgPrice * qty;
//     // 현재가(r[4])가 있으면 평가금액, 없으면 투자원금으로 대체
//     var curPrice = parseFloat(r[4]) || avgPrice;
//     totalEval   += curPrice * qty;
//   });
//
//   var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
//
//   // 오늘 날짜 스냅샷이 이미 있으면 업데이트, 없으면 추가
//   var existing = snapshot.getDataRange().getValues();
//   var found = -1;
//   for (var i = 1; i < existing.length; i++) {
//     if (existing[i][0] === today) { found = i + 1; break; }
//   }
//   if (found > 0) {
//     snapshot.getRange(found, 1, 1, 3).setValues([[today, Math.round(totalInvest), Math.round(totalEval)]]);
//   } else {
//     snapshot.appendRow([today, Math.round(totalInvest), Math.round(totalEval)]);
//   }
//   Logger.log('스냅샷 저장 완료: ' + today + ' | 원금: ' + totalInvest + ' | 평가: ' + totalEval);
// }
//
// 설치 방법:
// 1. 구글 시트 > 확장프로그램 > Apps Script
// 2. 위 함수 붙여넣기 > 저장
// 3. 트리거 추가: saveAssetSnapshot > 시간 기반 > 매일 > 오후 6시~7시
// ──────────────────────────────────────────────────────────────────────

export default {
  fetch: app.fetch.bind(app),
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron] trigger fired at ${new Date().toISOString()} | cron: ${event.cron}`)
    // 퀀트 TOP50 캐시를 매일 장 마감 후 자동 갱신
    ctx.waitUntil(buildQuantTop50(env))
  }
}
