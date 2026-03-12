import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'

const app = new Hono()

app.use('/static/*', serveStatic({ root: './' }))

// ─── 설정 상수 (서버 → 클라이언트 주입용) ──────────────────────
const GOOGLE_CLIENT_ID    = '929289116665-742g30ko7mj47q5nke2g6h5vaa5t8ua9.apps.googleusercontent.com'
const SHEET_NAME_MASTER   = '마스터데이터'
const SHEET_NAME_SIGNAL   = '10이평선통제탑'
const SHEET_NAME_CASHFLOW = '현금흐름통제소'
const SPREADSHEET_TITLE   = '주린이 떡락방지'

app.get('/', (c) => c.html(getHTML()))

function getHTML(): string {
// 서버 변수를 JS 문자열로 안전하게 주입
const clientIdJson        = JSON.stringify(GOOGLE_CLIENT_ID)
const ssTitleJson         = JSON.stringify(SPREADSHEET_TITLE)
const shMasterJson        = JSON.stringify(SHEET_NAME_MASTER)
const shSignalJson        = JSON.stringify(SHEET_NAME_SIGNAL)
const shCashJson          = JSON.stringify(SHEET_NAME_CASHFLOW)

return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>주린이 떡락방지 📈</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css"/>
  <!-- Google Identity Services -->
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <!-- Google API Client -->
  <script src="https://apis.google.com/js/api.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&display=swap');
    *{font-family:'Noto Sans KR',sans-serif;}
    body{background:linear-gradient(135deg,#f0f4f8 0%,#e8edf3 50%,#f0f4f8 100%);min-height:100vh;}
    .header-gradient{background:linear-gradient(135deg,#1e3a5f 0%,#2d5a8e 40%,#3a7abf 100%);}
    .nav-tab{transition:all .25s;border-bottom:3px solid transparent;}
    .nav-tab.active{border-bottom:3px solid #60a5fa;color:#60a5fa;}
    .nav-tab:hover{background:rgba(255,255,255,.1);}
    .card{background:white;border-radius:16px;box-shadow:0 2px 20px rgba(0,0,0,.07);transition:box-shadow .2s;}
    .card:hover{box-shadow:0 4px 30px rgba(0,0,0,.12);}
    .section{display:none;}.section.active{display:block;}
    .profit{color:#dc2626;font-weight:700;}.loss{color:#2563eb;font-weight:700;}
    table{border-collapse:collapse;width:100%;}
    th{background:linear-gradient(135deg,#f1f5f9,#e8edf5);color:#475569;font-size:12px;font-weight:600;padding:12px 14px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap;}
    td{padding:12px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;vertical-align:middle;}
    tr:hover td{background:#f8fafc;}
    input,select{border:1.5px solid #e2e8f0;border-radius:8px;padding:9px 12px;font-size:13px;transition:all .2s;outline:none;background:white;}
    input:focus,select:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1);}
    .btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;border:none;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
    .btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 15px rgba(37,99,235,.4);}
    .btn-danger{background:linear-gradient(135deg,#ef4444,#dc2626);color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer;transition:all .2s;}
    .btn-danger:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(220,38,38,.3);}
    .btn-secondary{background:linear-gradient(135deg,#64748b,#475569);color:white;border:none;border-radius:8px;padding:7px 14px;font-size:12px;cursor:pointer;transition:all .2s;}
    .btn-google{background:white;color:#374151;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 24px;font-size:15px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.08);}
    .btn-google:hover{box-shadow:0 4px 20px rgba(0,0,0,.15);transform:translateY(-1px);}
    .weed-yes{background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;}
    .weed-no{background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;}
    .weed-caution{background:#fffbeb;color:#d97706;border:1px solid #fcd34d;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;}
    .bull-market{background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;}
    .bear-market{background:#eff6ff;color:#1d4ed8;border:1px solid #93c5fd;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:700;}
    .step-num{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0;}
    /* 규칙1: 모달은 저장/취소로만 닫힘 */
    .modal-bg{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);}
    .modal-box{background:white;border-radius:20px;padding:32px;width:90%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto;}
    .table-wrap{overflow-x:auto;border-radius:12px;}
    .tooltip{position:relative;cursor:help;}
    .tooltip::after{content:attr(data-tip);position:absolute;bottom:125%;left:50%;transform:translateX(-50%);background:#1e293b;color:white;padding:6px 10px;border-radius:8px;font-size:11px;white-space:nowrap;z-index:100;opacity:0;pointer-events:none;transition:opacity .2s;}
    .tooltip:hover::after{opacity:1;}
    .stat-card{background:white;border-radius:14px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.06);}
    @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    .fade-in{animation:fadeIn .3s ease;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .spin{animation:spin 1s linear infinite;}
    ::-webkit-scrollbar{width:6px;height:6px;}
    ::-webkit-scrollbar-track{background:#f1f5f9;border-radius:3px;}
    ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}
    ::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
    .empty-state{text-align:center;padding:60px 20px;color:#94a3b8;}
    .empty-state i{font-size:48px;margin-bottom:16px;opacity:.4;}
    /* 로그인 화면 */
    .login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;}
    /* 동기화 상태 */
    .sync-dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
    .sync-ok{background:#22c55e;}
    .sync-ing{background:#f59e0b;}
    .sync-err{background:#ef4444;}
    /* 토스트 */
    .toast{position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 20px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,.2);transform:translateY(100px);opacity:0;transition:all .3s;}
    .toast.show{transform:translateY(0);opacity:1;}
    .toast-success{background:#0f172a;color:#4ade80;}
    .toast-error{background:#0f172a;color:#f87171;}
    .toast-info{background:#0f172a;color:#60a5fa;}
    /* 인풋 테이블 안에서 좁게 */
    td input[type=text]{padding:7px 10px;}
    td select{padding:7px 10px;}
  </style>
</head>
<body>

<!-- ══════════════════════════════════════════ -->
<!--  로그인 화면                                -->
<!-- ══════════════════════════════════════════ -->
<div id="loginScreen" class="login-screen" style="display:none;">
  <div class="text-center max-w-md mx-auto px-6">
    <div class="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-6 shadow-xl">📈</div>
    <h1 class="text-3xl font-black text-slate-800 mb-2">주린이 떡락방지</h1>
    <p class="text-slate-500 mb-2">월봉 10이평선 기준 안전 투자 관리</p>
    <div class="flex items-center justify-center gap-2 mb-8">
      <span class="w-2 h-2 rounded-full bg-green-500"></span>
      <span class="text-xs text-slate-400">Google 계정으로 모든 기기에서 데이터 동기화</span>
    </div>

    <div class="card p-8 mb-4">
      <div class="mb-6">
        <div class="flex items-center justify-center gap-3 mb-3">
          <div class="flex-1 h-px bg-slate-200"></div>
          <span class="text-xs text-slate-400 font-medium">구글 계정으로 시작하기</span>
          <div class="flex-1 h-px bg-slate-200"></div>
        </div>
      </div>

      <button class="btn-google w-full justify-center mb-4" onclick="handleGoogleLogin()">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Google 계정으로 로그인
      </button>

      <div class="text-xs text-slate-400 text-center leading-relaxed">
        로그인 시 Google Drive에 <strong class="text-slate-600">주린이 떡락방지</strong> 스프레드시트가<br/>
        자동 생성되고, 모든 데이터가 안전하게 저장돼요
      </div>
    </div>

    <div class="grid grid-cols-3 gap-3 text-center">
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <div class="text-xl mb-1">🔒</div>
        <div class="text-xs font-semibold text-slate-700">보안</div>
        <div class="text-xs text-slate-400 mt-0.5">내 구글 계정만</div>
      </div>
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <div class="text-xl mb-1">☁️</div>
        <div class="text-xs font-semibold text-slate-700">클라우드</div>
        <div class="text-xs text-slate-400 mt-0.5">어디서든 접근</div>
      </div>
      <div class="bg-white rounded-xl p-3 shadow-sm">
        <div class="text-xl mb-1">📊</div>
        <div class="text-xs font-semibold text-slate-700">시트 연동</div>
        <div class="text-xs text-slate-400 mt-0.5">구글시트 자동저장</div>
      </div>
    </div>
  </div>
</div>


<!-- ══════════════════════════════════════════ -->
<!--  로딩 화면                                  -->
<!-- ══════════════════════════════════════════ -->
<div id="loadingScreen" style="display:flex;" class="login-screen flex-col gap-4">
  <div class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full spin"></div>
  <div id="loadingMsg" class="text-slate-600 font-semibold text-lg">Google 연결 중...</div>
  <div id="loadingSubMsg" class="text-slate-400 text-sm">잠시만 기다려주세요</div>
</div>


<!-- ══════════════════════════════════════════ -->
<!--  메인 앱                                    -->
<!-- ══════════════════════════════════════════ -->
<div id="mainApp" style="display:none;">

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
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <!-- 동기화 상태 -->
          <div class="flex items-center gap-1.5 bg-white/10 rounded-lg px-3 py-1.5 cursor-pointer" onclick="manualSync()" title="클릭하면 지금 바로 저장">
            <span class="sync-dot sync-ok" id="syncDot"></span>
            <span class="text-xs text-blue-100" id="syncStatus">동기화 완료</span>
            <i class="fas fa-sync-alt text-xs text-blue-200" id="syncIcon"></i>
          </div>
          <!-- 사용자 프로필 -->
          <div class="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-1.5">
            <img id="userAvatar" src="" class="w-6 h-6 rounded-full" onerror="this.style.display='none'" />
            <span class="text-xs text-white font-medium" id="userName">-</span>
          </div>
          <!-- 로그아웃 -->
          <button onclick="handleLogout()" class="bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1">
            <i class="fas fa-sign-out-alt"></i> 로그아웃
          </button>
          <!-- 날짜 -->
          <div class="text-right hidden lg:block">
            <div id="headerDate" class="text-blue-200 text-xs"></div>
            <div id="headerSummary" class="text-white text-sm font-semibold mt-0.5"></div>
          </div>
        </div>
      </div>
      <!-- 탭 네비게이션 -->
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

    <!-- ══ 대시보드 ══ -->
    <section id="section-dashboard" class="section active fade-in">
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
            <div class="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center"><i class="fas fa-chart-area text-red-500 text-sm"></i></div>
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
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div class="lg:col-span-2 card p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold text-slate-800 flex items-center gap-2"><i class="fas fa-briefcase text-blue-500"></i> 보유 종목 현황</h2>
            <button onclick="showSection('master')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">관리하기 →</button>
          </div>
          <div id="dash-stock-list"><div class="empty-state"><i class="fas fa-seedling block"></i><p class="font-medium">아직 종목이 없어요</p><p class="text-sm mt-1">마스터 데이터에서 종목을 추가하세요</p></div></div>
        </div>
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-bold text-slate-800 flex items-center gap-2"><i class="fas fa-bell text-amber-500"></i> 이번 달 신호</h2>
            <button onclick="showSection('signal')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">상세 →</button>
          </div>
          <div id="dash-signal-list"><div class="empty-state"><i class="fas fa-chart-line block" style="font-size:32px"></i><p class="text-sm font-medium mt-2">ETF 이평선 데이터를<br/>입력해주세요</p></div></div>
        </div>
      </div>
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-slate-800 flex items-center gap-2"><i class="fas fa-wallet text-green-500"></i> 월간 투자 계획 요약</h2>
          <button onclick="showSection('cashflow')" class="text-xs text-blue-500 hover:text-blue-700 font-medium">관리하기 →</button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-50 rounded-xl p-4"><div class="text-xs text-slate-500 mb-1">월 총 이체금액</div><div class="text-lg font-bold text-slate-800" id="dash-monthly-total">-</div></div>
          <div class="bg-slate-50 rounded-xl p-4"><div class="text-xs text-slate-500 mb-1">연간 투자 예상</div><div class="text-lg font-bold text-slate-800" id="dash-annual-total">-</div></div>
          <div class="bg-slate-50 rounded-xl p-4"><div class="text-xs text-slate-500 mb-1">투자 종목 수</div><div class="text-lg font-bold text-slate-800" id="dash-stock-count">-</div></div>
          <div class="bg-slate-50 rounded-xl p-4"><div class="text-xs text-slate-500 mb-1">중단 검토 종목</div><div class="text-lg font-bold text-orange-500" id="dash-stop-count">-</div></div>
        </div>
      </div>
      <!-- 구글 시트 링크 -->
      <div class="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="text-2xl">📊</div>
          <div>
            <div class="font-bold text-green-800 text-sm">Google Sheets에서 직접 보기</div>
            <div class="text-green-600 text-xs mt-0.5">연결된 스프레드시트를 구글 시트에서 직접 확인하고 편집할 수 있어요</div>
          </div>
        </div>
        <a id="sheetLink" href="#" target="_blank" class="btn-primary text-sm px-4 py-2 rounded-lg flex items-center gap-2 whitespace-nowrap" style="text-decoration:none;">
          <i class="fas fa-external-link-alt text-xs"></i> 시트 열기
        </a>
      </div>
    </section>

    <!-- ══ 마스터 데이터 ══ -->
    <section id="section-master" class="section fade-in">
      <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-seedling text-blue-500"></i> 마스터 데이터</h2>
          <p class="text-sm text-slate-500 mt-0.5">보유 중인 주식/ETF를 모두 등록하고 관리해요</p>
        </div>
        <button onclick="openAddModal()" class="btn-primary flex items-center gap-2"><i class="fas fa-plus"></i> 종목 추가</button>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5 flex items-start gap-3">
        <div class="text-2xl mt-0.5">🌿</div>
        <div>
          <div class="font-bold text-amber-800 text-sm">잡초 판별이란?</div>
          <div class="text-amber-700 text-xs mt-1 leading-relaxed">수익률이 <strong>-20% 이하</strong>이거나 수익 전망이 없는 종목을 <strong class="text-red-600">잡초</strong>로 분류해요. 개별 주식은 월봉 10이평선 전략 <strong>적용 불가</strong> 종목으로 따로 관리가 필요해요.</div>
        </div>
      </div>
      <div class="card">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <h3 class="font-bold text-slate-700 text-sm">보유 종목 목록</h3>
          <div class="flex gap-2 items-center">
            <select id="filterBroker" onchange="renderMasterTable()" class="text-xs py-1.5 px-3 text-slate-600"><option value="">전체 증권사</option></select>
            <select id="filterType" onchange="renderMasterTable()" class="text-xs py-1.5 px-3 text-slate-600">
              <option value="">전체 종류</option>
              <option value="시장지수ETF">시장지수ETF</option>
              <option value="개별주식">개별주식</option>
            </select>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>증권사/앱</th><th>종목명</th><th>종류</th>
              <th class="tooltip" data-tip="내가 매수한 평균 가격">평균매수단가</th>
              <th class="tooltip" data-tip="오늘 현재 주가 (직접 입력)">현재주가</th>
              <th>보유수량</th>
              <th class="tooltip" data-tip="평단가 × 수량">총투자원금</th>
              <th class="tooltip" data-tip="현재가 × 수량">현재평가금액</th>
              <th class="tooltip" data-tip="(평가-원금)/원금×100">수익률(%)</th>
              <th class="tooltip" data-tip="-20%이하 종목">잡초판별</th>
              <th>관리</th>
            </tr></thead>
            <tbody id="masterTableBody"><tr><td colspan="11"><div class="empty-state"><i class="fas fa-seedling block"></i><p>종목 추가 버튼을 눌러주세요!</p></div></td></tr></tbody>
          </table>
        </div>
        <div class="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div><div class="text-xs text-slate-500">총 투자 원금 합계</div><div class="text-base font-bold text-slate-800" id="master-sum-invest">₩0</div></div>
            <div><div class="text-xs text-slate-500">현재 평가금액 합계</div><div class="text-base font-bold text-slate-800" id="master-sum-eval">₩0</div></div>
            <div><div class="text-xs text-slate-500">전체 수익/손실</div><div class="text-base font-bold" id="master-sum-profit">₩0</div></div>
            <div><div class="text-xs text-slate-500">전체 수익률</div><div class="text-base font-bold" id="master-sum-rate">0%</div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ 10이평선 통제탑 ══ -->
    <section id="section-signal" class="section fade-in">
      <div class="mb-5">
        <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-chart-line text-blue-500"></i> 10이평선 통제탑</h2>
        <p class="text-sm text-slate-500 mt-0.5">월봉 10이평선 기준으로 매수/매도 시점을 파악해요</p>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5">
        <div class="flex items-start gap-3">
          <div class="text-3xl">📊</div>
          <div class="flex-1">
            <div class="font-bold text-blue-800 mb-2">월봉 10이평선 전략이란?</div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div class="bg-white rounded-lg p-3 border border-blue-100">
                <div class="flex items-center gap-2 mb-1.5"><span class="text-lg">🟢</span><span class="font-bold text-green-700 text-sm">상승장 (종가 &gt; 10이평선)</span></div>
                <div class="text-xs text-slate-600 leading-relaxed">말일 종가가 이평선 <strong>위</strong> → <strong class="text-green-700">계속 모으기</strong></div>
              </div>
              <div class="bg-white rounded-lg p-3 border border-blue-100">
                <div class="flex items-center gap-2 mb-1.5"><span class="text-lg">🔴</span><span class="font-bold text-red-700 text-sm">하락장 (종가 &lt; 10이평선)</span></div>
                <div class="text-xs text-slate-600 leading-relaxed">말일 종가가 이평선 <strong>아래</strong> → <strong class="text-red-700">매수 중단</strong></div>
              </div>
            </div>
            <div class="mt-3 bg-amber-50 rounded-lg p-2.5 border border-amber-200">
              <div class="text-xs text-amber-800 flex items-start gap-1.5"><i class="fas fa-exclamation-triangle mt-0.5"></i><span><strong>주의:</strong> 시장지수 ETF(SPY, QQQ 등)에만 적용해요. 개별주식은 적용 불가!</span></div>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="p-5 border-b border-slate-100">
          <h3 class="font-bold text-slate-700 text-sm">📅 이번 달 이평선 현황 <span class="text-xs font-normal text-slate-400 ml-2">말일 종가와 10이평선 가격을 직접 입력하세요</span></h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>종목명</th><th>종류 확인</th><th>전략 적용 여부</th>
              <th class="tooltip" data-tip="이번 달 마지막 거래일 종가">이번달 말일 종가</th>
              <th class="tooltip" data-tip="최근 10개월 종가의 평균값">10개월 이동평균선</th>
              <th>시장 상태</th><th>나의 행동 지침</th>
            </tr></thead>
            <tbody id="signalTableBody"><tr><td colspan="7"><div class="empty-state"><i class="fas fa-chart-line block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr></tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ══ 현금흐름 통제소 ══ -->
    <section id="section-cashflow" class="section fade-in">
      <div class="mb-5">
        <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-wallet text-green-500"></i> 현금흐름 통제소</h2>
        <p class="text-sm text-slate-500 mt-0.5">자동투자 주기와 금액을 관리해서 낭비를 막아요</p>
      </div>
      <div class="bg-green-50 border border-green-200 rounded-xl p-4 mb-5">
        <div class="flex items-start gap-3">
          <div class="text-2xl">💰</div>
          <div>
            <div class="font-bold text-green-800 text-sm mb-1">현금흐름 통제소 사용법</div>
            <div class="text-green-700 text-xs leading-relaxed">자동투자 주기(매일/매주/매월/안함)와 1회 투자금액을 입력하면 월별 총 이체금액과 연간 예상금액을 자동 계산해줘요.</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="p-5 border-b border-slate-100"><h3 class="font-bold text-slate-700 text-sm">💳 자동투자 계획 목록</h3></div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>증권사/앱</th><th>종목명</th>
              <th class="tooltip" data-tip="매일/매주/매월/안함 중 선택">자동투자 주기</th>
              <th class="tooltip" data-tip="1번 투자할 때 들어가는 금액">1회 투자금액</th>
              <th class="tooltip" data-tip="주기에 따라 자동계산">월별 총 이체금액</th>
              <th class="tooltip" data-tip="월별금액 × 12개월">연간 투자 예상</th>
              <th class="tooltip" data-tip="이 투자를 계속할지 결정">통제 결정</th>
            </tr></thead>
            <tbody id="cashflowTableBody"><tr><td colspan="7"><div class="empty-state"><i class="fas fa-wallet block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr></tbody>
          </table>
        </div>
        <div class="p-4 bg-slate-50 border-t border-slate-100 rounded-b-2xl">
          <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <div><div class="text-xs text-slate-500">월 총 이체금액 합계</div><div class="text-lg font-bold text-green-700" id="cf-monthly-sum">₩0</div></div>
            <div><div class="text-xs text-slate-500">연간 투자 예상 합계</div><div class="text-lg font-bold text-slate-800" id="cf-annual-sum">₩0</div></div>
            <div><div class="text-xs text-slate-500">중단 검토 종목</div><div class="text-lg font-bold text-orange-500" id="cf-stop-count">0개</div></div>
          </div>
        </div>
      </div>
    </section>

    <!-- ══ 사용 가이드 ══ -->
    <section id="section-guide" class="section fade-in">
      <div class="mb-5">
        <h2 class="text-xl font-black text-slate-800 flex items-center gap-2"><i class="fas fa-book-open text-purple-500"></i> 사용 가이드 & 매뉴얼</h2>
        <p class="text-sm text-slate-500 mt-0.5">주린이도 쉽게 따라할 수 있는 단계별 안내서</p>
      </div>
      <div class="card p-6 mb-5">
        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-star text-amber-500"></i> 핵심 투자 원칙 3가지</h3>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="bg-blue-50 rounded-xl p-4 border border-blue-100"><div class="text-3xl mb-2">🌊</div><div class="font-bold text-blue-800 mb-1">원칙 1: 시장을 이기려 하지 마세요</div><div class="text-blue-700 text-xs leading-relaxed">개별 주식 대신 시장 전체를 담는 ETF(SPY, QQQ)에 집중하세요.</div></div>
          <div class="bg-green-50 rounded-xl p-4 border border-green-100"><div class="text-3xl mb-2">📅</div><div class="font-bold text-green-800 mb-1">원칙 2: 꾸준히, 정기적으로</div><div class="text-green-700 text-xs leading-relaxed">매달 같은 날 같은 금액을 투자하세요. 가격이 쌀 때 더 많이 사지게 돼요.</div></div>
          <div class="bg-red-50 rounded-xl p-4 border border-red-100"><div class="text-3xl mb-2">🛑</div><div class="font-bold text-red-800 mb-1">원칙 3: 하락장엔 멈추세요</div><div class="text-red-700 text-xs leading-relaxed">월봉이 10이평선 아래로 내려가면 매수를 멈추세요.</div></div>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div class="card p-6">
          <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-calendar-week text-blue-500"></i> 📅 월간 루틴 (매월 말일)</h3>
          <div class="space-y-3">
            <div class="flex items-start gap-3"><div class="step-num">1</div><div><div class="font-semibold text-slate-700 text-sm">현재가 업데이트</div><div class="text-xs text-slate-500 mt-0.5">마스터 데이터에서 보유 종목의 현재주가를 오늘 주가로 업데이트</div></div></div>
            <div class="flex items-start gap-3"><div class="step-num">2</div><div><div class="font-semibold text-slate-700 text-sm">말일 종가 확인</div><div class="text-xs text-slate-500 mt-0.5">이번 달 마지막 거래일 종가를 증권사 앱에서 확인</div></div></div>
            <div class="flex items-start gap-3"><div class="step-num">3</div><div><div class="font-semibold text-slate-700 text-sm">10이평선 가격 입력</div><div class="text-xs text-slate-500 mt-0.5">10이평선 통제탑에 말일 종가와 10개월 이동평균 가격 입력</div></div></div>
            <div class="flex items-start gap-3"><div class="step-num">4</div><div><div class="font-semibold text-slate-700 text-sm">행동 지침 확인</div><div class="text-xs text-slate-500 mt-0.5">🟢 상승장이면 계속 모으기, 🔴 하락장이면 매수 중단</div></div></div>
            <div class="flex items-start gap-3"><div class="step-num">5</div><div><div class="font-semibold text-slate-700 text-sm">잡초 점검</div><div class="text-xs text-slate-500 mt-0.5">수익률 -20% 이하 종목(잡초)은 정리 여부 검토</div></div></div>
          </div>
        </div>
        <div class="card p-6">
          <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-question-circle text-purple-500"></i> ❓ 자주 묻는 질문</h3>
          <div class="space-y-4">
            <div class="border-b border-slate-100 pb-3"><div class="font-semibold text-slate-700 text-sm mb-1">Q. 10이평선 가격은 어디서 찾나요?</div><div class="text-xs text-slate-500 leading-relaxed">네이버 증권 → ETF 검색 → 차트 → 월봉 → 이동평균 10개월 값을 확인하세요.</div></div>
            <div class="border-b border-slate-100 pb-3"><div class="font-semibold text-slate-700 text-sm mb-1">Q. 잡초는 무조건 팔아야 하나요?</div><div class="text-xs text-slate-500 leading-relaxed">아니에요! 잡초 판별은 참고용이에요. 기업 전망이 좋다면 보유할 수 있어요.</div></div>
            <div class="border-b border-slate-100 pb-3"><div class="font-semibold text-slate-700 text-sm mb-1">Q. 데이터는 어디에 저장되나요?</div><div class="text-xs text-slate-500 leading-relaxed">내 Google Drive의 <strong>주린이 떡락방지</strong> 스프레드시트에 저장돼요. 어느 기기에서나 접근 가능해요.</div></div>
            <div class="border-b border-slate-100 pb-3"><div class="font-semibold text-slate-700 text-sm mb-1">Q. 평균매수단가(평단가)란?</div><div class="text-xs text-slate-500 leading-relaxed">여러 번 나눠 샀을 때 평균 가격이에요. 예: 100원 10주 + 120원 10주 = 평단가 110원</div></div>
            <div><div class="font-semibold text-slate-700 text-sm mb-1">Q. 현재주가는 자동으로 업데이트 되나요?</div><div class="text-xs text-slate-500 leading-relaxed">아니에요. 마스터 데이터 탭에서 현재주가 칸을 직접 입력해주세요. 매월 말일에 한 번씩 업데이트하는 것을 추천해요.</div></div>
          </div>
        </div>
      </div>
      <!-- 용어 사전 -->
      <div class="card p-6">
        <h3 class="font-bold text-slate-800 mb-4 flex items-center gap-2"><i class="fas fa-book text-slate-500"></i> 📖 주요 용어 사전</h3>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div class="space-y-3">
            <div class="flex gap-3 items-start"><span class="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">ETF</span><div class="text-xs text-slate-600">여러 주식을 한데 묶어 거래하는 펀드. SPY(미국 전체), QQQ(나스닥) 등</div></div>
            <div class="flex gap-3 items-start"><span class="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">10이평선</span><div class="text-xs text-slate-600">최근 10개월 종가의 평균값. 이 선보다 위면 상승장, 아래면 하락장</div></div>
            <div class="flex gap-3 items-start"><span class="bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">평단가</span><div class="text-xs text-slate-600">여러 번 나눠서 살 때의 평균 매수 가격</div></div>
          </div>
          <div class="space-y-3">
            <div class="flex gap-3 items-start"><span class="bg-red-100 text-red-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">잡초종목</span><div class="text-xs text-slate-600">수익률이 -20% 이하인 종목. 정리 여부를 검토해야 해요</div></div>
            <div class="flex gap-3 items-start"><span class="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">적립식투자</span><div class="text-xs text-slate-600">매월 일정 금액을 꾸준히 투자하는 방식. 타이밍 걱정 없이 평단가를 낮출 수 있어요</div></div>
            <div class="flex gap-3 items-start"><span class="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">말일종가</span><div class="text-xs text-slate-600">이번 달 마지막 거래일의 종가(장이 끝날 때 가격)</div></div>
          </div>
        </div>
      </div>
    </section>

  </main>
</div><!-- /mainApp -->


<!-- ══════════════════════════════════════════ -->
<!--  모달: 종목 추가/수정 (규칙1: 저장/취소만)   -->
<!-- ══════════════════════════════════════════ -->
<div id="addModal" class="modal-bg" style="display:none;">
  <div class="modal-box">
    <div class="flex items-center justify-between mb-5">
      <h3 class="text-lg font-black text-slate-800" id="modalTitle">📌 종목 추가</h3>
      <div class="text-xs text-slate-400 bg-slate-100 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
        <i class="fas fa-lock text-slate-400"></i> 저장 또는 취소로만 닫기
      </div>
    </div>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs font-semibold text-slate-600 mb-1 block">증권사/앱 이름 <span class="text-red-500">*</span></label><input type="text" id="input-broker" placeholder="예: 토스, 키움증권" class="w-full"/></div>
        <div><label class="text-xs font-semibold text-slate-600 mb-1 block">주식/ETF 이름 <span class="text-red-500">*</span></label><input type="text" id="input-name" placeholder="예: SPY, 삼성전자" class="w-full"/></div>
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
          <input type="text" id="input-avgprice" placeholder="예: 520" class="w-full"
            onfocus="this.value=this.value.replace(/,/g,'')"
            onblur="if(this.value){this.value=Number(this.value.replace(/,/g,'')).toLocaleString('ko-KR');}" />
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">현재주가 <span class="text-red-500">*</span></label>
          <input type="text" id="input-curprice" placeholder="예: 580" class="w-full"
            onfocus="this.value=this.value.replace(/,/g,'')"
            onblur="if(this.value){this.value=Number(this.value.replace(/,/g,'')).toLocaleString('ko-KR');}" />
        </div>
        <div>
          <label class="text-xs font-semibold text-slate-600 mb-1 block">보유수량 <span class="text-red-500">*</span></label>
          <input type="text" id="input-qty" placeholder="예: 10" class="w-full"
            onfocus="this.value=this.value.replace(/,/g,'')"
            onblur="if(this.value){this.value=Number(this.value.replace(/,/g,'')).toLocaleString('ko-KR');}" />
        </div>
      </div>
      <div class="bg-slate-50 rounded-xl p-3 text-xs text-slate-500">
        <div class="grid grid-cols-3 gap-2">
          <div>총 투자원금 = <strong id="calc-invest" class="text-slate-700">-</strong></div>
          <div>현재평가금액 = <strong id="calc-eval" class="text-slate-700">-</strong></div>
          <div>수익률 = <strong id="calc-rate" class="text-slate-700">-</strong></div>
        </div>
      </div>
      <input type="hidden" id="edit-index" value="-1"/>
    </div>
    <div class="flex gap-3 mt-6">
      <button onclick="closeModal()" class="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">취소</button>
      <button onclick="saveStock()" class="flex-1 btn-primary py-2.5 rounded-xl">저장</button>
    </div>
  </div>
</div>

<!-- 토스트 알림 -->
<div id="toast" class="toast"></div>


<!-- ══════════════════════════════════════════ -->
<!--  JavaScript (서버 변수 주입 후 실행)        -->
<!-- ══════════════════════════════════════════ -->
<script>
'use strict';

// ────────────────────────────────────────────
// 서버에서 주입된 설정값
// ────────────────────────────────────────────
const CLIENT_ID = ${clientIdJson};
const SS_TITLE  = ${ssTitleJson};
const SH_MASTER = ${shMasterJson};
const SH_SIGNAL = ${shSignalJson};
const SH_CASH   = ${shCashJson};

const SCOPES    = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const DISC_DOC  = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const LS_SSID   = 'jujini_ssid_v3';
const LS_TOKEN  = 'jujini_token_v3';

// ────────────────────────────────────────────
// 최상위 규칙
// 규칙1: 팝업은 저장/취소로만 닫힘 (ESC, 배경클릭 비활성화)
// 규칙2: 모든 숫자는 쉼표(,) 양식 표기
// ────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  var modal = document.getElementById('addModal');
  if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
    e.preventDefault(); e.stopImmediatePropagation();
  }
}, true);

// ────────────────────────────────────────────
// 전역 상태
// ────────────────────────────────────────────
var tokenClient   = null;
var accessToken   = null;
var spreadsheetId = null;
var userProfile   = null;
var appData       = { stocks: [] };
var syncTimer     = null;
var isSyncing     = false;
var _renderLock   = false; // renderAll 재진입 방지

// ────────────────────────────────────────────
// 유틸: 숫자 포맷 (규칙2)
// ────────────────────────────────────────────
function fmtNum(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n))) return '-';
  var num = Number(n);
  if (Number.isInteger(num)) return num.toLocaleString('ko-KR');
  var s = num.toFixed(4).replace(/\\.?0+$/, '');
  var parts = s.split('.');
  parts[0] = parseInt(parts[0], 10).toLocaleString('ko-KR');
  return parts.join('.');
}
function fmtRate(r) {
  if (r === null || r === undefined || r === '' || isNaN(Number(r))) return '-';
  var v = Number(r);
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtInputDisplay(n) {
  if (n === '' || n === null || n === undefined) return '';
  var num = Number(n);
  if (isNaN(num)) return String(n);
  if (Number.isInteger(num)) return num.toLocaleString('ko-KR');
  var parts = num.toString().split('.');
  parts[0] = parseInt(parts[0], 10).toLocaleString('ko-KR');
  return parts.join('.');
}
function parseNum(v) {
  return parseFloat(String(v || 0).replace(/,/g, '')) || 0;
}
function parseIntNum(v) {
  return parseInt(String(v || 0).replace(/,/g, ''), 10) || 0;
}

// ────────────────────────────────────────────
// 토스트 알림
// ────────────────────────────────────────────
function toast(msg, type) {
  type = type || 'info';
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast toast-' + type + ' show';
  setTimeout(function() { el.classList.remove('show'); }, 3000);
}

// ────────────────────────────────────────────
// 동기화 상태 표시
// ────────────────────────────────────────────
function setSyncStatus(state, msg) {
  var dot = document.getElementById('syncDot');
  var txt = document.getElementById('syncStatus');
  var ico = document.getElementById('syncIcon');
  dot.className = 'sync-dot ' + (state === 'ok' ? 'sync-ok' : state === 'ing' ? 'sync-ing' : 'sync-err');
  txt.textContent = msg;
  if (state === 'ing') ico.classList.add('spin'); else ico.classList.remove('spin');
}

// ────────────────────────────────────────────
// 화면 전환
// ────────────────────────────────────────────
function showScreen(name, msg, sub) {
  document.getElementById('loginScreen').style.display   = name === 'login'   ? 'flex' : 'none';
  document.getElementById('loadingScreen').style.display = name === 'loading' ? 'flex' : 'none';
  document.getElementById('mainApp').style.display       = name === 'app'     ? 'block' : 'none';
  if (msg) document.getElementById('loadingMsg').textContent = msg;
  if (sub !== undefined) document.getElementById('loadingSubMsg').textContent = sub;
}

function showMainApp() {
  showScreen('app');
  var ssid = spreadsheetId || localStorage.getItem(LS_SSID);
  if (ssid) {
    document.getElementById('sheetLink').href = 'https://docs.google.com/spreadsheets/d/' + ssid + '/edit';
  }
  renderAll();
}

// ────────────────────────────────────────────
// 구글 OAuth 초기화
// ────────────────────────────────────────────
function initGoogleAuth() {
  showScreen('loading', 'Google 계정 확인 중...', '잠시만 기다려주세요');

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: onTokenResponse,
  });

  gapi.load('client', function() {
    gapi.client.init({ discoveryDocs: [DISC_DOC] }).then(function() {
      var saved = localStorage.getItem(LS_TOKEN);
      if (saved) {
        try {
          var t = JSON.parse(saved);
          if (t.expires_at > Date.now() + 60000) {
            accessToken = t.access_token;
            gapi.client.setToken({ access_token: accessToken });
            spreadsheetId = localStorage.getItem(LS_SSID) || null;
            loadUserProfile().then(function() {
              return initSpreadsheet();
            }).then(function() {
              showMainApp();
            }).catch(function(e) {
              console.error('자동 로그인 오류:', e);
              showScreen('login');
            });
            return;
          }
        } catch(e) { /* 만료 */ }
      }
      showScreen('login');
    }).catch(function(e) {
      console.error('GAPI init 오류:', e);
      showScreen('login');
    });
  });
}

// ────────────────────────────────────────────
// 구글 로그인
// ────────────────────────────────────────────
function handleGoogleLogin() {
  showScreen('loading', '구글 로그인 중...', '팝업 창에서 계정을 선택해주세요');
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

function onTokenResponse(resp) {
  if (resp.error) {
    showScreen('login');
    toast('로그인 실패: ' + resp.error, 'error');
    return;
  }
  accessToken = resp.access_token;
  gapi.client.setToken({ access_token: accessToken });
  localStorage.setItem(LS_TOKEN, JSON.stringify({
    access_token: accessToken,
    expires_at: Date.now() + (resp.expires_in || 3600) * 1000
  }));

  showScreen('loading', '계정 정보 불러오는 중...', '');
  loadUserProfile().then(function() {
    showScreen('loading', '스프레드시트 연결 중...', '처음이면 자동으로 시트가 생성돼요');
    return initSpreadsheet();
  }).then(function() {
    showMainApp();
  }).catch(function(e) {
    console.error('로그인 후 오류:', e);
    toast('연결 오류가 발생했어요. 다시 시도해주세요.', 'error');
    showScreen('login');
  });
}

// ────────────────────────────────────────────
// 사용자 프로필 로드
// ────────────────────────────────────────────
function loadUserProfile() {
  return fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken }
  }).then(function(res) { return res.json(); }).then(function(data) {
    userProfile = data;
    document.getElementById('userName').textContent = data.name || data.email || '';
    var avatar = document.getElementById('userAvatar');
    if (data.picture) { avatar.src = data.picture; avatar.style.display = 'block'; }
  }).catch(function(e) { console.warn('프로필 로드 실패', e); });
}

// ────────────────────────────────────────────
// 스프레드시트 초기화
// ────────────────────────────────────────────
function initSpreadsheet() {
  var cachedId = localStorage.getItem(LS_SSID);
  var p = Promise.resolve();

  if (cachedId) {
    p = gapi.client.sheets.spreadsheets.get({ spreadsheetId: cachedId }).then(function() {
      spreadsheetId = cachedId;
      return ensureSheets();
    }).then(function() {
      return loadFromSheets();
    }).catch(function() {
      // 캐시된 시트 접근 불가 → 새로 검색
      return searchOrCreateSpreadsheet();
    });
  } else {
    p = searchOrCreateSpreadsheet();
  }
  return p;
}

function searchOrCreateSpreadsheet() {
  return fetch(
    "https://www.googleapis.com/drive/v3/files?q=name='" + encodeURIComponent(SS_TITLE) + "'+and+mimeType='application/vnd.google-apps.spreadsheet'+and+trashed=false&fields=files(id,name)",
    { headers: { Authorization: 'Bearer ' + accessToken } }
  ).then(function(res) { return res.json(); }).then(function(data) {
    if (data.files && data.files.length > 0) {
      spreadsheetId = data.files[0].id;
      localStorage.setItem(LS_SSID, spreadsheetId);
      return ensureSheets().then(function() {
        return loadFromSheets();
      }).then(function() {
        toast('기존 스프레드시트를 찾았어요! 📊', 'success');
      });
    } else {
      return createSpreadsheet().then(function() {
        toast('새 스프레드시트를 만들었어요! 📊', 'success');
      });
    }
  }).catch(function(e) {
    console.error('스프레드시트 초기화 오류', e);
    toast('시트 연결 오류. 데이터는 임시 저장됩니다.', 'error');
    appData = { stocks: [] };
  });
}

// ────────────────────────────────────────────
// 스프레드시트 생성
// ────────────────────────────────────────────
function createSpreadsheet() {
  return gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: SS_TITLE },
      sheets: [
        { properties: { title: SH_MASTER, index: 0 } },
        { properties: { title: SH_SIGNAL, index: 1 } },
        { properties: { title: SH_CASH,   index: 2 } },
      ]
    }
  }).then(function(res) {
    spreadsheetId = res.result.spreadsheetId;
    localStorage.setItem(LS_SSID, spreadsheetId);
    return writeHeaders();
  });
}

// ────────────────────────────────────────────
// 필요한 시트 있는지 확인 후 없으면 추가
// ────────────────────────────────────────────
function ensureSheets() {
  return gapi.client.sheets.spreadsheets.get({ spreadsheetId: spreadsheetId }).then(function(res) {
    var existing = res.result.sheets.map(function(s) { return s.properties.title; });
    var needed = [SH_MASTER, SH_SIGNAL, SH_CASH];
    var requests = [];
    needed.forEach(function(name) {
      if (existing.indexOf(name) === -1) {
        requests.push({ addSheet: { properties: { title: name } } });
      }
    });
    if (requests.length > 0) {
      return gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId, resource: { requests: requests }
      }).then(function() { return writeHeaders(); });
    }
  });
}

// ────────────────────────────────────────────
// 헤더 행 작성
// ────────────────────────────────────────────
function writeHeaders() {
  var masterHeader = [['증권사/앱 이름','주식/ETF 이름','종류','평균 매수 단가','현재 주가','보유 수량','총 투자 원금','현재 평가 금액','수익률(%)','잡초 판별','말일종가','10이평선','자동투자주기','1회금액','월별이체','연간예상','통제결정']];
  return gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId,
    resource: {
      valueInputOption: 'RAW',
      data: [{ range: SH_MASTER + '!A1:Q1', values: masterHeader }]
    }
  });
}

// ────────────────────────────────────────────
// 시트에서 데이터 읽기
// ────────────────────────────────────────────
function loadFromSheets() {
  return gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetId,
    range: SH_MASTER + '!A2:Q',
  }).then(function(res) {
    var rows = res.result.values || [];
    appData.stocks = rows.filter(function(r) { return r[0] || r[1]; }).map(function(r) {
      return {
        broker:        r[0]  || '',
        name:          r[1]  || '',
        type:          r[2]  || '',
        avgPrice:      parseNum(r[3]),
        curPrice:      parseNum(r[4]),
        qty:           parseNum(r[5]),
        monthEndPrice: parseNum(r[10]),
        ma10:          parseNum(r[11]),
        cfCycle:       r[12] || '매월',
        cfAmount:      parseIntNum(r[13]),
        cfDecision:    r[16] || '계속',
      };
    });
  }).catch(function(e) {
    console.warn('시트 읽기 실패, 헤더 재작성', e);
    return writeHeaders().then(function() { appData.stocks = []; });
  });
}

// ────────────────────────────────────────────
// 시트에 전체 데이터 쓰기
// ────────────────────────────────────────────
function saveToSheets() {
  if (!spreadsheetId || isSyncing) return Promise.resolve();
  isSyncing = true;
  setSyncStatus('ing', '저장 중...');

  var rows = appData.stocks.map(function(s) {
    var invest = s.avgPrice * s.qty;
    var eval_  = s.curPrice * s.qty;
    var rate   = invest > 0 ? ((eval_ - invest) / invest * 100).toFixed(2) : 0;
    var monthly = calcMonthly(s);
    var weed    = getWeed(s);
    var weedTxt = weed === 'yes' ? '🌿 잡초' : weed === 'caution' ? '⚠️ 주의' : '✅ 양호';
    return [
      s.broker, s.name, s.type,
      s.avgPrice, s.curPrice, s.qty,
      invest, eval_, rate, weedTxt,
      s.monthEndPrice || '', s.ma10 || '',
      s.cfCycle, s.cfAmount, monthly, monthly * 12, s.cfDecision
    ];
  });

  return gapi.client.sheets.spreadsheets.values.clear({
    spreadsheetId: spreadsheetId,
    range: SH_MASTER + '!A2:Q',
  }).then(function() {
    if (rows.length === 0) return;
    return gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: SH_MASTER + '!A2',
      valueInputOption: 'RAW',
      resource: { values: rows }
    });
  }).then(function() {
    var now = new Date();
    setSyncStatus('ok', now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0') + ' 저장됨');
    isSyncing = false;
  }).catch(function(e) {
    console.error('저장 오류', e);
    setSyncStatus('err', '저장 실패');
    toast('저장 실패. 네트워크를 확인해주세요.', 'error');
    isSyncing = false;
  });
}

function scheduleSave() {
  setSyncStatus('ing', '변경사항 있음');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function() { saveToSheets(); }, 1500);
}

function manualSync() {
  clearTimeout(syncTimer);
  saveToSheets();
  toast('저장 중...', 'info');
}

// ────────────────────────────────────────────
// 로그아웃
// ────────────────────────────────────────────
function handleLogout() {
  if (!confirm('로그아웃 할까요?\\n\\n저장되지 않은 데이터는 자동 저장됩니다.')) return;
  saveToSheets().then(function() {
    if (accessToken) google.accounts.oauth2.revoke(accessToken, function() {});
    accessToken = null; spreadsheetId = null; userProfile = null;
    localStorage.removeItem(LS_TOKEN);
    appData = { stocks: [] };
    showScreen('login');
    toast('로그아웃 되었어요', 'info');
  });
}

// ────────────────────────────────────────────
// 네비게이션
// ────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t) {
    t.classList.remove('active');
    t.classList.add('text-blue-200');
    t.classList.remove('text-white');
  });
  var sec = document.getElementById('section-' + name);
  var tab = document.getElementById('tab-' + name);
  if (sec) sec.classList.add('active');
  if (tab) { tab.classList.add('active'); tab.classList.remove('text-blue-200'); tab.classList.add('text-white'); }
  renderAll();
}

// ────────────────────────────────────────────
// 계산 헬퍼
// ────────────────────────────────────────────
function calcStock(s) {
  var invest = (s.avgPrice||0) * (s.qty||0);
  var eval_  = (s.curPrice||0) * (s.qty||0);
  var profit = eval_ - invest;
  var rate   = invest > 0 ? (profit/invest*100) : 0;
  return { invest: invest, eval: eval_, profit: profit, rate: rate };
}
function getWeed(s) {
  var c = calcStock(s);
  if (c.invest <= 0) return 'neutral';
  if (c.rate <= -20) return 'yes';
  if (c.rate <= -10) return 'caution';
  return 'no';
}
function getSignal(s) {
  if (s.type !== '시장지수ETF') return null;
  if (!s.monthEndPrice || !s.ma10 || s.ma10 === 0) return null;
  return s.monthEndPrice > s.ma10 ? 'bull' : 'bear';
}
function calcMonthly(s) {
  var amt = s.cfAmount || 0;
  switch(s.cfCycle) {
    case '매일': return amt * 20;
    case '매주': return amt * 4;
    case '매월': return amt;
    default: return 0;
  }
}

// ────────────────────────────────────────────
// 대시보드 렌더링
// ────────────────────────────────────────────
function renderDashboard() {
  var stocks = appData.stocks;
  var now = new Date();
  document.getElementById('headerDate').textContent =
    now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';

  var totalInvest=0, totalEval=0, weedCount=0;
  stocks.forEach(function(s) {
    var c = calcStock(s);
    totalInvest += c.invest; totalEval += c.eval;
    if (getWeed(s) === 'yes') weedCount++;
  });
  var totalProfit = totalEval - totalInvest;
  var totalRate   = totalInvest > 0 ? (totalProfit/totalInvest*100) : 0;

  document.getElementById('dash-total-invest').textContent = '₩' + fmtNum(totalInvest);
  document.getElementById('dash-total-eval').textContent   = '₩' + fmtNum(totalEval);
  var profitEl = document.getElementById('dash-total-profit');
  profitEl.textContent = (totalProfit>=0?'+':'') + '₩' + fmtNum(Math.abs(totalProfit));
  profitEl.className = 'text-2xl font-black ' + (totalProfit>=0?'profit':'loss');
  document.getElementById('dash-profit-rate').textContent = fmtRate(totalRate);
  document.getElementById('dash-weed-count').textContent  = weedCount + '개';
  document.getElementById('headerSummary').textContent = (totalRate>=0?'▲ ':'▼ ') + Math.abs(totalRate).toFixed(1) + '%';

  // 보유종목 리스트
  var listEl = document.getElementById('dash-stock-list');
  if (!stocks.length) {
    listEl.innerHTML = '<div class="empty-state"><i class="fas fa-seedling block"></i><p class="font-medium">아직 종목이 없어요</p></div>';
  } else {
    listEl.innerHTML = '<div class="space-y-2">' + stocks.map(function(s) {
      var c = calcStock(s); var weed = getWeed(s);
      return '<div class="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">' +
        '<div class="flex items-center gap-2 min-w-0">' +
          '<div class="w-7 h-7 rounded-lg ' + (s.type==='시장지수ETF'?'bg-blue-100 text-blue-600':'bg-slate-100 text-slate-500') + ' flex items-center justify-center text-xs font-bold flex-shrink-0">' + s.name.substring(0,2) + '</div>' +
          '<div class="min-w-0"><div class="font-semibold text-slate-700 text-sm truncate">' + s.name + '</div><div class="text-xs text-slate-400">' + s.broker + '</div></div>' +
        '</div>' +
        '<div class="text-right flex-shrink-0 ml-2">' +
          '<div class="text-sm font-bold ' + (c.profit>=0?'profit':'loss') + '">' + fmtRate(c.rate) + '</div>' +
          '<div class="text-xs ' + (c.profit>=0?'text-red-400':'text-blue-400') + '">' + (c.profit>=0?'+':'') + '₩' + fmtNum(Math.abs(c.profit)) + '</div>' +
        '</div>' +
        (weed==='yes'?'<span class="weed-yes ml-2 flex-shrink-0">🌿잡초</span>':'') +
      '</div>';
    }).join('') + '</div>';
  }

  // 이평선 신호
  var sigEl = document.getElementById('dash-signal-list');
  var etfs = stocks.filter(function(s) { return s.type==='시장지수ETF' && s.ma10>0; });
  if (!etfs.length) {
    sigEl.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line block" style="font-size:32px"></i><p class="text-sm font-medium mt-2">ETF 이평선 데이터를<br/>입력해주세요</p></div>';
  } else {
    sigEl.innerHTML = '<div class="space-y-3">' + etfs.map(function(s) {
      var isBull = getSignal(s) === 'bull';
      return '<div class="p-3 rounded-xl ' + (isBull?'bg-red-50 border border-red-100':'bg-blue-50 border border-blue-100') + '">' +
        '<div class="flex items-center justify-between">' +
          '<div class="font-bold text-sm ' + (isBull?'text-red-700':'text-blue-700') + '">' + s.name + '</div>' +
          '<span class="' + (isBull?'bull-market':'bear-market') + '">' + (isBull?'🟢 상승장':'🔴 하락장') + '</span>' +
        '</div>' +
        '<div class="text-xs mt-1.5 ' + (isBull?'text-red-600':'text-blue-600') + ' font-semibold">' + (isBull?'✅ 계속 모으기':'🛑 매수 중단') + '</div>' +
        '<div class="text-xs text-slate-400 mt-0.5">종가 ' + fmtNum(s.monthEndPrice) + ' vs 이평 ' + fmtNum(s.ma10) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // 현금흐름 요약
  var monthlyTotal=0, annualTotal=0, stopCount=0;
  stocks.forEach(function(s) {
    var m = calcMonthly(s); monthlyTotal+=m; annualTotal+=m*12;
    if (s.cfDecision==='중단검토' || s.cfCycle==='안함') stopCount++;
  });
  document.getElementById('dash-monthly-total').textContent = '₩'+fmtNum(monthlyTotal);
  document.getElementById('dash-annual-total').textContent  = '₩'+fmtNum(annualTotal);
  document.getElementById('dash-stock-count').textContent   = stocks.length+'개';
  document.getElementById('dash-stop-count').textContent    = stopCount+'개';
}

// ────────────────────────────────────────────
// 마스터 테이블 렌더링
// ────────────────────────────────────────────
function renderMasterTable() {
  var fB = document.getElementById('filterBroker').value;
  var fT = document.getElementById('filterType').value;
  var brokerSel = document.getElementById('filterBroker');
  var brokers = [];
  appData.stocks.forEach(function(s) { if (brokers.indexOf(s.broker) === -1) brokers.push(s.broker); });
  var curB = brokerSel.value;
  brokerSel.innerHTML = '<option value="">전체 증권사</option>' +
    brokers.map(function(b) { return '<option value="' + b + '" ' + (curB===b?'selected':'') + '>' + b + '</option>'; }).join('');

  var filtered = appData.stocks;
  if (fB) filtered = filtered.filter(function(s) { return s.broker===fB; });
  if (fT) filtered = filtered.filter(function(s) { return s.type===fT; });

  var tbody = document.getElementById('masterTableBody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="11"><div class="empty-state"><i class="fas fa-seedling block"></i><p>조건에 맞는 종목이 없어요</p></div></td></tr>';
  } else {
    tbody.innerHTML = filtered.map(function(s) {
      var idx = appData.stocks.indexOf(s);
      var c = calcStock(s);
      var weed = getWeed(s);
      var weedBadge = weed==='yes'?'<span class="weed-yes">🌿 잡초</span>':weed==='caution'?'<span class="weed-caution">⚠️ 주의</span>':'<span class="weed-no">✅ 양호</span>';
      return '<tr>' +
        '<td><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-lg">' + s.broker + '</span></td>' +
        '<td><div class="font-bold text-slate-800">' + s.name + '</div><div class="text-xs text-slate-400">' + (s.type==='시장지수ETF'?'📈 ETF':'📌 개별주') + '</div></td>' +
        '<td><span class="text-xs px-2 py-1 rounded-lg ' + (s.type==='시장지수ETF'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600') + '">' + s.type + '</span></td>' +
        '<td class="font-semibold text-slate-700">' + fmtNum(s.avgPrice) + '</td>' +
        '<td><input type="text" value="' + fmtInputDisplay(s.curPrice) + '" ' +
          'data-idx="' + idx + '" data-field="curPrice" ' +
          'class="inp-num w-28 text-sm font-semibold" placeholder="현재가 입력"/></td>' +
        '<td class="text-slate-700">' + fmtNum(s.qty) + '</td>' +
        '<td class="text-slate-700">₩' + fmtNum(c.invest) + '</td>' +
        '<td class="text-slate-700">₩' + fmtNum(c.eval) + '</td>' +
        '<td class="' + (c.rate>=0?'profit':'loss') + ' text-sm">' + fmtRate(c.rate) + '</td>' +
        '<td>' + weedBadge + '</td>' +
        '<td><div class="flex gap-1.5">' +
          '<button onclick="openEditModal(' + idx + ')" class="btn-secondary text-xs py-1.5 px-3">수정</button>' +
          '<button onclick="deleteStock(' + idx + ')" class="btn-danger text-xs py-1.5 px-3">삭제</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  var sumInvest=0, sumEval=0;
  appData.stocks.forEach(function(s) { var c=calcStock(s); sumInvest+=c.invest; sumEval+=c.eval; });
  var sumProfit=sumEval-sumInvest, sumRate=sumInvest>0?(sumProfit/sumInvest*100):0;
  document.getElementById('master-sum-invest').textContent = '₩'+fmtNum(sumInvest);
  document.getElementById('master-sum-eval').textContent   = '₩'+fmtNum(sumEval);
  var pEl = document.getElementById('master-sum-profit');
  pEl.textContent = (sumProfit>=0?'+':'') + '₩'+fmtNum(Math.abs(sumProfit));
  pEl.className = 'text-base font-bold ' + (sumProfit>=0?'profit':'loss');
  var rEl = document.getElementById('master-sum-rate');
  rEl.textContent = fmtRate(sumRate);
  rEl.className = 'text-base font-bold ' + (sumRate>=0?'profit':'loss');
}

// ────────────────────────────────────────────
// 10이평선 테이블 렌더링
// ────────────────────────────────────────────
function renderSignalTable() {
  var tbody = document.getElementById('signalTableBody');
  if (!appData.stocks.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-chart-line block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = appData.stocks.map(function(s, idx) {
    var canApply = s.type === '시장지수ETF';
    var applyBadge = canApply
      ? '<span class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-lg">✅ 적용 가능</span>'
      : '<span class="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-lg">⚠️ 적용 불가</span>';
    var stateHtml  = '<span class="text-xs text-slate-400">-</span>';
    var actionHtml = '<span class="text-xs text-slate-400">-</span>';
    if (canApply && s.ma10 > 0 && s.monthEndPrice > 0) {
      var isBull = s.monthEndPrice > s.ma10;
      stateHtml  = isBull ? '<span class="bull-market">🟢 상승장</span>' : '<span class="bear-market">🔴 하락장</span>';
      actionHtml = isBull ? '<span class="text-sm font-bold text-green-700">✅ 계속 모으기</span>' : '<span class="text-sm font-bold text-red-700">🛑 매수 중단</span>';
    } else if (!canApply) {
      actionHtml = '<span class="text-xs text-amber-600">개별주식 전략 별도 관리</span>';
    }
    var meInput = canApply
      ? '<input type="text" value="' + (s.monthEndPrice ? fmtInputDisplay(s.monthEndPrice) : '') + '" ' +
        'data-idx="' + idx + '" data-field="monthEndPrice" ' +
        'class="inp-num w-28 text-sm" placeholder="말일종가 입력"/>'
      : '<span class="text-xs text-slate-400">해당없음</span>';
    var maInput = canApply
      ? '<input type="text" value="' + (s.ma10 ? fmtInputDisplay(s.ma10) : '') + '" ' +
        'data-idx="' + idx + '" data-field="ma10" ' +
        'class="inp-num w-28 text-sm" placeholder="10이평선 입력"/>'
      : '<span class="text-xs text-slate-400">해당없음</span>';
    return '<tr>' +
      '<td><div class="font-bold text-slate-800">' + s.name + '</div><div class="text-xs text-slate-400">' + s.broker + '</div></td>' +
      '<td><span class="text-xs px-2 py-1 rounded-lg ' + (s.type==='시장지수ETF'?'bg-blue-50 text-blue-700':'bg-slate-100 text-slate-600') + '">' + s.type + '</span></td>' +
      '<td>' + applyBadge + '</td>' +
      '<td>' + meInput + '</td>' +
      '<td>' + maInput + '</td>' +
      '<td>' + stateHtml + '</td>' +
      '<td>' + actionHtml + '</td>' +
    '</tr>';
  }).join('');
}

// ────────────────────────────────────────────
// 현금흐름 테이블 렌더링
// ────────────────────────────────────────────
function renderCashflowTable() {
  var tbody = document.getElementById('cashflowTableBody');
  if (!appData.stocks.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><i class="fas fa-wallet block"></i><p>마스터 데이터에 종목을 추가하면 자동으로 나타나요</p></div></td></tr>';
    document.getElementById('cf-monthly-sum').textContent = '₩0';
    document.getElementById('cf-annual-sum').textContent  = '₩0';
    document.getElementById('cf-stop-count').textContent  = '0개';
    return;
  }
  var monthlySum=0, annualSum=0, stopCount=0;
  tbody.innerHTML = appData.stocks.map(function(s, idx) {
    var monthly = calcMonthly(s), annual = monthly*12;
    monthlySum += monthly; annualSum += annual;
    if (s.cfDecision==='중단검토' || s.cfCycle==='안함') stopCount++;
    var dColor = s.cfDecision==='계속' ? 'color:#15803d' : s.cfDecision==='중단검토' ? 'color:#dc2626' : 'color:#64748b';
    return '<tr>' +
      '<td><span class="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-lg">' + s.broker + '</span></td>' +
      '<td><div class="font-bold text-slate-800">' + s.name + '</div></td>' +
      '<td><select data-idx="' + idx + '" data-action="cfCycle" class="inp-sel text-sm">' +
        '<option value="매일" ' + (s.cfCycle==='매일'?'selected':'') + '>📅 매일</option>' +
        '<option value="매주" ' + (s.cfCycle==='매주'?'selected':'') + '>📆 매주</option>' +
        '<option value="매월" ' + (s.cfCycle==='매월'?'selected':'') + '>🗓️ 매월</option>' +
        '<option value="안함" ' + (s.cfCycle==='안함'?'selected':'') + '>🚫 안함</option>' +
      '</select></td>' +
      '<td><input type="text" value="' + fmtInputDisplay(s.cfAmount||0) + '" ' +
        'data-idx="' + idx + '" data-action="cfAmount" ' +
        'class="inp-num w-28 text-sm" placeholder="금액 입력"/></td>' +
      '<td class="font-semibold text-slate-800">₩' + fmtNum(monthly) + '</td>' +
      '<td class="text-slate-600">₩' + fmtNum(annual) + '</td>' +
      '<td><select data-idx="' + idx + '" data-action="cfDecision" class="inp-sel text-sm" style="' + dColor + '">' +
        '<option value="계속" ' + (s.cfDecision==='계속'?'selected':'') + '>✅ 계속</option>' +
        '<option value="중단검토" ' + (s.cfDecision==='중단검토'?'selected':'') + '>🛑 중단검토</option>' +
        '<option value="보류" ' + (s.cfDecision==='보류'?'selected':'') + '>⏸️ 보류</option>' +
      '</select></td>' +
    '</tr>';
  }).join('');

  document.getElementById('cf-monthly-sum').textContent = '₩'+fmtNum(monthlySum);
  document.getElementById('cf-annual-sum').textContent  = '₩'+fmtNum(annualSum);
  document.getElementById('cf-stop-count').textContent  = stopCount+'개';
}

// ────────────────────────────────────────────
// 현금흐름 전용 업데이트 (select/input 포커스 유지)
// ────────────────────────────────────────────
function updateCfCycle(idx, val) {
  appData.stocks[idx].cfCycle = val;
  // 월별이체금액, 연간예상 셀만 업데이트 (테이블 재생성 없이)
  var rows = document.getElementById('cashflowTableBody').querySelectorAll('tr');
  if (rows[idx]) {
    var monthly = calcMonthly(appData.stocks[idx]);
    var tds = rows[idx].querySelectorAll('td');
    if (tds[4]) tds[4].textContent = '₩' + fmtNum(monthly);
    if (tds[5]) tds[5].textContent = '₩' + fmtNum(monthly * 12);
  }
  refreshCashflowSums();
  scheduleSave();
}
function updateCfAmount(idx, val) {
  appData.stocks[idx].cfAmount = parseIntNum(val);
  var rows = document.getElementById('cashflowTableBody').querySelectorAll('tr');
  if (rows[idx]) {
    var monthly = calcMonthly(appData.stocks[idx]);
    var tds = rows[idx].querySelectorAll('td');
    if (tds[4]) tds[4].textContent = '₩' + fmtNum(monthly);
    if (tds[5]) tds[5].textContent = '₩' + fmtNum(monthly * 12);
  }
  refreshCashflowSums();
  scheduleSave();
}
function updateCfDecision(idx, val) {
  appData.stocks[idx].cfDecision = val;
  // 색상만 업데이트
  var rows = document.getElementById('cashflowTableBody').querySelectorAll('tr');
  if (rows[idx]) {
    var sel = rows[idx].querySelectorAll('td')[6] && rows[idx].querySelectorAll('td')[6].querySelector('select');
    if (sel) sel.style.color = val==='계속'?'#15803d':val==='중단검토'?'#dc2626':'#64748b';
  }
  refreshCashflowSums();
  scheduleSave();
}
function refreshCashflowSums() {
  var monthlySum=0, annualSum=0, stopCount=0;
  appData.stocks.forEach(function(s) {
    var m = calcMonthly(s); monthlySum+=m; annualSum+=m*12;
    if (s.cfDecision==='중단검토' || s.cfCycle==='안함') stopCount++;
  });
  document.getElementById('cf-monthly-sum').textContent = '₩'+fmtNum(monthlySum);
  document.getElementById('cf-annual-sum').textContent  = '₩'+fmtNum(annualSum);
  document.getElementById('cf-stop-count').textContent  = stopCount+'개';
  // 대시보드 현금흐름 요약도 업데이트
  document.getElementById('dash-monthly-total').textContent = '₩'+fmtNum(monthlySum);
  document.getElementById('dash-annual-total').textContent  = '₩'+fmtNum(annualSum);
  document.getElementById('dash-stop-count').textContent    = stopCount+'개';
}

// ────────────────────────────────────────────
// 범용 필드 업데이트 (렌더링 없이 데이터만 저장, 저장 예약)
// input onchange용: 테이블 재그리기 없이 계산값만 갱신
// ────────────────────────────────────────────
function updateFieldNoRender(idx, field, val) {
  appData.stocks[idx][field] = val;
  scheduleSave();
  // 마스터 테이블: 해당 행의 계산값만 업데이트
  if (field === 'curPrice') {
    var tbody = document.getElementById('masterTableBody');
    if (tbody) {
      var rows = tbody.querySelectorAll('tr');
      // filtered vs appData 동기화 문제 때문에 전체 재렌더
      renderMasterTable();
      renderDashboard();
    }
  }
  // 이평선 테이블: 행의 상태/행동만 갱신
  if (field === 'monthEndPrice' || field === 'ma10') {
    renderSignalTable();
    renderDashboard();
  }
}

// ────────────────────────────────────────────
// 이벤트 위임: inp-num (숫자 입력), inp-sel (드롭다운)
// data-idx + data-field: 마스터/이평선 테이블 인풋
// data-idx + data-action: 현금흐름 인풋/셀렉트
// ────────────────────────────────────────────
document.addEventListener('change', function(e) {
  var el = e.target;
  // 숫자 입력 필드 (마스터, 이평선)
  if (el.classList.contains('inp-num') && el.dataset.field) {
    var idx = parseInt(el.dataset.idx, 10);
    var field = el.dataset.field;
    updateFieldNoRender(idx, field, parseNum(el.value));
    return;
  }
  // 현금흐름 숫자 입력
  if (el.classList.contains('inp-num') && el.dataset.action === 'cfAmount') {
    var idx = parseInt(el.dataset.idx, 10);
    updateCfAmount(idx, el.value);
    return;
  }
  // 현금흐름 셀렉트
  if (el.classList.contains('inp-sel') && el.dataset.action) {
    var idx = parseInt(el.dataset.idx, 10);
    if (el.dataset.action === 'cfCycle') updateCfCycle(idx, el.value);
    else if (el.dataset.action === 'cfDecision') updateCfDecision(idx, el.value);
    return;
  }
});
// focus/blur: 쉼표 제거 및 추가
document.addEventListener('focus', function(e) {
  var el = e.target;
  if (el.classList && el.classList.contains('inp-num')) {
    el.value = el.value.replace(/,/g, '');
  }
}, true);
document.addEventListener('blur', function(e) {
  var el = e.target;
  if (el.classList && el.classList.contains('inp-num') && el.value) {
    var n = parseFloat(el.value.replace(/,/g,''));
    if (!isNaN(n)) el.value = n.toLocaleString('ko-KR');
  }
}, true);

// ────────────────────────────────────────────
// 모달
// ────────────────────────────────────────────
function openAddModal() {
  document.getElementById('modalTitle').textContent = '📌 종목 추가';
  ['input-broker','input-name'].forEach(function(id) { document.getElementById(id).value=''; });
  document.getElementById('input-type').value = '';
  ['input-avgprice','input-curprice','input-qty'].forEach(function(id) { document.getElementById(id).value=''; });
  document.getElementById('edit-index').value = '-1';
  ['calc-invest','calc-eval','calc-rate'].forEach(function(id) { document.getElementById(id).textContent='-'; });
  document.getElementById('addModal').style.display = 'flex';
}
function openEditModal(idx) {
  var s = appData.stocks[idx];
  document.getElementById('modalTitle').textContent = '✏️ 종목 수정';
  document.getElementById('input-broker').value   = s.broker;
  document.getElementById('input-name').value     = s.name;
  document.getElementById('input-type').value     = s.type;
  document.getElementById('input-avgprice').value = fmtInputDisplay(s.avgPrice);
  document.getElementById('input-curprice').value = fmtInputDisplay(s.curPrice);
  document.getElementById('input-qty').value      = fmtInputDisplay(s.qty);
  document.getElementById('edit-index').value     = idx;
  updateCalcPreview();
  document.getElementById('addModal').style.display = 'flex';
}
function closeModal() { document.getElementById('addModal').style.display = 'none'; }

function updateCalcPreview() {
  var avg = parseNum(document.getElementById('input-avgprice').value);
  var cur = parseNum(document.getElementById('input-curprice').value);
  var qty = parseNum(document.getElementById('input-qty').value);
  var invest = avg*qty, eval_ = cur*qty;
  var rate = invest>0 ? ((eval_-invest)/invest*100) : 0;
  document.getElementById('calc-invest').textContent = invest>0 ? '₩'+fmtNum(invest) : '-';
  document.getElementById('calc-eval').textContent   = eval_>0  ? '₩'+fmtNum(eval_)  : '-';
  var rEl = document.getElementById('calc-rate');
  rEl.textContent  = invest>0 ? fmtRate(rate) : '-';
  rEl.style.color  = rate>=0 ? '#dc2626' : '#2563eb';
}

['input-avgprice','input-curprice','input-qty'].forEach(function(id) {
  document.getElementById(id).addEventListener('input', updateCalcPreview);
});

function saveStock() {
  var broker   = document.getElementById('input-broker').value.trim();
  var name     = document.getElementById('input-name').value.trim();
  var type     = document.getElementById('input-type').value;
  var avgPrice = parseNum(document.getElementById('input-avgprice').value);
  var curPrice = parseNum(document.getElementById('input-curprice').value);
  var qty      = parseNum(document.getElementById('input-qty').value);
  var editIdx  = parseInt(document.getElementById('edit-index').value, 10);

  if (!broker||!name||!type||!avgPrice||!curPrice||!qty) {
    alert('모든 항목을 입력해주세요!\\n\\n• 증권사/앱 이름\\n• 주식/ETF 이름\\n• 종류\\n• 평균매수단가\\n• 현재주가\\n• 보유수량');
    return;
  }
  var stock = { broker: broker, name: name, type: type, avgPrice: avgPrice, curPrice: curPrice, qty: qty,
    monthEndPrice: curPrice, ma10: 0, cfCycle: '매월', cfAmount: 0, cfDecision: '계속' };

  if (editIdx >= 0) {
    var old = appData.stocks[editIdx];
    stock.monthEndPrice = old.monthEndPrice || curPrice;
    stock.ma10          = old.ma10 || 0;
    stock.cfCycle       = old.cfCycle || '매월';
    stock.cfAmount      = old.cfAmount || 0;
    stock.cfDecision    = old.cfDecision || '계속';
    appData.stocks[editIdx] = stock;
    toast('종목이 수정됐어요!', 'success');
  } else {
    appData.stocks.push(stock);
    toast(name + ' 종목이 추가됐어요!', 'success');
  }
  closeModal();
  scheduleSave();
  renderAll();
}

function deleteStock(idx) {
  var s = appData.stocks[idx];
  if (!confirm('"' + s.name + '" 종목을 삭제할까요?\\n삭제하면 되돌릴 수 없어요.')) return;
  appData.stocks.splice(idx, 1);
  scheduleSave();
  renderAll();
  toast(s.name + ' 종목이 삭제됐어요', 'info');
}

// ────────────────────────────────────────────
// 전체 렌더링
// ────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderMasterTable();
  renderSignalTable();
  renderCashflowTable();
}

// ────────────────────────────────────────────
// 앱 시작
// ────────────────────────────────────────────
window.onload = function() {
  showScreen('loading', 'Google 연결 중...', '');
  var tries = 0;
  var wait = setInterval(function() {
    tries++;
    if (typeof google !== 'undefined' && typeof gapi !== 'undefined') {
      clearInterval(wait);
      initGoogleAuth();
    } else if (tries > 60) { // 6초 타임아웃
      clearInterval(wait);
      toast('Google 스크립트 로드 실패. 새로고침 해주세요.', 'error');
      showScreen('login');
    }
  }, 100);
};
</script>
</body>
</html>`;
}

export default app
