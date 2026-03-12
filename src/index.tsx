import { Hono } from 'hono'
import { cors } from 'hono/cors'
// HTML 파일을 raw string으로 임포트 (Vite의 ?raw 기능)
import indexHtml from '../public/index.html?raw'

const app = new Hono()

// CORS 허용 (API 라우트)
app.use('/api/*', cors())

// ─────────────────────────────────────────────────────────────────
// 캐시 레이어 (메모리, Cloudflare Workers 환경 대응)
// ─────────────────────────────────────────────────────────────────
interface CacheEntry {
  data: unknown;
  timestamp: number;
}
const priceCache = new Map<string, CacheEntry>();
const CACHE_TTL = 15 * 60 * 1000; // 15분

function getCached(key: string): unknown | null {
  const entry = priceCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    priceCache.delete(key);
    return null;
  }
  return entry.data;
}
function setCache(key: string, data: unknown): void {
  priceCache.set(key, { data, timestamp: Date.now() });
}

// ─────────────────────────────────────────────────────────────────
// USD/KRW 환율 조회 (exchangerate-api 또는 공개 엔드포인트)
// ─────────────────────────────────────────────────────────────────
async function getUsdKrw(): Promise<number> {
  const cached = getCached('usd_krw');
  if (cached) return cached as number;

  try {
    // 1차: Open Exchange Rates (무료 공개)
    const res = await fetch(
      'https://open.er-api.com/v6/latest/USD',
      { headers: { 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const json = await res.json() as { rates?: { KRW?: number } };
      const rate = json?.rates?.KRW;
      if (rate && rate > 0) {
        setCache('usd_krw', rate);
        return rate;
      }
    }
  } catch (_) { /* 폴백 */ }

  try {
    // 2차: frankfurter.app
    const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=KRW');
    if (res2.ok) {
      const json2 = await res2.json() as { rates?: { KRW?: number } };
      const rate2 = json2?.rates?.KRW;
      if (rate2 && rate2 > 0) {
        setCache('usd_krw', rate2);
        return rate2;
      }
    }
  } catch (_) { /* 폴백 */ }

  // 마지막 폴백: 고정값 1380
  return 1380;
}

// ─────────────────────────────────────────────────────────────────
// Yahoo Finance 비공식 API로 현재가 조회
// 한국 주식: 035720.KS / 005930.KS 형식
// 미국 주식: AAPL / SPY / QQQ 형식
// ─────────────────────────────────────────────────────────────────
async function fetchYahooPrice(ticker: string): Promise<{
  price: number;
  currency: string;
  marketState: string;
  regularMarketPreviousClose: number;
} | null> {
  const cacheKey = `price_${ticker}`;
  const cached = getCached(cacheKey);
  if (cached) return cached as { price: number; currency: string; marketState: string; regularMarketPreviousClose: number };

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    if (!res.ok) return null;
    const json = await res.json() as {
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number;
            currency?: string;
            marketState?: string;
            regularMarketPreviousClose?: number;
            chartPreviousClose?: number;
          }
        }>;
        error?: unknown;
      }
    };
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const price = meta.regularMarketPrice ?? 0;
    const currency = meta.currency ?? 'USD';
    const marketState = meta.marketState ?? 'REGULAR';
    const prevClose = meta.regularMarketPreviousClose ?? meta.chartPreviousClose ?? price;

    if (price <= 0) return null;

    const result = { price, currency, marketState, regularMarketPreviousClose: prevClose };
    // 장중이면 짧은 캐시(1분), 장외면 긴 캐시(15분)
    if (marketState === 'REGULAR' || marketState === 'PRE' || marketState === 'POST') {
      priceCache.set(cacheKey, { data: result, timestamp: Date.now() - (CACHE_TTL - 60 * 1000) });
    } else {
      setCache(cacheKey, result);
    }
    return result;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// 종목명 → Yahoo 티커 추론 헬퍼
// 숫자 6자리면 한국 주식(KS 추가), 그 외는 미국
// ─────────────────────────────────────────────────────────────────
function inferTicker(nameOrTicker: string): { ticker: string; isKorean: boolean } {
  const t = nameOrTicker.trim();
  // 순수 숫자 6자리 → 한국 주식
  if (/^\d{6}$/.test(t)) {
    return { ticker: t + '.KS', isKorean: true };
  }
  // .KS / .KQ 이미 붙어있는 경우
  if (/\.(KS|KQ)$/i.test(t)) {
    return { ticker: t.toUpperCase(), isKorean: true };
  }
  return { ticker: t.toUpperCase(), isKorean: false };
}

// ─────────────────────────────────────────────────────────────────
// API: 단일 종목 현재가
// GET /api/price?ticker=AAPL
// GET /api/price?ticker=035720
// ─────────────────────────────────────────────────────────────────
app.get('/api/price', async (c) => {
  const raw = c.req.query('ticker');
  if (!raw) return c.json({ error: 'ticker 파라미터가 필요합니다' }, 400);

  const { ticker, isKorean } = inferTicker(raw);
  const [priceData, usdKrw] = await Promise.all([
    fetchYahooPrice(ticker),
    isKorean ? Promise.resolve(1) : getUsdKrw()
  ]);

  if (!priceData) {
    return c.json({ error: `${ticker} 가격 조회 실패`, ticker }, 404);
  }

  const priceUsd = priceData.price;
  const priceKrw = isKorean ? priceUsd : Math.round(priceUsd * usdKrw);

  return c.json({
    ticker,
    originalTicker: raw,
    isKorean,
    priceUsd: isKorean ? null : priceUsd,
    priceKrw,
    currency: priceData.currency,
    usdKrw: isKorean ? null : usdKrw,
    marketState: priceData.marketState,
    prevCloseKrw: isKorean
      ? priceData.regularMarketPreviousClose
      : Math.round(priceData.regularMarketPreviousClose * usdKrw),
    updatedAt: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// API: 여러 종목 일괄 조회
// GET /api/prices?tickers=SPY,QQQ,035720,005930
// ─────────────────────────────────────────────────────────────────
app.get('/api/prices', async (c) => {
  const raw = c.req.query('tickers');
  if (!raw) return c.json({ error: 'tickers 파라미터가 필요합니다 (콤마 구분)' }, 400);

  const rawList = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (rawList.length === 0) return c.json({ error: '종목이 없습니다' }, 400);
  if (rawList.length > 30) return c.json({ error: '최대 30개까지 가능합니다' }, 400);

  const usdKrw = await getUsdKrw();

  const results = await Promise.all(rawList.map(async (raw) => {
    const { ticker, isKorean } = inferTicker(raw);
    const priceData = await fetchYahooPrice(ticker);
    if (!priceData) {
      return { ticker, originalTicker: raw, isKorean, error: '조회 실패', priceKrw: null };
    }
    const priceKrw = isKorean ? priceData.price : Math.round(priceData.price * usdKrw);
    const prevCloseKrw = isKorean
      ? priceData.regularMarketPreviousClose
      : Math.round(priceData.regularMarketPreviousClose * usdKrw);
    return {
      ticker,
      originalTicker: raw,
      isKorean,
      priceUsd: isKorean ? null : priceData.price,
      priceKrw,
      currency: priceData.currency,
      usdKrw: isKorean ? null : usdKrw,
      marketState: priceData.marketState,
      prevCloseKrw,
    };
  }));

  const totalKrw = results.reduce((sum, r) => sum + (r.priceKrw ?? 0), 0);

  return c.json({
    results,
    usdKrw,
    totalKrw,
    count: results.length,
    updatedAt: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// API: 포트폴리오 총자산 계산
// POST /api/portfolio
// Body: { holdings: [{name, ticker, avgPriceKrw, qty}, ...] }
// ─────────────────────────────────────────────────────────────────
app.post('/api/portfolio', async (c) => {
  let body: { holdings?: Array<{ name?: string; ticker?: string; avgPriceKrw?: number; qty?: number }> };
  try {
    body = await c.req.json();
  } catch (_) {
    return c.json({ error: '잘못된 JSON 형식' }, 400);
  }

  const holdings = body?.holdings;
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return c.json({ error: 'holdings 배열이 필요합니다' }, 400);
  }

  const usdKrw = await getUsdKrw();

  const details = await Promise.all(holdings.map(async (h) => {
    if (!h.ticker) {
      return {
        name: h.name ?? '알 수 없음',
        ticker: null,
        avgPriceKrw: h.avgPriceKrw ?? 0,
        curPriceKrw: null,
        qty: h.qty ?? 0,
        totalKrw: null,
        profitPct: null,
        error: 'ticker 없음'
      };
    }

    const { ticker, isKorean } = inferTicker(h.ticker);
    const priceData = await fetchYahooPrice(ticker);

    if (!priceData) {
      return {
        name: h.name ?? ticker,
        ticker,
        avgPriceKrw: h.avgPriceKrw ?? 0,
        curPriceKrw: null,
        qty: h.qty ?? 0,
        totalKrw: null,
        profitPct: null,
        error: '가격 조회 실패'
      };
    }

    const curPriceKrw = isKorean ? priceData.price : Math.round(priceData.price * usdKrw);
    const qty = h.qty ?? 0;
    const totalKrw = curPriceKrw * qty;
    const avgPriceKrw = h.avgPriceKrw ?? 0;
    const investKrw = avgPriceKrw * qty;
    const profitPct = investKrw > 0 ? ((totalKrw - investKrw) / investKrw) * 100 : null;

    return {
      name: h.name ?? ticker,
      ticker,
      avgPriceKrw,
      curPriceKrw,
      qty,
      totalKrw,
      profitPct: profitPct !== null ? parseFloat(profitPct.toFixed(2)) : null,
      currency: priceData.currency,
      marketState: priceData.marketState,
      usdKrw: isKorean ? null : usdKrw,
    };
  }));

  const totalPortfolioKrw = details.reduce((s, d) => s + (d.totalKrw ?? 0), 0);
  const totalInvestKrw = details.reduce((s, d) => s + ((d.avgPriceKrw ?? 0) * (d.qty ?? 0)), 0);
  const totalProfitKrw = totalPortfolioKrw - totalInvestKrw;
  const totalProfitPct = totalInvestKrw > 0
    ? parseFloat(((totalProfitKrw / totalInvestKrw) * 100).toFixed(2))
    : 0;

  return c.json({
    holdings: details,
    summary: {
      totalPortfolioKrw,
      totalInvestKrw,
      totalProfitKrw,
      totalProfitPct,
      usdKrw,
    },
    updatedAt: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────────────────────────
// API: USD/KRW 환율만 조회
// GET /api/exchange-rate
// ─────────────────────────────────────────────────────────────────
app.get('/api/exchange-rate', async (c) => {
  const rate = await getUsdKrw();
  return c.json({ usdKrw: rate, updatedAt: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────
// 루트 경로 → index.html 반환
// ─────────────────────────────────────────────────────────────────
app.get('/', (c) => {
  return c.html(indexHtml)
})

// 404 fallback도 index.html (SPA 방식)
app.notFound((c) => {
  return c.html(indexHtml)
})

export default app
