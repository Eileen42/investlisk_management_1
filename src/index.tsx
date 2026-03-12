import { Hono } from 'hono'
import { cors } from 'hono/cors'
import indexHtml from '../public/index.html'

const app = new Hono()
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
  { name:'NAVER', ticker:'035420', market:'KOSPI' },
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
  '아마존': 'AMZN',
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
  '우버': 'UBER', '우버테크놀로지스': 'UBER',
  '리프트': 'LYFT', '리프트A': 'LYFT',
  '리비안': 'RIVN', '리비안오토모티브A': 'RIVN', '리비안오토모티브': 'RIVN',
  '루시드': 'LCID', '루시드그룹': 'LCID',
  '니오': 'NIO', '니오ADR': 'NIO',
  '샤오펑': 'XPEV', '샤오펑ADR': 'XPEV',
  '리오토': 'LI', '리오토ADR': 'LI', '이상오토모티브ADR': 'LI',
  // ── 이커머스 / 플랫폼 ──
  '쿠팡': 'CPNG',
  '쇼피파이': 'SHOP', '쇼피파이A': 'SHOP',
  '에어비앤비': 'ABNB', '에어비앤비A': 'ABNB',
  '도어대시': 'DASH', '도어대시A': 'DASH',
  '스포티파이': 'SPOT', '스포티파이테크놀로지': 'SPOT',
  '스냅': 'SNAP', '스냅A': 'SNAP',
  '핀터레스트': 'PINS', '핀터레스트A': 'PINS',
  '트윌리오': 'TWLO',
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
}

async function searchStocks(query: string): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const results: SearchResult[] = []
  const seen = new Set<string>()
  const addResult = (r: SearchResult) => {
    if (!seen.has(r.ticker)) { seen.add(r.ticker); results.push(r) }
  }

  const qLower = q.toLowerCase()
  const isKorean = /[가-힣]/.test(q)
  const isNumber = /^\d+$/.test(q)

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
    if (acRes.status === 'fulfilled')     acRes.value.forEach(s => addResult({ ...s, isKorean: true }))
    if (mobileRes.status === 'fulfilled') mobileRes.value.forEach(s => addResult({ ...s, isKorean: true }))
    if (krxRes.status === 'fulfilled')    krxRes.value.forEach(s => addResult({ ...s, isKorean: true }))

    // 1-C. 위 세 곳 모두 실패하거나 결과가 적으면 KRX 전체 목록에서 검색 (최후 폴백)
    if (results.filter(r => r.isKorean).length < 3) {
      const krxList = await fetchKrxList()
      const matches = krxList.filter(s => s.name.toLowerCase().includes(qLower))
      matches.sort((a, b) => {
        const aE = a.name.toLowerCase() === qLower ? 0 : a.name.toLowerCase().startsWith(qLower) ? 1 : 2
        const bE = b.name.toLowerCase() === qLower ? 0 : b.name.toLowerCase().startsWith(qLower) ? 1 : 2
        return aE - bE
      })
      matches.slice(0, 10).forEach(s => addResult({ ...s, isKorean: true }))
    }
  }

  // ── 숫자(종목코드) 검색 ──
  if (isNumber) {
    const krxList = await fetchKrxList()
    krxList.filter(s => s.ticker.startsWith(q)).slice(0, 8)
      .forEach(s => addResult({ ...s, isKorean: true }))
  }

  // ── ETF 영문 접두어 검색 ──
  if (!isKorean && (q.toUpperCase().startsWith('KODEX') || q.toUpperCase().startsWith('TIGER') || q.toUpperCase().startsWith('KBSTAR') || q.toUpperCase().startsWith('HANARO'))) {
    const krxList = await fetchKrxList()
    krxList.filter(s => s.name.toLowerCase().includes(qLower)).slice(0, 8)
      .forEach(s => addResult({ ...s, isKorean: true }))
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
interface PriceData { price: number; currency: string; marketState: string; regularMarketPreviousClose: number }

async function fetchYahooPrice(ticker: string): Promise<PriceData | null> {
  const cacheKey = `price_${ticker}`
  const cached = getCached(cacheKey)
  if (cached) return cached as PriceData

  try {
    // 한국 주식이면 .KS 자동 추가
    const isKrTicker = /^\d{6}$/.test(ticker)
    const yhTicker = isKrTicker ? ticker + '.KS' : ticker

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=1d&range=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' }
    })
    if (!res.ok) return null

    const json = await res.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number; currency?: string; marketState?: string; regularMarketPreviousClose?: number; chartPreviousClose?: number } }>; error?: unknown }
    }
    const meta = json?.chart?.result?.[0]?.meta
    if (!meta) return null

    const price = meta.regularMarketPrice ?? 0
    const currency = meta.currency ?? 'USD'
    const marketState = meta.marketState ?? 'REGULAR'
    const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? price

    if (price <= 0) return null
    const result: PriceData = { price, currency, marketState, regularMarketPreviousClose: prevClose }

    const ttl = (marketState === 'REGULAR' || marketState === 'PRE' || marketState === 'POST')
      ? 60 * 1000   // 장중: 1분 캐시
      : CACHE_TTL   // 장외: 15분 캐시
    _cache.set(cacheKey, { data: result, timestamp: Date.now() - (CACHE_TTL - ttl) })
    return result
  } catch (_) { return null }
}

function inferTicker(t: string): { ticker: string; isKorean: boolean } {
  if (/^\d{6}$/.test(t)) return { ticker: t, isKorean: true }
  if (/\.(KS|KQ)$/i.test(t)) return { ticker: t.replace(/\.(KS|KQ)$/i, ''), isKorean: true }
  return { ticker: t.toUpperCase(), isKorean: false }
}

// ═══════════════════════════════════════════════════
// API 라우트
// ═══════════════════════════════════════════════════

// ── 종목 검색 (자동완성) ──────────────────────────
app.get('/api/search', async (c) => {
  const q = c.req.query('q') || ''
  if (q.length < 1) return c.json({ results: [] })
  const results = await searchStocks(q)
  return c.json({ results, query: q })
})

// ── 단일 종목 현재가 ──────────────────────────────
app.get('/api/price', async (c) => {
  const raw = c.req.query('ticker')
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400)

  const { ticker, isKorean } = inferTicker(raw)
  const [priceData, usdKrw] = await Promise.all([
    fetchYahooPrice(ticker),
    isKorean ? Promise.resolve(1) : getUsdKrw()
  ])
  if (!priceData) return c.json({ error: `${ticker} 가격 조회 실패`, ticker }, 404)

  const priceKrw = isKorean ? priceData.price : Math.round(priceData.price * usdKrw)
  return c.json({
    ticker, originalTicker: raw, isKorean,
    priceUsd: isKorean ? null : priceData.price,
    priceKrw, currency: priceData.currency,
    usdKrw: isKorean ? null : usdKrw,
    marketState: priceData.marketState,
    prevCloseKrw: isKorean ? priceData.regularMarketPreviousClose : Math.round(priceData.regularMarketPreviousClose * usdKrw),
    updatedAt: new Date().toISOString()
  })
})

// ── 다중 종목 현재가 ──────────────────────────────
app.get('/api/prices', async (c) => {
  const raw = c.req.query('tickers')
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400)
  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (rawList.length > 30) return c.json({ error: '최대 30개까지 가능합니다' }, 400)

  const usdKrw = await getUsdKrw()
  const results = await Promise.all(rawList.map(async (raw) => {
    const { ticker, isKorean } = inferTicker(raw)
    const pd = await fetchYahooPrice(ticker)
    if (!pd) return { ticker, originalTicker: raw, isKorean, error: '조회 실패', priceKrw: null }
    const priceKrw = isKorean ? pd.price : Math.round(pd.price * usdKrw)
    return {
      ticker, originalTicker: raw, isKorean,
      priceUsd: isKorean ? null : pd.price,
      priceKrw, currency: pd.currency,
      usdKrw: isKorean ? null : usdKrw,
      marketState: pd.marketState,
      prevCloseKrw: isKorean ? pd.regularMarketPreviousClose : Math.round(pd.regularMarketPreviousClose * usdKrw),
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
    const { ticker, isKorean } = inferTicker(h.ticker)
    const pd = await fetchYahooPrice(ticker)
    if (!pd) return { name: h.name ?? ticker, ticker, avgPriceKrw: h.avgPriceKrw ?? 0, curPriceKrw: null, qty: h.qty ?? 0, totalKrw: null, profitPct: null, error: '가격 조회 실패' }
    const curPriceKrw = isKorean ? pd.price : Math.round(pd.price * usdKrw)
    const qty = h.qty ?? 0
    const totalKrw = curPriceKrw * qty
    const investKrw = (h.avgPriceKrw ?? 0) * qty
    const profitPct = investKrw > 0 ? parseFloat(((totalKrw - investKrw) / investKrw * 100).toFixed(2)) : null
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
}

async function fetchMa10Data(ticker: string): Promise<Ma10Result | null> {
  const cacheKey = `ma10_${ticker}`
  const cached = getCached(cacheKey, CACHE_TTL_MA10)
  if (cached) return cached as Ma10Result

  try {
    const isKrTicker = /^\d{6}$/.test(ticker)
    const yhTicker = isKrTicker ? ticker + '.KS' : ticker

    // Yahoo Finance v8 chart API - 2년치 월봉 데이터
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yhTicker)}?interval=1mo&range=2y`
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
          meta?: { regularMarketPrice?: number; currency?: string; marketState?: string }
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

    const res2: Ma10Result = {
      ticker,
      monthlyCloses: pairs.slice(-13), // 최근 13개월 반환 (차트용)
      ma10,
      smaPrev,
      currentMonthClose,
      marketState,
      signal
    }
    setCache(cacheKey, res2)
    return res2
  } catch (_) { return null }
}

// ── 10이평선 데이터 API ───────────────────────────
app.get('/api/ma10', async (c) => {
  const raw = c.req.query('ticker')
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400)

  const { ticker } = inferTicker(raw)
  const data = await fetchMa10Data(ticker)
  if (!data) return c.json({ error: `${ticker} 10이평선 데이터 조회 실패`, ticker }, 404)

  return c.json({ ...data, updatedAt: new Date().toISOString() })
})

// ── 다중 10이평선 데이터 API ─────────────────────
app.get('/api/ma10s', async (c) => {
  const raw = c.req.query('tickers')
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400)
  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (rawList.length > 20) return c.json({ error: '최대 20개까지 가능합니다' }, 400)

  const results = await Promise.all(rawList.map(async (r) => {
    const { ticker } = inferTicker(r)
    const data = await fetchMa10Data(ticker)
    return data ? { ...data, originalTicker: r } : { ticker, originalTicker: r, error: '조회 실패', ma10: null, currentMonthClose: null, signal: null }
  }))

  return c.json({ results, count: results.length, updatedAt: new Date().toISOString() })
})

// ── HTML 서빙 ─────────────────────────────────────
app.get('/', (c) => c.html(indexHtml))
app.notFound((c) => c.html(indexHtml))

export default app
