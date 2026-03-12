import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('/static/*', serveStatic({ root: './' }))

app.get('/', (c) => {
  return c.html(getMainHTML())
})

function getMainHTML(): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>주린이 떡락방지 📈</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
    * { font-family: 'Noto Sans KR', sans-serif; }
    body { background: linear-gradient(135deg, #f0f4f8 0%, #e8edf3 50%, #f0f4f8 100%); min-height: 100vh; }

    /* 그라데이션 헤더 */
    .header-gradient { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a8e 40%, #3a7abf 100%); }

    /* 네비게이션 탭 */
    .nav-tab { transition: all 0.25s ease; border-bottom: 3px solid transparent; }
    .nav-tab.active { border-bottom: 3px solid #60a5fa; color: #60a5fa; }
    .nav-tab:hover { background: rgba(255,255,255,0.1); }

    /* 카드 스타일 */
    .card { background: white; border-radius: 16px; box-shadow: 0 2px 20px rgba(0,0,0,0.07); transition: box-shadow 0.2s; }
    .card:hover { box-shadow: 0 4px 30px rgba(0,0,0,0.12); }

    /* 섹션 숨김/보임 */
    .section { display: none; }
    .section.active { display: block; }

    /* 상태 배지 */
    .badge-up { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-down { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    .badge-neutral { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }

    /* 수익/손실 색상 */
    .profit { color: #dc2626; font-weight: 700; }
    .loss { color: #2563eb; font-weight: 700; }

    /* 테이블 스타일 */
    table { border-collapse: collapse; width: 100%; }
    th { background: linear-gradient(135deg, #f1f5f9, #e8edf5); color: #475569; font-size: 12px; font-weight: 600; padding: 12px 14px; text-align: left; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
    td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #334155; vertical-align: middle; }
    tr:hover td { background: #f8fafc; }

    /* 입력 스타일 */
    input, select { border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 9px 12px; font-size: 13px; transition: all 0.2s; outline: none; background: white; }
    input:focus, select:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }

    /* 버튼 스타일 */
    .btn-primary { background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; border: none; border-radius: 10px; padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
    .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 4px 15px rgba(37,99,235,0.4); }
    .btn-danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 8px; padding: 7px 14px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
    .btn-danger:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(220,38,38,0.3); }
    .btn-secondary { background: linear-gradient(135deg, #64748b, #475569); color: white; border: none; border-radius: 8px; padding: 7px 14px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
    .btn-secondary:hover { background: linear-gradient(135deg, #475569, #334155); }

    /* 잡초 뱃지 */
    .weed-yes { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }
    .weed-no { background: #f0fdf4; color: #16a34a; border: 1px solid #86efac; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }
    .weed-caution { background: #fffbeb; color: #d97706; border: 1px solid #fcd34d; border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }

    /* 상승장/하락장 배지 */
    .bull-market { background: #fef2f2; color: #dc2626; border: 1px solid #fca5a5; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; }
    .bear-market { background: #eff6ff; color: #1d4ed8; border: 1px solid #93c5fd; border-radius: 20px; padding: 4px 12px; font-size: 12px; font-weight: 700; }

    /* 가이드 스텝 */
    .step-num { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }

    /* 모달 */
    .modal-bg { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
    .modal-box { background: white; border-radius: 20px; padding: 32px; width: 90%; max-width: 520px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }

    /* 반응형 스크롤 테이블 */
    .table-wrap { overflow-x: auto; border-radius: 12px; }

    /* 툴팁 */
    .tooltip { position: relative; cursor: help; }
    .tooltip::after { content: attr(data-tip); position: absolute; bottom: 125%; left: 50%; transform: translateX(-50%); background: #1e293b; color: white; padding: 6px 10px; border-radius: 8px; font-size: 11px; white-space: nowrap; z-index: 100; opacity: 0; pointer-events: none; transition: opacity 0.2s; }
    .tooltip:hover::after { opacity: 1; }

    /* 요약 숫자 카드 */
    .stat-card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }

    /* 애니메이션 */
    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.3s ease; }

    /* 스크롤바 */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 3px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

    /* 선택 드롭다운 */
    .dropdown-option { padding: 8px 12px; cursor: pointer; border-radius: 6px; transition: background 0.15s; }
    .dropdown-option:hover { background: #f1f5f9; }

    /* 빈 상태 */
    .empty-state { text-align: center; padding: 60px 20px; color: #94a3b8; }
    .empty-state i { font-size: 48px; margin-bottom: 16px; opacity: 0.4; }
  </style>
</head>
<body>

<!-- 헤더 -->
<header class="header-gradient text-white shadow-xl sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4">
    <div class="flex items-center justify-between py-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">📈</div>
        <div>
          <h1 class="font-black text-lg leading-tight">주린이 떡락방지</h1>
          <p class="text-blue-200 text-xs font-medium">월봉 10이평선 기준 안전 투자 관리</p>
        </div>
      </div>
      <div class="text-right">
        <div id="headerDate" class="text-blue-200 text-xs"></div>
        <div id="headerSummary" class="text-white text-sm font-semibold mt-0.5"></div>
      </div>
    </div>

    <!-- 네비게이션 탭 -->
    <nav class="flex gap-1 pb-0 overflow-x-auto">
      <button onclick="showSection('dashboard')" class="nav-tab active flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white whitespace-nowrap" id="tab-dashboard">
        <i class="fas fa-th-large text-xs"></i> 대시보드
      </button>
      <button onclick="showSection('master')" class="nav-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-200 whitespace-nowrap" id="tab-master">
        <i class="fas fa-seedling text-xs"></i> 마스터 데이터
      </button>
      <button onclick="showSection('signal')" class="nav-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-200 whitespace-nowrap" id="tab-signal">
        <i class="fas fa-chart-line text-xs"></i> 10이평선 통제탑
      </button>
      <button onclick="showSection('cashflow')" class="nav-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-200 whitespace-nowrap" id="tab-cashflow">
        <i class="fas fa-wallet text-xs"></i> 현금흐름 통제소
      </button>
      <button onclick="showSection('guide')" class="nav-tab flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-blue-200 whitespace-nowrap" id="tab-guide">
        <i class="fas fa-book-open text-xs"></i> 사용 가이드
      </button>
    </nav>
  </div>
</header>

<main class="max-w-7xl mx-auto px-4 py-6">

  <!-- ============================= -->
  <!-- 섹션 1: 대시보드 -->
  <!-- ============================= -->
  <section id="section-dashboard" class="section active fade-in">

    <!-- 요약 카드 4개 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="stat-card">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500">총 투자 원금</span>
          <div class="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><i class="fas fa-coins text-blue-500 text-sm"></i></div>
        </div>
        <div class="text-2xl font-black text-slate-800" id="dash-total-invest">-</div>
        <div class="text-xs text-slate-400 mt-1">내가 넣은 총 금액</div>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500">현재 평가 금액</span>
          <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center"><i class="fas fa-chart-bar text-indigo-500 text-sm"></i></div>
        </div>
        <div class="text-2xl font-black text-slate-800" id="dash-total-eval">-</div>
        <div class="text-xs text-slate-400 mt-1">지금 팔면 받는 금액</div>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500">총 수익/손실</span>
          <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"><i class="fas fa-trending-up text-red-500 text-sm"></i></div>
        </div>
        <div class="text-2xl font-black" id="dash-total-profit">-</div>
        <div class="text-xs text-slate-400 mt-1" id="dash-profit-rate">수익률 계산 중</div>
      </div>
      <div class="stat-card">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500">잡초 종목</span>
          <div class="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center"><i class="fas fa-exclamation-triangle text-orange-500 text-sm"></i></div>
        </div>
        <div class="text-2xl font-black text-orange-500" id="dash-weed-count">-</div>
        <div class="text-xs text-slate-400 mt-1">정리 검토 필요 종목</div>
      </div>
    </div>

    <!-- 보유 종목 현황 + 이평선 신호 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

      <!-- 보유 종목 현황 -->
      <div class="lg:col-span-2 card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <i class="fas fa-briefcase text-blue-500"></i> 보유 종목 현황
          </h2>
          <button onclick="showSection('master')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">관리하기 →</button>
        </div>
        <div id="dash-stock-list">
          <div class="empty-state"><i class="fas fa-seedling block"></i><p class="font-medium">아직 종목이 없어요</p><p class="text-sm mt-1">마스터 데이터에서 종목을 추가하세요</p></div>
        </div>
      </div>

      <!-- 이평선 알림 -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
            <i class="fas fa-bell text-amber-500"></i> 이번 달 신호
          </h2>
          <button onclick="showSection('signal')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">상세 →</button>
        </div>
        <div id="dash-signal-list">
          <div class="empty-state"><i class="fas fa-chart-line block"></i><p class="font-medium text-sm">신호 없음</p><p class="text-xs mt-1">10이평선 데이터를 입력하세요</p></div>
        </div>
      </div>
    </div>

    <!-- 현금흐름 요약 -->
    <div class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-slate-800 flex items-center gap-2">
          <i class="fas fa-wallet text-green-500"></i> 월간 투자 계획 요약
        </h2>
        <button onclick="showSection('cashflow')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">관리하기 →</button>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4" id="dash-cashflow-summary">
        <div class="bg-slate-50 rounded-12 p-4 rounded-xl">
          <div class="text-xs text-slate-500 mb-1">월 총 이체금액</div>
          <div class="text-lg font-bold text-slate-800" id="dash-monthly-total">-</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-4">
          <div class="text-xs text-slate-500 mb-1">연간 투자 예상</div>
          <div class="text-lg font-bold text-slate-800" id="dash-annual-total">-</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-4">
          <div class="text-xs text-slate-500 mb-1">투자 종목 수</div>
          <div class="text-lg font-bold text-slate-800" id="dash-stock-count">-</div>
        </div>
        <div class="bg-slate-50 rounded-xl p-4">
          <div class="text-xs text-slate-500 mb-1">중단 검토 종목</div>
          <div class="text-lg font-bold text-orange-500" id="dash-stop-count">-</div>
        </div>
      </div>
    </div>

  </section>


  <!-- ============================= -->
  <!-- 섹션 2: 마스터 데이터 -->
  <!-- ============================= -->
  <section id="section-master" class="section fade-in">

    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-seedling text-blue-500"></i> 마스터 데이터</h2>
        <p class="text-sm text-slate-500 mt-0.5">보유 중인 주식/ETF를 모두 등록하고 관리해요</p>
      </div>
      <button onclick="openAddModal()" class="btn-primary flex items-center gap-2">
        <i class="fas fa-plus"></i> 종목 추가
      </button>
    </div>

    <!-- 잡초 안내 배너 -->
    <div class="bg-amber-50 border border-amber-200 rounded-14 p-4 mb-5 rounded-xl flex items-start gap-3">
      <div class="text-2xl mt-0.5">🌿</div>
      <div>
        <div class="font-bold text-amber-800 text-sm">잡초 판별이란?</div>
        <div class="text-amber-700 text-xs mt-1 leading-relaxed">
          수익률이 <strong>-20% 이하</strong>이거나 수익 전망이 없는 종목을 <strong class="text-red-600">잡초</strong>로 분류해요.<br>
          잡초 종목은 포트폴리오의 건강을 해치므로 정리를 검토하세요.
          개별 주식은 월봉 10이평선 전략 <strong>적용 불가</strong> 종목으로 따로 관리가 필요해요.
        </div>
      </div>
    </div>

    <!-- 테이블 -->
    <div class="card">
      <div class="p-5 border-b border-slate-100 flex items-center justify-between">
        <h3 class="font-bold text-slate-700 text-sm">보유 종목 목록</h3>
        <div class="flex gap-2 items-center">
          <select id="filterBroker" onchange="renderMasterTable()" class="text-xs py-1.5 px-3 text-slate-600">
            <option value="">전체 증권사</option>
          </select>
          <select id="filterType" onchange="renderMasterTable()" class="text-xs py-1.5 px-3 text-slate-600">
            <option value="">전체 종류</option>
            <option value="시장지수ETF">시장지수ETF</option>
            <option value="개별주식">개별주식</option>
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>증권사/앱</th>
              <th>종목명</th>
              <th>종류</th>
              <th class="tooltip" data-tip="내가 매수한 평균 가격">평균매수단가</th>
              <th class="tooltip" data-tip="오늘 현재 주가 (직접 입력)">현재주가</th>
              <th>보유수량</th>
              <th class="tooltip" data-tip="평단가 × 수량">총투자원금</th>
              <th class="tooltip" data-tip="현재가 × 수량">현재평가금액</th>
              <th class="tooltip" data-tip="(평가금액 - 투자원금) / 투자원금 × 100">수익률(%)</th>
              <th class="tooltip" data-tip="-20% 이하 또는 전망없는 종목">잡초판별</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody id="masterTableBody">
            <tr><td colspan="11"><div class="empty-state"><i class="fas fa-seedling block"></i><p>아직 종목이 없어요. 위의 "종목 추가" 버튼을 눌러주세요!</p></div></td></tr>
          </tbody>
        </table>
      </div>
      <!-- 합계 행 -->
      <div class="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div class="text-xs text-slate-500">총 투자 원금 합계</div>
            <div class="text-base font-bold text-slate-800" id="master-sum-invest">₩0</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">현재 평가금액 합계</div>
            <div class="text-base font-bold text-slate-800" id="master-sum-eval">₩0</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">전체 수익/손실</div>
            <div class="text-base font-bold" id="master-sum-profit">₩0</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">전체 수익률</div>
            <div class="text-base font-bold" id="master-sum-rate">0%</div>
          </div>
        </div>
      </div>
    </div>

  </section>


  <!-- ============================= -->
  <!-- 섹션 3: 10이평선 통제탑 -->
  <!-- ============================= -->
  <section id="section-signal" class="section fade-in">

    <div class="mb-5">
      <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-chart-line text-blue-500"></i> 10이평선 통제탑</h2>
      <p class="text-sm text-slate-500 mt-0.5">월봉 10이평선 기준으로 매수/매도 시점을 파악해요</p>
    </div>

    <!-- 전략 설명 배너 -->
    <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
      <div class="flex items-start gap-3">
        <div class="text-3xl">📊</div>
        <div class="flex-1">
          <div class="font-bold text-blue-800 mb-2">월봉 10이평선 전략이란?</div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div class="bg-white rounded-lg p-3 border border-blue-100">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-lg">🟢</span>
                <span class="font-bold text-green-700 text-sm">상승장 (현재가 &gt; 10이평선)</span>
              </div>
              <div class="text-xs text-slate-600 leading-relaxed">이번 달 말일 종가가 10개월 이동평균선 <strong>위</strong>에 있으면 → <strong class="text-green-700">계속 모으기</strong><br>정기적으로 ETF를 사들이는 시기예요</div>
            </div>
            <div class="bg-white rounded-lg p-3 border border-blue-100">
              <div class="flex items-center gap-2 mb-1.5">
                <span class="text-lg">🔴</span>
                <span class="font-bold text-red-700 text-sm">하락장 (현재가 &lt; 10이평선)</span>
              </div>
              <div class="text-xs text-slate-600 leading-relaxed">이번 달 말일 종가가 10개월 이동평균선 <strong>아래</strong>로 내려가면 → <strong class="text-red-700">매수 중단</strong><br>시장이 위험하니 신규 매수를 멈추세요</div>
            </div>
          </div>
          <div class="mt-3 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
            <div class="text-xs text-amber-800 flex items-start gap-1.5">
              <i class="fas fa-exclamation-triangle mt-0.5"></i>
              <span><strong>주의:</strong> 이 전략은 <strong>시장지수 ETF(SPY, QQQ 등)에만 적용</strong>해요. 삼성전자, 카카오 같은 개별 주식은 이 전략이 맞지 않아요!</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 이평선 테이블 -->
    <div class="card">
      <div class="p-5 border-b border-slate-100">
        <h3 class="font-bold text-slate-700 text-sm">📅 이번 달 이평선 현황 <span class="text-xs font-normal text-slate-400 ml-2">말일 종가와 10이평선 가격을 직접 입력하세요</span></h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>종목명</th>
              <th>종류 확인</th>
              <th>전략 적용 여부</th>
              <th class="tooltip" data-tip="이번 달 마지막 거래일 종가">이번달 말일 종가</th>
              <th class="tooltip" data-tip="최근 10개월 종가의 평균값">10개월 이동평균선</th>
              <th>시장 상태</th>
              <th>나의 행동 지침</th>
            </tr>
          </thead>
          <tbody id="signalTableBody">
            <tr><td colspan="7"><div class="empty-state"><i class="fas fa-chart-line block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>

  </section>


  <!-- ============================= -->
  <!-- 섹션 4: 현금흐름 통제소 -->
  <!-- ============================= -->
  <section id="section-cashflow" class="section fade-in">

    <div class="mb-5">
      <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-wallet text-green-500"></i> 현금흐름 통제소</h2>
      <p class="text-sm text-slate-500 mt-0.5">자동투자 주기와 금액을 관리해서 낭비를 막아요</p>
    </div>

    <!-- 투자 계획 설명 -->
    <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
      <div class="flex items-start gap-3">
        <div class="text-2xl">💰</div>
        <div>
          <div class="font-bold text-green-800 text-sm mb-1">현금흐름 통제소 사용법</div>
          <div class="text-green-700 text-xs leading-relaxed">
            각 종목에 대해 <strong>자동투자 주기</strong>(매일/매주/매월/안함)와 <strong>1회 투자금액</strong>을 입력하면,<br>
            월별 총 이체 금액과 연간 낭비/투자 예상 금액을 자동으로 계산해줘요.
          </div>
        </div>
      </div>
    </div>

    <!-- 현금흐름 테이블 -->
    <div class="card">
      <div class="p-5 border-b border-slate-100">
        <h3 class="font-bold text-slate-700 text-sm">💳 자동투자 계획 목록</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>증권사/앱</th>
              <th>종목명</th>
              <th class="tooltip" data-tip="매일/매주/매월/안함 중 선택">자동투자 주기</th>
              <th class="tooltip" data-tip="1번 투자할 때 들어가는 금액">1회 투자금액</th>
              <th class="tooltip" data-tip="주기에 따라 자동계산 (매일×20, 매주×4, 매월×1)">월별 총 이체금액</th>
              <th class="tooltip" data-tip="월별금액 × 12개월">연간 투자 예상</th>
              <th class="tooltip" data-tip="이 투자를 계속할지 결정">통제 결정</th>
            </tr>
          </thead>
          <tbody id="cashflowTableBody">
            <tr><td colspan="7"><div class="empty-state"><i class="fas fa-wallet block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>
          </tbody>
        </table>
      </div>
      <!-- 합계 -->
      <div class="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <div class="text-xs text-slate-500">월 총 이체금액 합계</div>
            <div class="text-lg font-bold text-green-700" id="cf-monthly-sum">₩0</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">연간 투자 예상 합계</div>
            <div class="text-lg font-bold text-slate-800" id="cf-annual-sum">₩0</div>
          </div>
          <div>
            <div class="text-xs text-slate-500">중단 검토 종목</div>
            <div class="text-lg font-bold text-orange-500" id="cf-stop-count">0개</div>
          </div>
        </div>
      </div>
    </div>

  </section>


  <!-- ============================= -->
  <!-- 섹션 5: 사용 가이드 -->
  <!-- ============================= -->
  <section id="section-guide" class="section fade-in">

    <div class="mb-5">
      <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-book-open text-purple-500"></i> 사용 가이드 & 매뉴얼</h2>
      <p class="text-sm text-slate-500 mt-0.5">주린이도 쉽게 따라할 수 있는 단계별 안내서</p>
    </div>

    <!-- 핵심 원칙 -->
    <div class="card p-6 mb-5">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-star text-amber-500"></i> 핵심 투자 원칙 3가지</h3>
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div class="text-3xl mb-2">🌊</div>
          <div class="font-bold text-blue-800 mb-1">원칙 1: 시장을 이기려 하지 마세요</div>
          <div class="text-blue-700 text-xs leading-relaxed">개별 주식 대신 시장 전체를 담는 ETF(SPY, QQQ)에 집중하세요. 워런 버핏도 추천하는 방법이에요.</div>
        </div>
        <div class="bg-green-50 rounded-xl p-4 border border-green-100">
          <div class="text-3xl mb-2">📅</div>
          <div class="font-bold text-green-800 mb-1">원칙 2: 꾸준히, 정기적으로</div>
          <div class="text-green-700 text-xs leading-relaxed">매달 같은 날 같은 금액을 투자하세요. 가격이 쌀 때 더 많이 사지게 되는 마법이 생겨요 (적립식 투자).</div>
        </div>
        <div class="bg-red-50 rounded-xl p-4 border border-red-100">
          <div class="text-3xl mb-2">🛑</div>
          <div class="font-bold text-red-800 mb-1">원칙 3: 하락장엔 멈추세요</div>
          <div class="text-red-700 text-xs leading-relaxed">월봉이 10이평선 아래로 내려가면 매수를 멈추세요. 하락장에 계속 사면 손실이 더 커질 수 있어요.</div>
        </div>
      </div>
    </div>

    <!-- 주간/월간 루틴 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

      <div class="card p-6">
        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-calendar-week text-blue-500"></i> 📅 월간 루틴 (매월 말일)</h3>
        <div class="space-y-3">
          <div class="flex items-start gap-3">
            <div class="step-num">1</div>
            <div>
              <div class="font-semibold text-slate-700 text-sm">현재가 업데이트</div>
              <div class="text-xs text-slate-500 mt-0.5">마스터 데이터에서 보유 종목의 "현재주가"를 오늘 주가로 업데이트해요</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="step-num">2</div>
            <div>
              <div class="font-semibold text-slate-700 text-sm">말일 종가 확인</div>
              <div class="text-xs text-slate-500 mt-0.5">이번 달 마지막 거래일의 종가를 증권사 앱에서 확인해요 (SPY, QQQ 등)</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="step-num">3</div>
            <div>
              <div class="font-semibold text-slate-700 text-sm">10이평선 가격 입력</div>
              <div class="text-xs text-slate-500 mt-0.5">"10이평선 통제탑"에 이번달 말일 종가와 10개월 이동평균 가격을 입력해요</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="step-num">4</div>
            <div>
              <div class="font-semibold text-slate-700 text-sm">행동 지침 확인</div>
              <div class="text-xs text-slate-500 mt-0.5">🟢 상승장이면 계속 모으기, 🔴 하락장이면 매수 중단</div>
            </div>
          </div>
          <div class="flex items-start gap-3">
            <div class="step-num">5</div>
            <div>
              <div class="font-semibold text-slate-700 text-sm">잡초 점검</div>
              <div class="text-xs text-slate-500 mt-0.5">수익률 -20% 이하 종목(잡초)은 정리 여부를 검토해요</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card p-6">
        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-question-circle text-purple-500"></i> ❓ 자주 묻는 질문</h3>
        <div class="space-y-4">
          <div class="border-b border-slate-100 pb-3">
            <div class="font-semibold text-slate-700 text-sm mb-1">Q. 10이평선 가격은 어디서 찾나요?</div>
            <div class="text-xs text-slate-500 leading-relaxed">네이버 증권이나 증권사 앱에서 해당 ETF를 검색 → 차트 → 이동평균선 설정에서 10개월(월봉) 이평선 가격을 확인해요.</div>
          </div>
          <div class="border-b border-slate-100 pb-3">
            <div class="font-semibold text-slate-700 text-sm mb-1">Q. 잡초는 무조건 팔아야 하나요?</div>
            <div class="text-xs text-slate-500 leading-relaxed">아니에요! 잡초 판별은 참고용이에요. -20% 이하라도 기업의 미래 전망이 좋다면 보유할 수 있어요. 단, 포트폴리오 전체 건강을 점검하는 기회로 삼으세요.</div>
          </div>
          <div class="border-b border-slate-100 pb-3">
            <div class="font-semibold text-slate-700 text-sm mb-1">Q. 개별주식도 이 전략으로 관리하나요?</div>
            <div class="text-xs text-slate-500 leading-relaxed">월봉 10이평선 전략은 ETF 전용이에요. 개별 주식(삼성전자, 카카오 등)은 "전략 적용 불가"로 표시되며, 별도 기준으로 관리해야 해요.</div>
          </div>
          <div>
            <div class="font-semibold text-slate-700 text-sm mb-1">Q. 평균매수단가(평단가)란 무엇인가요?</div>
            <div class="text-xs text-slate-500 leading-relaxed">여러 번 나눠서 샀을 때 평균 매수 가격이에요. 예: 100원에 10주 + 120원에 10주 = 평단가 110원</div>
          </div>
        </div>
      </div>

    </div>

    <!-- 용어 설명 -->
    <div class="card p-6 mb-5">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-book text-indigo-500"></i> 📖 주요 용어 설명</h3>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-xs flex-shrink-0">ETF</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">ETF (상장지수펀드)</div>
            <div class="text-xs text-slate-500 mt-0.5">여러 주식을 한번에 담은 바구니. SPY는 미국 500대 기업, QQQ는 미국 기술주 100개를 담고 있어요.</div>
          </div>
        </div>
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-xs flex-shrink-0">MA</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">이동평균선 (이평선)</div>
            <div class="text-xs text-slate-500 mt-0.5">일정 기간의 주가를 평균낸 선. 10이평선은 최근 10개월 종가의 평균이에요.</div>
          </div>
        </div>
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600 font-bold text-xs flex-shrink-0">평단</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">평균매수단가 (평단가)</div>
            <div class="text-xs text-slate-500 mt-0.5">내가 이 주식을 평균적으로 얼마에 샀는지 보여주는 가격이에요.</div>
          </div>
        </div>
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-bold text-xs flex-shrink-0">잡초</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">잡초 종목</div>
            <div class="text-xs text-slate-500 mt-0.5">수익률이 -20% 이하이거나 전망이 없는 종목. 포트폴리오를 갉아먹는 잡초처럼 주기적으로 정리해요.</div>
          </div>
        </div>
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600 font-bold text-xs flex-shrink-0">하락</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">하락장</div>
            <div class="text-xs text-slate-500 mt-0.5">현재 주가가 10이평선 아래에 있는 상태. 하락 추세이므로 새로 사지 않고 기다려요.</div>
          </div>
        </div>
        <div class="flex gap-3 p-3 bg-slate-50 rounded-xl">
          <div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-bold text-xs flex-shrink-0">상승</div>
          <div>
            <div class="font-semibold text-slate-700 text-xs">상승장</div>
            <div class="text-xs text-slate-500 mt-0.5">현재 주가가 10이평선 위에 있는 상태. 상승 추세이므로 꾸준히 모아가는 시기예요.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 워크플로우 다이어그램 -->
    <div class="card p-6">
      <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-route text-teal-500"></i> 🔄 매월 워크플로우</h3>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <div class="flex flex-col items-center p-3 bg-blue-50 rounded-xl border border-blue-200 text-center w-28">
          <div class="text-2xl mb-1">📊</div>
          <div class="text-xs font-bold text-blue-800">1. 현재가 입력</div>
          <div class="text-xs text-blue-600 mt-0.5">마스터 데이터</div>
        </div>
        <div class="text-slate-300 text-2xl">→</div>
        <div class="flex flex-col items-center p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-center w-28">
          <div class="text-2xl mb-1">📈</div>
          <div class="text-xs font-bold text-indigo-800">2. 이평선 확인</div>
          <div class="text-xs text-indigo-600 mt-0.5">10이평선 통제탑</div>
        </div>
        <div class="text-slate-300 text-2xl">→</div>
        <div class="flex flex-col items-center p-3 bg-green-50 rounded-xl border border-green-200 text-center w-28">
          <div class="text-2xl mb-1">✅</div>
          <div class="text-xs font-bold text-green-800">3. 행동 결정</div>
          <div class="text-xs text-green-600 mt-0.5">모으기/중단</div>
        </div>
        <div class="text-slate-300 text-2xl">→</div>
        <div class="flex flex-col items-center p-3 bg-amber-50 rounded-xl border border-amber-200 text-center w-28">
          <div class="text-2xl mb-1">🌿</div>
          <div class="text-xs font-bold text-amber-800">4. 잡초 점검</div>
          <div class="text-xs text-amber-600 mt-0.5">손실 종목 정리</div>
        </div>
        <div class="text-slate-300 text-2xl">→</div>
        <div class="flex flex-col items-center p-3 bg-purple-50 rounded-xl border border-purple-200 text-center w-28">
          <div class="text-2xl mb-1">💳</div>
          <div class="text-xs font-bold text-purple-800">5. 현금흐름 조정</div>
          <div class="text-xs text-purple-600 mt-0.5">현금흐름 통제소</div>
        </div>
      </div>
    </div>

  </section>

</main>


<!-- ============================= -->
<!-- 모달: 종목 추가/수정 -->
<!-- ============================= -->
<div id="addModal" class="modal-bg" style="display:none;" onclick="closeModalOnBg(event)">
  <div class="modal-box" onclick="event.stopPropagation()">
    <div class="flex items-center justify-between mb-5">
      <h3 class="text-lg font-black text-slate-800" id="modalTitle">📌 종목 추가</h3>
      <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
    </div>

    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">증권사/앱 이름 <span class="text-red-500">*</span></label>
          <input type="text" id="input-broker" placeholder="예: 토스, 키움증권" class="w-full" />
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">주식/ETF 이름 <span class="text-red-500">*</span></label>
          <input type="text" id="input-name" placeholder="예: SPY, 삼성전자" class="w-full" />
        </div>
      </div>

      <div>
        <label class="text-xs font-semibold text-slate-600 mb-1 block">종류 <span class="text-red-500">*</span></label>
        <select id="input-type" class="w-full">
          <option value="">선택하세요</option>
          <option value="시장지수ETF">시장지수ETF (SPY, QQQ, KODEX200 등)</option>
          <option value="개별주식">개별주식 (삼성전자, 카카오 등)</option>
        </select>
        <div class="mt-1.5 text-xs text-slate-400">💡 ETF는 월봉 10이평선 전략 적용 가능, 개별주식은 적용 불가</div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">평균매수단가 <span class="text-red-500">*</span></label>
          <input type="number" id="input-avgprice" placeholder="예: 520" class="w-full" min="0" />
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">현재주가 <span class="text-red-500">*</span></label>
          <input type="number" id="input-curprice" placeholder="예: 580" class="w-full" min="0" />
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">보유수량 <span class="text-red-500">*</span></label>
          <input type="number" id="input-qty" placeholder="예: 10" class="w-full" min="0" />
        </div>
      </div>

      <div class="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
        <div class="grid grid-cols-3 gap-2">
          <div>총 투자원금 = <strong id="calc-invest" class="text-slate-700">-</strong></div>
          <div>현재평가금액 = <strong id="calc-eval" class="text-slate-700">-</strong></div>
          <div>수익률 = <strong id="calc-rate" class="text-slate-700">-</strong></div>
        </div>
      </div>

      <input type="hidden" id="edit-index" value="-1" />
    </div>

    <div class="flex gap-3 mt-6">
      <button onclick="closeModal()" class="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">취소</button>
      <button onclick="saveStock()" class="flex-1 btn-primary py-2.5 rounded-xl">저장</button>
    </div>
  </div>
</div>


<!-- ============================= -->
<!-- JavaScript -->
<!-- ============================= -->
<script>
// ===========================
// 데이터 저장소 (LocalStorage)
// ===========================
const STORAGE_KEY = 'jujini_data_v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultData();
    return JSON.parse(raw);
  } catch(e) { return getDefaultData(); }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDefaultData() {
  return {
    stocks: [
      { broker:'토스', name:'SPY', type:'시장지수ETF', avgPrice:520, curPrice:580, qty:10, monthEndPrice:580, ma10:550, cfCycle:'매월', cfAmount:50000, cfDecision:'계속' },
      { broker:'키움증권', name:'QQQ', type:'시장지수ETF', avgPrice:450, curPrice:490, qty:5, monthEndPrice:490, ma10:470, cfCycle:'매주', cfAmount:10000, cfDecision:'계속' },
      { broker:'미니스탁', name:'삼성전자', type:'개별주식', avgPrice:72000, curPrice:55000, qty:20, monthEndPrice:55000, ma10:0, cfCycle:'매일', cfAmount:5000, cfDecision:'중단검토' },
      { broker:'토스', name:'카카오', type:'개별주식', avgPrice:55000, curPrice:35000, qty:10, monthEndPrice:35000, ma10:0, cfCycle:'매월', cfAmount:30000, cfDecision:'중단검토' },
      { broker:'키움증권', name:'테슬라', type:'개별주식', avgPrice:280, curPrice:180, qty:3, monthEndPrice:180, ma10:0, cfCycle:'안함', cfAmount:0, cfDecision:'중단검토' }
    ]
  };
}

let appData = loadData();

// ===========================
// 네비게이션
// ===========================
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => { t.classList.remove('active'); t.classList.add('text-blue-200'); t.classList.remove('text-white'); });
  
  const sec = document.getElementById('section-' + name);
  const tab = document.getElementById('tab-' + name);
  if (sec) sec.classList.add('active');
  if (tab) { tab.classList.add('active'); tab.classList.remove('text-blue-200'); tab.classList.add('text-white'); }
  
  renderAll();
}

// ===========================
// 유틸리티
// ===========================
function fmtNum(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '-';
  return Number(n).toLocaleString('ko-KR');
}

function fmtWon(n) {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '-';
  const abs = Math.abs(Number(n));
  if (abs >= 100000000) return (n < 0 ? '-' : '') + (abs/100000000).toFixed(1) + '억';
  if (abs >= 10000) return (n < 0 ? '-' : '') + (abs/10000).toFixed(1) + '만';
  return '₩' + Number(n).toLocaleString('ko-KR');
}

function fmtRate(r) {
  if (r === null || r === undefined || r === '' || isNaN(r)) return '-';
  const v = Number(r);
  const sign = v >= 0 ? '+' : '';
  return sign + v.toFixed(2) + '%';
}

function calcStock(s) {
  const invest = (s.avgPrice || 0) * (s.qty || 0);
  const eval_ = (s.curPrice || 0) * (s.qty || 0);
  const profit = eval_ - invest;
  const rate = invest > 0 ? (profit / invest * 100) : 0;
  return { invest, eval: eval_, profit, rate };
}

function getWeed(s) {
  const { rate, invest } = calcStock(s);
  if (invest <= 0) return 'neutral';
  if (rate <= -20) return 'yes';
  if (rate <= -10) return 'caution';
  return 'no';
}

function getSignal(s) {
  if (s.type !== '시장지수ETF') return null;
  if (!s.monthEndPrice || !s.ma10 || s.ma10 === 0) return null;
  return s.monthEndPrice > s.ma10 ? 'bull' : 'bear';
}

// ===========================
// 대시보드 렌더링
// ===========================
function renderDashboard() {
  const stocks = appData.stocks;

  // 날짜
  const now = new Date();
  document.getElementById('headerDate').textContent = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';

  // 합계
  let totalInvest = 0, totalEval = 0;
  let weedCount = 0;
  stocks.forEach(s => {
    const c = calcStock(s);
    totalInvest += c.invest;
    totalEval += c.eval;
    if (getWeed(s) === 'yes') weedCount++;
  });
  const totalProfit = totalEval - totalInvest;
  const totalRate = totalInvest > 0 ? (totalProfit / totalInvest * 100) : 0;

  document.getElementById('dash-total-invest').textContent = '₩' + fmtNum(totalInvest);
  document.getElementById('dash-total-eval').textContent = '₩' + fmtNum(totalEval);
  const profitEl = document.getElementById('dash-total-profit');
  profitEl.textContent = (totalProfit >= 0 ? '+' : '') + '₩' + fmtNum(Math.abs(totalProfit));
  profitEl.className = 'text-2xl font-black ' + (totalProfit >= 0 ? 'profit' : 'loss');
  document.getElementById('dash-profit-rate').textContent = fmtRate(totalRate);
  document.getElementById('dash-weed-count').textContent = weedCount + '개';
  document.getElementById('headerSummary').textContent = (totalRate >= 0 ? '▲ ' : '▼ ') + Math.abs(totalRate).toFixed(1) + '%';

  // 보유종목 리스트
  const listEl = document.getElementById('dash-stock-list');
  if (stocks.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><i class="fas fa-seedling block"></i><p class="font-medium">아직 종목이 없어요</p><p class="text-sm mt-1">마스터 데이터에서 종목을 추가하세요</p></div>';
  } else {
    listEl.innerHTML = '<div class="space-y-2">' + stocks.map((s, i) => {
      const c = calcStock(s);
      const weed = getWeed(s);
      const rateStr = fmtRate(c.rate);
      const profitStr = (c.profit >= 0 ? '+' : '') + '₩' + fmtNum(Math.abs(c.profit));
      return \`<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
        <div class="flex items-center gap-2 min-w-0">
          <div class="w-7 h-7 rounded-lg \${s.type==='시장지수ETF'?'bg-blue-100 text-blue-600':'bg-slate-100 text-slate-500'} flex items-center justify-center text-xs font-bold flex-shrink-0">
            \${s.name.substring(0,2)}
          </div>
          <div class="min-w-0">
            <div class="font-semibold text-slate-700 text-sm truncate">\${s.name}</div>
            <div class="text-xs text-slate-400">\${s.broker}</div>
          </div>
        </div>
        <div class="text-right flex-shrink-0 ml-2">
          <div class="text-sm font-bold \${c.profit >= 0 ? 'profit' : 'loss'}">\${rateStr}</div>
          <div class="text-xs \${c.profit >= 0 ? 'text-red-400' : 'text-blue-400'}">\${profitStr}</div>
        </div>
        \${weed==='yes'?'<span class="weed-yes ml-2 flex-shrink-0">🌿잡초</span>':''}
      </div>\`;
    }).join('') + '</div>';
  }

  // 이평선 신호 리스트
  const sigEl = document.getElementById('dash-signal-list');
  const etfs = stocks.filter(s => s.type === '시장지수ETF' && s.ma10 > 0);
  if (etfs.length === 0) {
    sigEl.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line block" style="font-size:32px;"></i><p class="text-sm font-medium mt-2">ETF 이평선 데이터를<br>입력해주세요</p></div>';
  } else {
    sigEl.innerHTML = '<div class="space-y-3">' + etfs.map(s => {
      const sig = getSignal(s);
      const isBull = sig === 'bull';
      return \`<div class="p-3 rounded-xl \${isBull?'bg-red-50 border border-red-100':'bg-blue-50 border border-blue-100'}">
        <div class="flex items-center justify-between">
          <div class="font-bold text-sm \${isBull?'text-red-700':'text-blue-700'}">\${s.name}</div>
          <span class="\${isBull?'bull-market':'bear-market'}">\${isBull?'🟢 상승장':'🔴 하락장'}</span>
        </div>
        <div class="text-xs mt-1.5 \${isBull?'text-red-600':'text-blue-600'} font-semibold">
          \${isBull?'✅ 계속 모으기':'🛑 매수 중단'}
        </div>
        <div class="text-xs text-slate-400 mt-0.5">\${fmtNum(s.monthEndPrice)} vs 이평 \${fmtNum(s.ma10)}</div>
      </div>\`;
    }).join('') + '</div>';
  }

  // 현금흐름 요약
  let monthlyTotal = 0, annualTotal = 0, stopCount = 0;
  stocks.forEach(s => {
    const monthly = calcMonthly(s);
    monthlyTotal += monthly;
    annualTotal += monthly * 12;
    if (s.cfDecision === '중단검토' || s.cfCycle === '안함') stopCount++;
  });
  document.getElementById('dash-monthly-total').textContent = '₩' + fmtNum(monthlyTotal);
  document.getElementById('dash-annual-total').textContent = '₩' + fmtNum(annualTotal);
  document.getElementById('dash-stock-count').textContent = stocks.length + '개';
  document.getElementById('dash-stop-count').textContent = stopCount + '개';
}

// ===========================
// 마스터 데이터 렌더링
// ===========================
function renderMasterTable() {
  const filterBroker = document.getElementById('filterBroker').value;
  const filterType = document.getElementById('filterType').value;

  // 브로커 필터 옵션 업데이트
  const brokerSel = document.getElementById('filterBroker');
  const brokers = [...new Set(appData.stocks.map(s => s.broker))];
  const curBroker = brokerSel.value;
  brokerSel.innerHTML = '<option value="">전체 증권사</option>' + brokers.map(b => \`<option value="\${b}" \${curBroker===b?'selected':''}>\${b}</option>\`).join('');

  let filtered = appData.stocks;
  if (filterBroker) filtered = filtered.filter(s => s.broker === filterBroker);
  if (filterType) filtered = filtered.filter(s => s.type === filterType);

  const tbody = document.getElementById('masterTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fas fa-seedling block"></i><p>조건에 맞는 종목이 없어요</p></div></td></tr>';
  } else {
    tbody.innerHTML = filtered.map(s => {
      const idx = appData.stocks.indexOf(s);
      const c = calcStock(s);
      const weed = getWeed(s);
      const weedBadge = weed === 'yes' ? '<span class="weed-yes">🌿 잡초</span>'
        : weed === 'caution' ? '<span class="weed-caution">⚠️ 주의</span>'
        : '<span class="weed-no">✅ 양호</span>';
      const rateClass = c.rate >= 0 ? 'profit' : 'loss';
      return \`<tr>
        <td><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-lg">\${s.broker}</span></td>
        <td>
          <div class="font-bold text-slate-800">\${s.name}</div>
          <div class="text-xs text-slate-400">\${s.type==='시장지수ETF'?'📈 ETF':'📌 개별주'}</div>
        </td>
        <td><span class="text-xs px-2 py-1 rounded-lg \${s.type==='시장지수ETF'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600'}">\${s.type}</span></td>
        <td class="font-semibold text-slate-700">\${fmtNum(s.avgPrice)}</td>
        <td>
          <input type="number" value="\${s.curPrice}" onchange="updateCurPrice(\${idx}, this.value)"
            class="w-24 text-sm font-semibold" min="0" placeholder="현재가 입력" />
        </td>
        <td class="text-slate-700">\${fmtNum(s.qty)}</td>
        <td class="text-slate-700">₩\${fmtNum(c.invest)}</td>
        <td class="text-slate-700">₩\${fmtNum(c.eval)}</td>
        <td class="\${rateClass} text-sm">\${fmtRate(c.rate)}</td>
        <td>\${weedBadge}</td>
        <td>
          <div class="flex gap-1.5">
            <button onclick="openEditModal(\${idx})" class="btn-secondary text-xs py-1.5 px-3">수정</button>
            <button onclick="deleteStock(\${idx})" class="btn-danger text-xs py-1.5 px-3">삭제</button>
          </div>
        </td>
      </tr>\`;
    }).join('');
  }

  // 합계
  let sumInvest = 0, sumEval = 0;
  appData.stocks.forEach(s => {
    const c = calcStock(s);
    sumInvest += c.invest;
    sumEval += c.eval;
  });
  const sumProfit = sumEval - sumInvest;
  const sumRate = sumInvest > 0 ? (sumProfit / sumInvest * 100) : 0;
  document.getElementById('master-sum-invest').textContent = '₩' + fmtNum(sumInvest);
  document.getElementById('master-sum-eval').textContent = '₩' + fmtNum(sumEval);
  const pEl = document.getElementById('master-sum-profit');
  pEl.textContent = (sumProfit >= 0 ? '+' : '') + '₩' + fmtNum(Math.abs(sumProfit));
  pEl.className = 'text-base font-bold ' + (sumProfit >= 0 ? 'profit' : 'loss');
  const rEl = document.getElementById('master-sum-rate');
  rEl.textContent = fmtRate(sumRate);
  rEl.className = 'text-base font-bold ' + (sumRate >= 0 ? 'profit' : 'loss');
}

function updateCurPrice(idx, val) {
  appData.stocks[idx].curPrice = parseFloat(val) || 0;
  saveData(appData);
  renderAll();
}

// ===========================
// 10이평선 통제탑 렌더링
// ===========================
function renderSignalTable() {
  const tbody = document.getElementById('signalTableBody');
  if (appData.stocks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-chart-line block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = appData.stocks.map((s, idx) => {
    const canApply = s.type === '시장지수ETF';
    const applyBadge = canApply
      ? '<span class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">✅ 적용 가능</span>'
      : '<span class="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-lg">⚠️ 적용 불가</span>';

    let stateHtml = '<span class="text-xs text-slate-400">-</span>';
    let actionHtml = '<span class="text-xs text-slate-400">-</span>';
    if (canApply && s.ma10 > 0 && s.monthEndPrice > 0) {
      const isBull = s.monthEndPrice > s.ma10;
      stateHtml = isBull
        ? '<span class="bull-market">🟢 상승장</span>'
        : '<span class="bear-market">🔴 하락장</span>';
      actionHtml = isBull
        ? '<span class="text-sm font-bold text-green-700">✅ 계속 모으기</span>'
        : '<span class="text-sm font-bold text-red-700">🛑 매수 중단</span>';
    } else if (!canApply) {
      actionHtml = '<span class="text-xs text-amber-600">개별주식 전략 별도 관리</span>';
    }

    return \`<tr>
      <td><div class="font-bold text-slate-800">\${s.name}</div><div class="text-xs text-slate-400">\${s.broker}</div></td>
      <td><span class="text-xs px-2 py-1 rounded-lg \${s.type==='시장지수ETF'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600'}">\${s.type}</span></td>
      <td>\${applyBadge}</td>
      <td>
        \${canApply
          ? \`<input type="number" value="\${s.monthEndPrice||''}" onchange="updateMonthEnd(\${idx}, this.value)"
              class="w-28 text-sm" placeholder="말일종가 입력" min="0" />\`
          : '<span class="text-xs text-slate-400">해당없음</span>'
        }
      </td>
      <td>
        \${canApply
          ? \`<input type="number" value="\${s.ma10||''}" onchange="updateMA10(\${idx}, this.value)"
              class="w-28 text-sm" placeholder="10이평선 입력" min="0" />\`
          : '<span class="text-xs text-slate-400">해당없음</span>'
        }
      </td>
      <td>\${stateHtml}</td>
      <td>\${actionHtml}</td>
    </tr>\`;
  }).join('');
}

function updateMonthEnd(idx, val) {
  appData.stocks[idx].monthEndPrice = parseFloat(val) || 0;
  saveData(appData);
  renderSignalTable();
  renderDashboard();
}

function updateMA10(idx, val) {
  appData.stocks[idx].ma10 = parseFloat(val) || 0;
  saveData(appData);
  renderSignalTable();
  renderDashboard();
}

// ===========================
// 현금흐름 통제소 렌더링
// ===========================
function calcMonthly(s) {
  const amt = s.cfAmount || 0;
  switch (s.cfCycle) {
    case '매일': return amt * 20;
    case '매주': return amt * 4;
    case '매월': return amt;
    default: return 0;
  }
}

function renderCashflowTable() {
  const tbody = document.getElementById('cashflowTableBody');
  if (appData.stocks.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-wallet block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>';
    return;
  }

  let monthlySum = 0, annualSum = 0, stopCount = 0;

  const rows = appData.stocks.map((s, idx) => {
    const monthly = calcMonthly(s);
    const annual = monthly * 12;
    monthlySum += monthly;
    annualSum += annual;
    if (s.cfDecision === '중단검토' || s.cfCycle === '안함') stopCount++;

    const decisionColor = s.cfDecision === '계속' ? 'text-green-700' : s.cfDecision === '중단검토' ? 'text-red-600' : 'text-slate-500';
    const decisionBg = s.cfDecision === '계속' ? 'bg-green-50 border-green-200' : s.cfDecision === '중단검토' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200';

    return \`<tr>
      <td><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-lg">\${s.broker}</span></td>
      <td><div class="font-bold text-slate-800">\${s.name}</div></td>
      <td>
        <select onchange="updateCfCycle(\${idx}, this.value)" class="text-sm">
          <option value="매일" \${s.cfCycle==='매일'?'selected':''}>📅 매일</option>
          <option value="매주" \${s.cfCycle==='매주'?'selected':''}>📆 매주</option>
          <option value="매월" \${s.cfCycle==='매월'?'selected':''}>🗓️ 매월</option>
          <option value="안함" \${s.cfCycle==='안함'?'selected':''}>🚫 안함</option>
        </select>
      </td>
      <td>
        <input type="number" value="\${s.cfAmount||0}" onchange="updateCfAmount(\${idx}, this.value)"
          class="w-28 text-sm" min="0" placeholder="금액 입력" />
      </td>
      <td class="font-semibold text-slate-800">₩\${fmtNum(monthly)}</td>
      <td class="text-slate-600">₩\${fmtNum(annual)}</td>
      <td>
        <select onchange="updateCfDecision(\${idx}, this.value)" class="text-sm \${decisionColor}">
          <option value="계속" \${s.cfDecision==='계속'?'selected':''}>✅ 계속</option>
          <option value="중단검토" \${s.cfDecision==='중단검토'?'selected':''}>🛑 중단검토</option>
          <option value="보류" \${s.cfDecision==='보류'?'selected':''}>⏸️ 보류</option>
        </select>
      </td>
    </tr>\`;
  }).join('');

  tbody.innerHTML = rows;

  // 합계
  document.getElementById('cf-monthly-sum').textContent = '₩' + fmtNum(monthlySum);
  document.getElementById('cf-annual-sum').textContent = '₩' + fmtNum(annualSum);
  document.getElementById('cf-stop-count').textContent = stopCount + '개';
}

function updateCfCycle(idx, val) {
  appData.stocks[idx].cfCycle = val;
  saveData(appData);
  renderCashflowTable();
  renderDashboard();
}

function updateCfAmount(idx, val) {
  appData.stocks[idx].cfAmount = parseInt(val) || 0;
  saveData(appData);
  renderCashflowTable();
  renderDashboard();
}

function updateCfDecision(idx, val) {
  appData.stocks[idx].cfDecision = val;
  saveData(appData);
  renderCashflowTable();
  renderDashboard();
}

// ===========================
// 모달
// ===========================
function openAddModal() {
  document.getElementById('modalTitle').textContent = '📌 종목 추가';
  document.getElementById('input-broker').value = '';
  document.getElementById('input-name').value = '';
  document.getElementById('input-type').value = '';
  document.getElementById('input-avgprice').value = '';
  document.getElementById('input-curprice').value = '';
  document.getElementById('input-qty').value = '';
  document.getElementById('edit-index').value = '-1';
  document.getElementById('calc-invest').textContent = '-';
  document.getElementById('calc-eval').textContent = '-';
  document.getElementById('calc-rate').textContent = '-';
  document.getElementById('addModal').style.display = 'flex';
}

function openEditModal(idx) {
  const s = appData.stocks[idx];
  document.getElementById('modalTitle').textContent = '✏️ 종목 수정';
  document.getElementById('input-broker').value = s.broker;
  document.getElementById('input-name').value = s.name;
  document.getElementById('input-type').value = s.type;
  document.getElementById('input-avgprice').value = s.avgPrice;
  document.getElementById('input-curprice').value = s.curPrice;
  document.getElementById('input-qty').value = s.qty;
  document.getElementById('edit-index').value = idx;
  updateCalcPreview();
  document.getElementById('addModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('addModal').style.display = 'none';
}

function closeModalOnBg(e) {
  if (e.target.id === 'addModal') closeModal();
}

function updateCalcPreview() {
  const avg = parseFloat(document.getElementById('input-avgprice').value) || 0;
  const cur = parseFloat(document.getElementById('input-curprice').value) || 0;
  const qty = parseFloat(document.getElementById('input-qty').value) || 0;
  const invest = avg * qty;
  const eval_ = cur * qty;
  const rate = invest > 0 ? ((eval_ - invest) / invest * 100) : 0;
  document.getElementById('calc-invest').textContent = invest > 0 ? '₩' + fmtNum(invest) : '-';
  document.getElementById('calc-eval').textContent = eval_ > 0 ? '₩' + fmtNum(eval_) : '-';
  const rEl = document.getElementById('calc-rate');
  rEl.textContent = invest > 0 ? fmtRate(rate) : '-';
  rEl.style.color = rate >= 0 ? '#dc2626' : '#2563eb';
}

['input-avgprice','input-curprice','input-qty'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateCalcPreview);
});

function saveStock() {
  const broker = document.getElementById('input-broker').value.trim();
  const name = document.getElementById('input-name').value.trim();
  const type = document.getElementById('input-type').value;
  const avgPrice = parseFloat(document.getElementById('input-avgprice').value);
  const curPrice = parseFloat(document.getElementById('input-curprice').value);
  const qty = parseFloat(document.getElementById('input-qty').value);
  const editIdx = parseInt(document.getElementById('edit-index').value);

  if (!broker || !name || !type || isNaN(avgPrice) || isNaN(curPrice) || isNaN(qty)) {
    alert('모든 항목을 입력해주세요!\\n\\n• 증권사/앱 이름\\n• 주식/ETF 이름\\n• 종류\\n• 평균매수단가\\n• 현재주가\\n• 보유수량');
    return;
  }

  const stock = {
    broker, name, type,
    avgPrice: parseFloat(avgPrice.toFixed(4)),
    curPrice: parseFloat(curPrice.toFixed(4)),
    qty,
    monthEndPrice: curPrice,
    ma10: 0,
    cfCycle: '매월',
    cfAmount: 0,
    cfDecision: '계속'
  };

  if (editIdx >= 0) {
    // 기존 값 보존
    const old = appData.stocks[editIdx];
    stock.monthEndPrice = old.monthEndPrice || curPrice;
    stock.ma10 = old.ma10 || 0;
    stock.cfCycle = old.cfCycle || '매월';
    stock.cfAmount = old.cfAmount || 0;
    stock.cfDecision = old.cfDecision || '계속';
    appData.stocks[editIdx] = stock;
  } else {
    appData.stocks.push(stock);
  }

  saveData(appData);
  closeModal();
  renderAll();
}

function deleteStock(idx) {
  const s = appData.stocks[idx];
  if (!confirm(\`"\${s.name}" 종목을 삭제할까요?\\n삭제하면 되돌릴 수 없어요.\`)) return;
  appData.stocks.splice(idx, 1);
  saveData(appData);
  renderAll();
}

// ===========================
// 전체 렌더링
// ===========================
function renderAll() {
  renderDashboard();
  renderMasterTable();
  renderSignalTable();
  renderCashflowTable();
}

// ===========================
// 초기화
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
});
</script>

</body>
</html>`;
}

export default app
