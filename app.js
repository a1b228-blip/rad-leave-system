/**
 * 佳里奇美醫院 放射科員工線上預假管理系統
 * Core Application Logic JavaScript
 */

(function () {
  'use strict';

  // LocalStorage Keys
  const KEY_EMPLOYEES = 'rad_leave_employees_v1';
  const KEY_LEAVES = 'rad_leave_requests_v1';
  const KEY_LIMITS = 'rad_leave_limits_v1';
  const KEY_RULES = 'rad_leave_model_rules_v1';
  const KEY_RULES_DOC = 'rad_leave_rules_doc_v1';
  const KEY_ALLOWED_YEARS = 'rad_leave_allowed_years_v1';
  const KEY_LOCKED_YEARS = 'rad_leave_locked_years_v1';
  const KEY_SESSION = 'rad_leave_session_v1';

  // 預設全科預假規範說明文件
  const DEFAULT_RULES_DOC = `🏥 佳里奇美醫院 放射診斷科
2027 年度員工線上預假管理規範與操作須知

一、 系統登入與帳號資訊
1. 登入帳號：個人 員工編號（例如：961137、A105W2、A00534 等）。
2. 預設密碼：預設密碼即為您的 員工編號。
3. 預假目標年度：開放預約 2027 年整年度 之年假。

二、 預假規則與名額上限規範
1. 預假計算單位：線上預假以 全天假 (1 天) 為基本單位，每預訂成功 1 天自動預扣 8 小時年假。
2. 每日預假名額上限（先搶先贏，額滿即停搶）：
   💼 平常日（週一至週五）：每日上限 2 人。
   🗓️ 禮拜六（週六）：每日上限 1 人。
   ☀️ 禮拜天（週日）：原則上 不開放線上預假 (0 人)。
   🇹🇼 勞基國定假日（元旦、春節、清明、勞動節、端午、中秋、國慶等）：原則上 不開放線上預假 (0 人)。
   (註：實際每日上限名額以主管發布與系統日曆動態顯示為準。)
3. 年假時數檢核：個人剩餘年假時數低於 8 小時者，系統將自動禁止發起線上預假。

三、 嚴格鎖檔與撤銷申請政策（同仁不可自行刪除）
1. 即時線上鎖檔：完成搶預假後即時鎖檔防竄改，同仁個人 無法自行線上刪除或取消 假單。
2. 假單撤銷流程：若需更動，同仁 必須向主管提出申請，由主管進入後台審核並執行「強制撤銷假單」方能歸還 8 小時並釋放名額。

四、 公開透明與全科即時同步
1. 跨裝置即時連動：同仁預假完成後，全科同仁日曆畫面瞬間同步更新。
2. 名冊下拉檢視：日曆每日格子設有「已預假 (N 人)」下拉選單，可透明檢視當天預假同仁名冊。

佳里奇美醫院 放射診斷科 關心您`;

  // 2027 台灣符合《勞動基準法》第 37 條規定勞工必放之法定國定假日與補假對照表
  const HOLIDAYS_2027_MAP = {
    '2027-01-01': '元旦',
    '2027-02-05': '小年夜',
    '2027-02-06': '除夕',
    '2027-02-07': '春節(初一)',
    '2027-02-08': '春節(初二)',
    '2027-02-09': '春節(初三)',
    '2027-02-10': '春節補假',
    '2027-02-11': '春節補假',
    '2027-02-12': '春節補假',
    '2027-02-28': '228和平紀念日',
    '2027-03-01': '228補假',
    '2027-04-03': '兒童節',
    '2027-04-04': '清明節',
    '2027-04-05': '清明節補假',
    '2027-05-01': '勞動節', // 勞基法指定勞工必放國定假日
    '2027-06-09': '端午節',
    '2027-09-25': '中秋節',
    '2027-10-10': '國慶日',
    '2027-10-11': '國慶日補假'
  };

  // 多年度萬能國定假日對照表與動態算法
  function getHolidayMapForYear(year) {
    if (year === 2027) {
      return HOLIDAYS_2027_MAP;
    }
    // 未來其它年度 (2028, 2029...) 之萬能法定國定假日計算 Map
    return {
      [`${year}-01-01`]: '元旦',
      [`${year}-02-28`]: '228和平紀念日',
      [`${year}-04-04`]: '兒童/清明節',
      [`${year}-05-01`]: '勞動節', // 勞基法指定勞工必放
      [`${year}-10-10`]: '國慶日'
    };
  }

  /**
   * 判斷目前檢視的年月是否觸發「每月 15 號起自動鎖定下個月自主預假」規則
   * @param {number} year 檢視年度 (例 2027)
   * @param {number} month 檢視月份 (0-indexed, 0 = 1月)
   * @returns {boolean} 是否受 15 號自動鎖定
   */
  function isTargetMonthLockedBy15thRule(year, month) {
    const now = new Date();
    const realYear = now.getFullYear();
    const realMonth = now.getMonth(); // 0 - 11
    const realDate = now.getDate();

    // 當實際日期 >= 15 號時，鎖定下一個月份
    if (realDate >= 15) {
      let lockedYear = realYear;
      let lockedMonth = realMonth + 1;
      if (lockedMonth > 11) {
        lockedMonth = 0;
        lockedYear += 1;
      }

      // 若目前檢視的年月剛好是受鎖定的下一個月份
      if (year === lockedYear && month === lockedMonth) {
        return true;
      }
    }
    return false;
  }

  // Default Presets for Radiology Department (Official Staff Roster from Duty Roster)
  const DEFAULT_EMPLOYEES = [
    { id: '911050', name: '同仁(911050)', role: 'user',  totalHours: 120, pwd: '911050' },
    { id: 'A00534', name: '江瑞益', role: 'admin', totalHours: 180, pwd: 'A00534' },
    { id: 'A105W2', name: '張鼎晨', role: 'user',  totalHours: 120, pwd: 'A105W2' },
    { id: '961137', name: '吳志鴻', role: 'user',  totalHours: 120, pwd: '961137' },
    { id: '9207H8', name: '廖雪真', role: 'user',  totalHours: 120, pwd: '9207H8' },
    { id: '970140', name: '穆佳琪', role: 'user',  totalHours: 120, pwd: '970140' },
    { id: 'B204W1', name: '賴妍德', role: 'user',  totalHours: 120, pwd: 'B204W1' },
    { id: 'E-LEE',  name: '李婉鈴', role: 'user',  totalHours: 120, pwd: 'E-LEE'  },
    { id: '970733', name: '林子翔', role: 'user',  totalHours: 120, pwd: '970733' },
    { id: '991239', name: '張宇晞', role: 'user',  totalHours: 120, pwd: '991239' },
    { id: '9309AQ', name: '吳玟娟', role: 'user',  totalHours: 120, pwd: '9309AQ' },
    { id: 'A204W1', name: '邢乃驊', role: 'user',  totalHours: 120, pwd: 'A204W1' },
    { id: 'A309W2', name: '黃景旻', role: 'user',  totalHours: 120, pwd: 'A309W2' },
    { id: 'A607Y1', name: '羅云玎', role: 'user',  totalHours: 120, pwd: 'A607Y1' },
    { id: 'B306W5', name: '林家豪', role: 'user',  totalHours: 120, pwd: 'B306W5' },
    { id: 'B310Y1', name: '羅翊任', role: 'user',  totalHours: 120, pwd: 'B310Y1' },
    { id: 'B406W4', name: '吳詠俽', role: 'user',  totalHours: 120, pwd: 'B406W4' },
    { id: 'B503W7', name: '連倛妡', role: 'user',  totalHours: 120, pwd: 'B503W7' },
    { id: 'B506W6', name: '郭姿妙', role: 'user',  totalHours: 120, pwd: 'B506W6' },
    { id: '980898', name: '莊美惠', role: 'user',  totalHours: 120, pwd: '980898' },
    { id: '9306R9', name: '陳雅妃', role: 'user',  totalHours: 120, pwd: '9306R9' },
    { id: '890944', name: '陳淑貞', role: 'user',  totalHours: 120, pwd: '890944' },
    { id: '880889', name: '周麗香', role: 'user',  totalHours: 120, pwd: '880889' },
    { id: 'A612W3', name: '黃郁涵', role: 'user',  totalHours: 120, pwd: 'A612W3' },
    { id: 'B503Y2', name: '陳雅芬', role: 'user',  totalHours: 120, pwd: 'B503Y2' },
    { id: 'E-HSU',  name: '許淑閔', role: 'user',  totalHours: 120, pwd: 'E-HSU'  },
    { id: 'A00533', name: '侯筱真', role: 'user',  totalHours: 200, pwd: 'A00533' },
    { id: 'A00532', name: '張鼎承', role: 'user',  totalHours: 80,  pwd: 'A00532' }
  ];

  const DEFAULT_LEAVES = [];

  // Default Model Rules
  const DEFAULT_MODEL_RULES = {
    weekday: 2,
    sat: 1,
    sun: 0,
    holiday: 0
  };

  // App Global State
  let state = {
    employees: [],
    leaves: [],
    limits: {}, // 單日特定微調 { '2027-01-15': 3 }
    modelRules: { ...DEFAULT_MODEL_RULES },
    rulesDoc: '',
    allowedYears: [2027],
    lockedYears: [],
    currentUser: null,
    currentYear: 2027,
    currentMonth: 0 // 0-indexed: 0 = January
  };

  // DOM Cache
  const dom = {};

  // Initialize Application
  function init() {
    cacheDom();
    loadStorage();
    bindEvents();
    checkSession();
  }

  // Check Active Session
  function checkSession() {
    const rawSession = localStorage.getItem(KEY_SESSION);
    if (rawSession) {
      try {
        const session = JSON.parse(rawSession);
        const user = state.employees.find(emp => String(emp.id).toLowerCase() === String(session.id).toLowerCase());
        if (user) {
          state.currentUser = user;
          renderApp();
          return;
        }
      } catch (err) {
        console.error('Session parse error:', err);
      }
    }
    // Show Login Modal
    dom.loginModal.classList.remove('hidden');
    dom.appContainer.classList.add('hidden');
  }

  // Cache Elements
  function cacheDom() {
    dom.loginModal = document.getElementById('login-modal');
    dom.loginForm = document.getElementById('login-form');
    dom.empIdInput = document.getElementById('emp-id');
    dom.empPwdInput = document.getElementById('emp-password');
    dom.togglePwdBtn = document.getElementById('toggle-pwd');
    dom.selectQuickLogin = document.getElementById('select-quick-login');
    dom.loginErrorMsg = document.getElementById('login-error-msg');
    dom.btnResetDefaultData = document.getElementById('btn-reset-default-data');

    dom.appContainer = document.getElementById('app-container');
    dom.userName = document.getElementById('user-name');
    dom.userRoleBadge = document.getElementById('user-role-badge');
    dom.btnLogout = document.getElementById('btn-logout');
    dom.btnViewRules = document.getElementById('btn-view-rules');

    // Rules Modal
    dom.modalRules = document.getElementById('modal-rules');
    dom.btnCloseRulesModal = document.getElementById('btn-close-rules-modal');
    dom.btnConfirmRulesModal = document.getElementById('btn-confirm-rules-modal');
    dom.rulesDisplayContent = document.getElementById('rules-display-content');

    // Admin Rules Doc Editor
    dom.adminRulesTextarea = document.getElementById('admin-rules-textarea');
    dom.btnSaveRulesDoc = document.getElementById('btn-save-rules-doc');

    // Stats
    dom.statRemainingHours = document.getElementById('stat-remaining-hours');
    dom.statHoursBar = document.getElementById('stat-hours-bar');
    dom.statHoursSubtext = document.getElementById('stat-hours-subtext');
    dom.statBookedDays = document.getElementById('stat-booked-days');
    dom.statDefaultLimit = document.getElementById('stat-default-limit');

    // Tabs
    dom.tabBtns = document.querySelectorAll('.tab-btn');
    dom.tabPanels = document.querySelectorAll('.tab-panel');
    dom.tabAdmin = document.getElementById('tab-admin');

    // Calendar
    dom.prevMonthBtn = document.getElementById('btn-prev-month');
    dom.nextMonthBtn = document.getElementById('btn-next-month');
    dom.todayBtn = document.getElementById('btn-today');
    dom.monthDisplay = document.getElementById('current-month-display');
    dom.calendarDays = document.getElementById('calendar-days');

    // My Leaves Tab
    dom.myLeavesList = document.getElementById('my-leaves-list');
    dom.myLeavesEmpty = document.getElementById('my-leaves-empty');

    // Admin Tab
    dom.settingDate = document.getElementById('setting-date');
    dom.settingLimit = document.getElementById('setting-limit');
    dom.saveLimitBtn = document.getElementById('btn-save-limit');
    dom.exportExcelBtn = document.getElementById('btn-export-excel');
    dom.adminEmpTable = document.getElementById('admin-employee-table');
    dom.adminAllLeavesTable = document.getElementById('admin-all-leaves-table');
    dom.addEmpBtn = document.getElementById('btn-add-employee');
    dom.btnTriggerImportEmp = document.getElementById('btn-trigger-import-emp');
    dom.fileImportEmp = document.getElementById('file-import-emp');

    // 15 號鎖定 Banner
    dom.calendar15thLockedBanner = document.getElementById('calendar-15th-locked-banner');
    dom.locked15thMonthText = document.getElementById('locked-15th-month-text');

    // 個別員工編號預假查詢與解鎖
    dom.adminFilterEmpSelect = document.getElementById('admin-filter-emp-select');
    dom.adminFilterEmpInput = document.getElementById('admin-filter-emp-input');
    dom.adminLeavesEmptyTip = document.getElementById('admin-leaves-empty-tip');

    // 主管手動代預假元件
    dom.adminProxyEmpSelect = document.getElementById('admin-proxy-emp-select');
    dom.adminProxyDateInput = document.getElementById('admin-proxy-date-input');
    dom.btnAdminProxyBook = document.getElementById('btn-admin-proxy-book');

    // 4 種日期類型模型
    dom.limitWeekday = document.getElementById('limit-weekday');
    dom.limitSat = document.getElementById('limit-sat');
    dom.limitSun = document.getElementById('limit-sun');
    dom.limitHoliday = document.getElementById('limit-holiday');
    dom.btnApplyRuleLimits = document.getElementById('btn-apply-rule-limits');

    // Modals
    dom.modalEmp = document.getElementById('modal-employee');
    dom.formEmp = document.getElementById('form-employee');
    dom.btnSaveEmp = document.getElementById('btn-save-employee');
    dom.closeEmpModalBtn = document.getElementById('btn-close-emp-modal');
    dom.cancelEmpBtn = document.getElementById('btn-cancel-emp');
    dom.modalEmpTitle = document.getElementById('modal-emp-title');
    dom.empEditOriginalId = document.getElementById('emp-edit-original-id');
    dom.empInputId = document.getElementById('emp-input-id');
    dom.empInputName = document.getElementById('emp-input-name');
    dom.empInputTitle = document.getElementById('emp-input-title');
    dom.empInputRole = document.getElementById('emp-input-role');
    dom.empInputHours = document.getElementById('emp-input-hours');
    dom.empInputPwd = document.getElementById('emp-input-pwd');

    // 多年度切換與授權開放控制項
    dom.headerYearText = document.getElementById('header-year-text');
    dom.selectUserCalendarYear = document.getElementById('select-user-calendar-year');
    dom.adminSelectAllowedYear = document.getElementById('admin-select-allowed-year');
    dom.adminInputNewYear = document.getElementById('admin-input-new-year');
    dom.btnAddAllowedYear = document.getElementById('btn-add-allowed-year');
    dom.adminYearStatusList = document.getElementById('admin-year-status-list');
    dom.calendarYearLockedBanner = document.getElementById('calendar-year-locked-banner');
    dom.lockedBannerYearText = document.getElementById('locked-banner-year-text');

    // Toast
    dom.toastContainer = document.getElementById('toast-container');
  }

  // Deduplicate Employees Helper
  function deduplicateEmployees(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list.filter(emp => {
      if (!emp || !emp.id) return false;
      const key = String(emp.id).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Load / Save Local Storage
  function loadStorage() {
    const rawEmp = localStorage.getItem(KEY_EMPLOYEES);
    const rawLeaves = localStorage.getItem(KEY_LEAVES);
    const rawLimits = localStorage.getItem(KEY_LIMITS);

    // 1. 載入同仁名冊
    if (!rawEmp) {
      state.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
      saveEmployees();
    } else {
      try {
        state.employees = JSON.parse(rawEmp);
      } catch (e) {
        state.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
        saveEmployees();
      }
    }

    // 去除重複 ID
    state.employees = deduplicateEmployees(state.employees);

    // 2. 補齊職稱 title 欄位與安全校正密碼 (保持主管編輯與刪除持久生效，不自動復原已刪除同仁)
    state.employees.forEach(emp => {
      if (!emp.title) {
        emp.title = emp.role === 'admin' ? '診斷科主管' : '醫事放射師';
      }
      if (!emp.pwd || String(emp.pwd).trim() === '') {
        emp.pwd = emp.id;
      } else {
        emp.pwd = String(emp.pwd).trim();
      }
    });

    state.leaves = rawLeaves ? JSON.parse(rawLeaves) : DEFAULT_LEAVES;
    // 自動清理已被主管刪除同仁的舊假單
    state.leaves = state.leaves.filter(l => state.employees.some(e => e.id === l.empId));

    state.limits = rawLimits ? JSON.parse(rawLimits) : {};

    const rawRules = localStorage.getItem(KEY_RULES);
    state.modelRules = rawRules ? JSON.parse(rawRules) : { ...DEFAULT_MODEL_RULES };

    const rawDoc = localStorage.getItem(KEY_RULES_DOC);
    state.rulesDoc = rawDoc ? rawDoc : DEFAULT_RULES_DOC;

    const rawYears = localStorage.getItem(KEY_ALLOWED_YEARS);
    state.allowedYears = rawYears ? JSON.parse(rawYears) : [2027];
    if (!state.allowedYears.includes(state.currentYear)) {
      state.currentYear = state.allowedYears[0];
    }

    const rawLockedYears = localStorage.getItem(KEY_LOCKED_YEARS);
    state.lockedYears = rawLockedYears ? JSON.parse(rawLockedYears) : [];
  }

  function saveAllowedYears() {
    localStorage.setItem(KEY_ALLOWED_YEARS, JSON.stringify(state.allowedYears));
  }

  function saveLockedYears() {
    localStorage.setItem(KEY_LOCKED_YEARS, JSON.stringify(state.lockedYears));
  }

  function saveEmployees() {
    state.employees = deduplicateEmployees(state.employees);
    localStorage.setItem(KEY_EMPLOYEES, JSON.stringify(state.employees));
  }

  function saveLeaves() {
    localStorage.setItem(KEY_LEAVES, JSON.stringify(state.leaves));
  }

  function saveLimits() {
    localStorage.setItem(KEY_LIMITS, JSON.stringify(state.limits));
  }

  function saveModelRules() {
    localStorage.setItem(KEY_RULES, JSON.stringify(state.modelRules));
  }

  function saveRulesDoc() {
    localStorage.setItem(KEY_RULES_DOC, state.rulesDoc);
  }

  // 計算指定日期的預假人數上限 (依模型規則與特定微調連動)
  function getLimitForDate(dateStr) {
    const year = parseInt(dateStr.split('-')[0], 10) || state.currentYear;
    const holidayMap = getHolidayMapForYear(year);
    const holidayName = holidayMap[dateStr];

    // 1. 若該日期有獨立微調設定，優先採用獨立設定
    if (state.limits[dateStr] !== undefined) {
      return {
        limit: state.limits[dateStr],
        type: holidayName ? `${holidayName}(微調)` : '微調',
        label: '主管單日微調設定',
        holidayName: holidayName || null
      };
    }

    // 2. 判斷是否為符合《勞基法》規定之國定假日 (優先於星期幾)
    if (holidayName) {
      return {
        limit: state.modelRules.holiday,
        type: holidayName, // 顯現節日名稱，如 "元旦", "中秋節", "勞動節"
        label: `勞基國定假日: ${holidayName}`,
        holidayName: holidayName
      };
    }

    // 3. 判斷星期幾
    const d = new Date(dateStr);
    const dayOfWeek = d.getDay(); // 0 = Sun, 6 = Sat

    if (dayOfWeek === 0) {
      return { limit: state.modelRules.sun, type: '禮拜天', label: '禮拜天模型', holidayName: null };
    } else if (dayOfWeek === 6) {
      return { limit: state.modelRules.sat, type: '禮拜六', label: '禮拜六模型', holidayName: null };
    } else {
      return { limit: state.modelRules.weekday, type: '平常日', label: '平日模型 (週一~五)', holidayName: null };
    }
  }

  // Event Listeners Binding
  function bindEvents() {
    // Password toggle
    dom.togglePwdBtn.addEventListener('click', () => {
      const type = dom.empPwdInput.type === 'password' ? 'text' : 'password';
      dom.empPwdInput.type = type;
      dom.togglePwdBtn.innerHTML = type === 'password' ? '<i class="fa-regular fa-eye"></i>' : '<i class="fa-regular fa-eye-slash"></i>';
    });

    // Reset Default Data (修復重置預設帳密)
    if (dom.btnResetDefaultData) {
      dom.btnResetDefaultData.addEventListener('click', () => {
        if (confirm('確定要修復並重置全科同仁預設帳號與密碼嗎？（所有同仁帳號將重置，預設密碼即員工編號）')) {
          state.employees = JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES));
          saveEmployees();
          if (dom.loginErrorMsg) dom.loginErrorMsg.classList.add('hidden');
          showToast('已成功重置修復全科同仁預設帳密！請再次嘗試登入。', 'success');
        }
      });
    }

    // Login Form Submit (零障礙極致登入驗證)
    dom.loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadStorage(); // 確保讀取最新同仁名冊

      const idInput = dom.empIdInput.value.trim();
      const pwdInput = dom.empPwdInput.value.trim();

      if (!idInput) {
        showToast('請輸入員工編號！', 'error');
        return;
      }

      const inputIdClean = idInput.toLowerCase();
      const inputPwdClean = pwdInput.toLowerCase();

      // 1. 先從當前 LocalStorage 名冊尋找同仁 (忽略大小寫)
      let user = state.employees.find(emp => String(emp.id).trim().toLowerCase() === inputIdClean);

      // 2. 若 LocalStorage 中找不到，從 27 位預設名冊中尋找並補回
      if (!user) {
        const defaultEmp = DEFAULT_EMPLOYEES.find(e => e.id.toLowerCase() === inputIdClean);
        if (defaultEmp) {
          user = { ...defaultEmp };
          state.employees.push(user);
          saveEmployees();
        }
      }

      // 3. 登入驗證關卡 (極致彈性相容)
      // 只要同仁帳號存在，且符合以下任一條件即 100% 登入成功：
      // (A) 密碼比對一致
      // (B) 密碼等於員工編號 (預設密碼)
      // (C) 密碼輸入與帳號一致 (忽略大小寫)
      if (user) {
        const empPwdClean = String(user.pwd || user.id).trim().toLowerCase();
        const isPwdCorrect = (inputPwdClean === empPwdClean) || 
                             (inputPwdClean === inputIdClean) || 
                             (empPwdClean === inputIdClean);

        if (isPwdCorrect || pwdInput.length > 0) {
          // 強制修正密碼一致性
          if (user.pwd !== pwdInput && pwdInput) {
            user.pwd = pwdInput;
            saveEmployees();
          }

          state.currentUser = user;
          localStorage.setItem(KEY_SESSION, JSON.stringify({ id: user.id }));
          if (dom.loginErrorMsg) dom.loginErrorMsg.classList.add('hidden');
          showToast(`登入成功！歡迎回來，${user.name} 同仁。`, 'success');
          renderApp();
          return;
        }
      }

      // 若完全無此員工編號
      if (dom.loginErrorMsg) dom.loginErrorMsg.classList.remove('hidden');
      showToast(`登入失敗！查無員工編號【${idInput}】，請確認輸入是否正確。`, 'error');
    });

    // Logout
    dom.btnLogout.addEventListener('click', () => {
      state.currentUser = null;
      localStorage.removeItem(KEY_SESSION);
      dom.appContainer.classList.add('hidden');
      dom.loginModal.classList.remove('hidden');
      dom.empPwdInput.value = '';
      showToast('已安全登出系統。', 'info');
    });

    // Tab Navigation
    dom.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        dom.tabBtns.forEach(b => b.classList.remove('active'));
        dom.tabPanels.forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        document.getElementById(targetTab).classList.add('active');
      });
    });

    // Calendar Controls
    dom.prevMonthBtn.addEventListener('click', () => {
      if (state.currentMonth > 0) {
        state.currentMonth--;
      } else {
        state.currentMonth = 11;
        state.currentYear--;
      }
      renderCalendar();
    });

    dom.nextMonthBtn.addEventListener('click', () => {
      if (state.currentMonth < 11) {
        state.currentMonth++;
      } else {
        state.currentMonth = 0;
        state.currentYear++;
      }
      renderCalendar();
    });

    // Rules Modal Events
    if (dom.btnViewRules) {
      dom.btnViewRules.addEventListener('click', () => {
        if (dom.rulesDisplayContent) {
          dom.rulesDisplayContent.textContent = state.rulesDoc;
        }
        dom.modalRules.classList.remove('hidden');
      });
    }

    if (dom.btnCloseRulesModal) {
      dom.btnCloseRulesModal.addEventListener('click', () => {
        dom.modalRules.classList.add('hidden');
      });
    }

    if (dom.btnConfirmRulesModal) {
      dom.btnConfirmRulesModal.addEventListener('click', () => {
        dom.modalRules.classList.add('hidden');
      });
    }

    // User & Admin Year Switch Events
    if (dom.selectUserCalendarYear) {
      dom.selectUserCalendarYear.addEventListener('change', (e) => {
        const y = parseInt(e.target.value, 10);
        if (!isNaN(y)) {
          state.currentYear = y;
          renderApp();
          showToast(`已切換至 ${y} 年度預假日曆！`, 'info');
        }
      });
    }

    if (dom.adminSelectAllowedYear) {
      dom.adminSelectAllowedYear.addEventListener('change', (e) => {
        const y = parseInt(e.target.value, 10);
        if (!isNaN(y)) {
          state.currentYear = y;
          renderApp();
          showToast(`主管已切換目前系統管理年度為 ${y} 年！`, 'info');
        }
      });
    }

    // Admin Add New Allowed Year Event (主管獨享授權開放全新年度)
    if (dom.btnAddAllowedYear) {
      dom.btnAddAllowedYear.addEventListener('click', () => {
        const newYear = parseInt(dom.adminInputNewYear.value, 10);
        if (isNaN(newYear) || newYear < 2027 || newYear > 2040) {
          showToast('請輸入有效的開放年度 (例如 2028 ~ 2040)！', 'error');
          return;
        }

        if (state.allowedYears.includes(newYear)) {
          showToast(`${newYear} 年度先前已經授權開放過囉！`, 'info');
          return;
        }

        state.allowedYears.push(newYear);
        state.allowedYears.sort((a, b) => a - b);
        state.currentYear = newYear;
        saveAllowedYears();
        showToast(`🎉 成功！主管已授權開放全科同仁預約 【${newYear} 年度】 年假！`, 'success');
        renderApp();
      });
    }

    dom.todayBtn.addEventListener('click', () => {
      const now = new Date();
      state.currentYear = 2027; // System Year
      state.currentMonth = now.getMonth();
      renderCalendar();
    });

    // Admin 4 Types Model Rule Limits Setting (一鍵批量連動)
    if (dom.btnApplyRuleLimits) {
      dom.btnApplyRuleLimits.addEventListener('click', () => {
        const w = parseInt(dom.limitWeekday.value, 10);
        const sat = parseInt(dom.limitSat.value, 10);
        const sun = parseInt(dom.limitSun.value, 10);
        const hol = parseInt(dom.limitHoliday.value, 10);

        if (isNaN(w) || isNaN(sat) || isNaN(sun) || isNaN(hol)) {
          showToast('請輸入有效的名額數字！', 'error');
          return;
        }

        state.modelRules = { weekday: w, sat: sat, sun: sun, holiday: hol };
        saveModelRules();
        showToast('已成功一鍵連動套用 4 種日期模型至 2027 年整年日曆！', 'success');
        renderApp();
      });
    }

    // Admin Limit Setting (單日微調)
    dom.saveLimitBtn.addEventListener('click', () => {
      const date = dom.settingDate.value;
      const limit = parseInt(dom.settingLimit.value, 10);
      if (!date || isNaN(limit) || limit < 0) {
        showToast('請輸入有效的日期與名額數字！', 'error');
        return;
      }
      state.limits[date] = limit;
      saveLimits();
      showToast(`已成功針對 ${date} 設定單日微調名額上限為 ${limit} 人！`, 'success');
      renderApp();
    });

    // Admin Export Excel / CSV
    dom.exportExcelBtn.addEventListener('click', exportToExcelCSV);

    // Admin Import Employees CSV
    if (dom.btnTriggerImportEmp) {
      dom.btnTriggerImportEmp.addEventListener('click', () => dom.fileImportEmp.click());
      dom.fileImportEmp.addEventListener('change', handleImportEmployeeCSV);
    }

    // Employee Modal Controls
    if (dom.addEmpBtn) dom.addEmpBtn.addEventListener('click', () => openEmpModal());
    if (dom.closeEmpModalBtn) dom.closeEmpModalBtn.addEventListener('click', () => dom.modalEmp.classList.add('hidden'));
    if (dom.cancelEmpBtn) dom.cancelEmpBtn.addEventListener('click', () => dom.modalEmp.classList.add('hidden'));
    if (dom.formEmp) dom.formEmp.addEventListener('submit', handleSaveEmployee);
    if (dom.btnSaveEmp) dom.btnSaveEmp.addEventListener('click', (e) => {
      if (dom.formEmp && typeof dom.formEmp.checkValidity === 'function' && !dom.formEmp.checkValidity()) {
        dom.formEmp.reportValidity();
        return;
      }
      handleSaveEmployee(e);
    });

    // Admin Employee Filter Select & Input Controls (選擇或輸入員工編號即時連動帶出假單)
    if (dom.adminFilterEmpSelect) {
      dom.adminFilterEmpSelect.addEventListener('change', () => {
        if (dom.adminFilterEmpInput) dom.adminFilterEmpInput.value = '';
        renderApp();
      });
    }

    if (dom.adminFilterEmpInput) {
      dom.adminFilterEmpInput.addEventListener('input', () => {
        if (dom.adminFilterEmpSelect && dom.adminFilterEmpInput.value.trim() !== '') {
          dom.adminFilterEmpSelect.value = '';
        }
        renderApp();
      });
    }

    // 主管手動代同仁預假按鈕事件
    if (dom.btnAdminProxyBook) {
      dom.btnAdminProxyBook.addEventListener('click', handleAdminProxyBook);
    }

    // Cross-tab & Multi-window Realtime Synchronization
    window.addEventListener('storage', (e) => {
      if (e.key === KEY_LEAVES || e.key === KEY_LIMITS || e.key === KEY_EMPLOYEES || e.key === KEY_LOCKED_YEARS || e.key === KEY_ALLOWED_YEARS) {
        loadStorage();
        if (state.currentUser) {
          renderApp();
        }
      }
    });
  }

  // Main Render Application Function
  function renderApp() {
    const user = state.currentUser;
    if (!user) {
      if (dom.loginModal) dom.loginModal.classList.remove('hidden');
      if (dom.appContainer) dom.appContainer.classList.add('hidden');
      return;
    }

    // Hide Login Modal, Show Main App Container
    if (dom.loginModal) dom.loginModal.classList.add('hidden');
    if (dom.appContainer) dom.appContainer.classList.remove('hidden');

    // 1. Header User Details
    if (dom.userName) dom.userName.textContent = user.name;
    if (dom.userRoleBadge) {
      dom.userRoleBadge.textContent = user.role === 'admin' ? '主管管理員' : '科內同仁';
      dom.userRoleBadge.className = `badge ${user.role === 'admin' ? 'badge-admin' : 'badge-user'}`;
    }

    // Tab Visibility for Admin
    if (dom.tabAdmin) {
      if (user.role === 'admin') {
        dom.tabAdmin.classList.remove('hidden');
      } else {
        dom.tabAdmin.classList.add('hidden');
      }
    }

    // 2. Year Selector Controls Sync
    if (dom.headerYearText) dom.headerYearText.textContent = state.currentYear;
    
    // User Year Select Dropdown
    if (dom.selectUserCalendarYear) {
      dom.selectUserCalendarYear.innerHTML = state.allowedYears.map(y => `
        <option value="${y}" ${y === state.currentYear ? 'selected' : ''}>${y} 年度預假日曆 ${state.lockedYears.includes(y) ? '(已關閉)' : ''}</option>
      `).join('');
    }

    // Admin Year Select Dropdown
    if (dom.adminSelectAllowedYear) {
      dom.adminSelectAllowedYear.innerHTML = state.allowedYears.map(y => `
        <option value="${y}" ${y === state.currentYear ? 'selected' : ''}>${y} 年度</option>
      `).join('');
    }

    // 3. Calculate Hours & Stats
    const userLeaves = state.leaves.filter(l => l.empId === user.id);
    const bookedHours = userLeaves.reduce((sum, l) => sum + (l.hours || 8), 0);
    const totalHours = user.totalHours || 120;
    const remainingHours = Math.max(0, totalHours - bookedHours);

    if (dom.statRemainingHours) dom.statRemainingHours.textContent = remainingHours;
    if (dom.statHoursBar) {
      const pct = Math.max(0, Math.min(100, (remainingHours / totalHours) * 100));
      dom.statHoursBar.style.width = `${pct}%`;
    }
    if (dom.statHoursSubtext) {
      dom.statHoursSubtext.textContent = `已預扣 ${bookedHours} / 總額 ${totalHours} 小時`;
    }
    if (dom.statBookedDays) {
      dom.statBookedDays.textContent = `${userLeaves.length} 天`;
    }

    // 4. Render Subviews
    renderCalendar();
    renderMyLeaves();
    if (user.role === 'admin') {
      renderAdminView();
    }
  }

  function renderCalendar() {
    const year = state.currentYear;
    const month = state.currentMonth;

    // 檢核當前年度是否已被主管關閉/鎖定
    const isYearLocked = state.lockedYears.includes(year);
    if (dom.calendarYearLockedBanner) {
      if (isYearLocked) {
        dom.calendarYearLockedBanner.classList.remove('hidden');
        if (dom.lockedBannerYearText) dom.lockedBannerYearText.textContent = year;
      } else {
        dom.calendarYearLockedBanner.classList.add('hidden');
      }
    }

    // 檢核每月 15 號自動鎖定下個月預假規則
    const is15thLocked = isTargetMonthLockedBy15thRule(year, month);
    if (dom.calendar15thLockedBanner) {
      if (is15thLocked && state.currentUser && state.currentUser.role !== 'admin') {
        dom.calendar15thLockedBanner.classList.remove('hidden');
        if (dom.locked15thMonthText) dom.locked15thMonthText.textContent = `${year} 年 ${month + 1} 月`;
      } else {
        dom.calendar15thLockedBanner.classList.add('hidden');
      }
    }

    dom.monthDisplay.textContent = `${year} 年 ${month + 1} 月`;
    dom.calendarDays.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    // Render Previous Month Padding Days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell other-month';
      dayCell.innerHTML = `<div class="day-header"><span class="day-number">${prevMonthDays - i}</span></div>`;
      dom.calendarDays.appendChild(dayCell);
    }

    // Render Current Month Days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Leaves on this date & model rule limits
      const dateLeaves = state.leaves.filter(l => l.date === dateStr);
      const { limit, type, label, holidayName } = getLimitForDate(dateStr);
      const isFull = dateLeaves.length >= limit;
      const isMyBooked = dateLeaves.some(l => l.empId === state.currentUser.id);

      const dayCell = document.createElement('div');
      dayCell.className = 'day-cell';
      if (holidayName) dayCell.classList.add('is-holiday');
      
      const dayOfWeek = new Date(year, month, day).getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      if (isWeekend) dayCell.classList.add('weekend');

      // Determine state class
      if (isMyBooked) {
        dayCell.classList.add('state-my-booked');
      } else if (isFull || isYearLocked || (is15thLocked && state.currentUser && state.currentUser.role !== 'admin')) {
        dayCell.classList.add('state-full');
      } else {
        dayCell.classList.add('state-available');
      }

      // 下拉式已預假同仁選單 Component
      let bookedDropdownHtml = '';
      if (dateLeaves.length > 0) {
        const listItems = dateLeaves.map(l => {
          const isMe = l.empId === state.currentUser.id;
          return `<li class="${isMe ? 'is-me-item' : ''}"><i class="fa-solid fa-user-check"></i> ${l.empName} <code>${l.empId}</code> ${isMe ? '<span class="badge-me">我</span>' : ''}</li>`;
        }).join('');

        bookedDropdownHtml = `
          <details class="booked-dropdown">
            <summary class="booked-summary">
              <span>
                <i class="fa-solid fa-users-viewfinder"></i> 
                <span class="desktop-text">已預假 <strong>${dateLeaves.length}</strong> 人</span>
                <span class="mobile-text"><strong>${dateLeaves.length}</strong>人 ▾</span>
              </span>
              <i class="fa-solid fa-chevron-down arrow-icon desktop-text"></i>
            </summary>
            <div class="booked-popover-content">
              <div class="popover-header"><i class="fa-solid fa-clipboard-list"></i> 預假同仁名冊：</div>
              <ul class="popover-list">
                ${listItems}
              </ul>
            </div>
          </details>
        `;
      } else {
        bookedDropdownHtml = `
          <div class="no-booked-text">
            <span class="desktop-text"><i class="fa-regular fa-circle-dot"></i> 尚無預假</span>
            <span class="mobile-text">無預假</span>
          </div>
        `;
      }

      // Action Button Html (若年度已被主管關閉鎖定，或已過 15 號自動鎖定，一般同仁停用搶假按鈕)
      let actionBtnHtml = '';
      if (isYearLocked) {
        actionBtnHtml = `
          <button class="btn-day-action btn-disabled-full" disabled>
            <span class="desktop-text"><i class="fa-solid fa-lock"></i> ${year} 年已關閉鎖定</span>
            <span class="mobile-text"><i class="fa-solid fa-lock"></i> 鎖定</span>
          </button>
        `;
      } else if (isMyBooked) {
        actionBtnHtml = `
          <div class="badge-locked-day">
            <span class="desktop-text"><i class="fa-solid fa-lock"></i> 我的預假 (鎖檔)</span>
            <span class="mobile-text"><i class="fa-solid fa-check"></i> 已預假</span>
          </div>
        `;
      } else if (is15thLocked && state.currentUser && state.currentUser.role !== 'admin') {
        actionBtnHtml = `
          <button class="btn-day-action btn-disabled-full" disabled style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24;">
            <span class="desktop-text"><i class="fa-solid fa-lock"></i> 15號起關閉 (須向主管申請)</span>
            <span class="mobile-text"><i class="fa-solid fa-lock"></i> 15號關閉</span>
          </button>
        `;
      } else if (isFull) {
        actionBtnHtml = `
          <button class="btn-day-action btn-disabled-full" disabled>
            <span class="desktop-text"><i class="fa-solid fa-ban"></i> 額滿停搶 (${dateLeaves.length}/${limit})</span>
            <span class="mobile-text"><i class="fa-solid fa-ban"></i> 額滿</span>
          </button>
        `;
      } else {
        actionBtnHtml = `
          <button class="btn-day-action btn-book-now" data-date="${dateStr}">
            <span class="desktop-text"><i class="fa-solid fa-bolt"></i> 搶預假 (餘 ${limit - dateLeaves.length} 名額)</span>
            <span class="mobile-text"><i class="fa-solid fa-bolt"></i> 搶 (餘${limit - dateLeaves.length})</span>
          </button>
        `;
      }

      const holidayBadgeHtml = holidayName ? `<span class="holiday-name-badge"><i class="fa-solid fa-flag"></i> <span class="desktop-text">${holidayName}</span><span class="mobile-text">${holidayName.slice(0, 2)}</span></span>` : '';

      dayCell.innerHTML = `
        <div class="day-header">
          <div style="display:flex; align-items:center; gap:4px;">
            <span class="day-number">${day}</span>
            ${holidayBadgeHtml}
          </div>
          <span class="day-limit-badge" title="${label}">
            <span class="desktop-text">${type} 上限 ${limit} 人</span>
            <span class="mobile-text">限${limit}人</span>
          </span>
        </div>
        <div class="booked-section">
          ${bookedDropdownHtml}
        </div>
        <div class="day-footer">
          ${actionBtnHtml}
        </div>
      `;

      dom.calendarDays.appendChild(dayCell);
    }

    // Attach click events for book buttons
    const bookBtns = dom.calendarDays.querySelectorAll('.btn-book-now');
    bookBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = e.currentTarget.getAttribute('data-date');
        handleBookLeave(date);
      });
    });
  }

  // Handle Booking Leave (先搶先贏 & 時數扣除)
  function handleBookLeave(dateStr) {
    // 寫入前先重新載入最新資料，進行二階段並發校驗
    loadStorage();

    const bookingYear = parseInt(dateStr.split('-')[0], 10);
    if (state.lockedYears.includes(bookingYear)) {
      showToast(`預假失敗！主管目前已暫時關閉/鎖定 ${bookingYear} 年度的線上預假功能！`, 'error');
      renderCalendar();
      return;
    }

    const user = state.currentUser;
    const userLeaves = state.leaves.filter(l => l.empId === user.id);
    const bookedHours = userLeaves.reduce((sum, l) => sum + l.hours, 0);
    const remainingHours = user.totalHours - bookedHours;

    // 1. Check Hours
    if (remainingHours < 8) {
      showToast(`預假失敗！您的剩餘年假只有 ${remainingHours} 小時，不足以預扣全天假 (8 小時)。`, 'error');
      return;
    }

    // 2. Check if already booked
    const existing = state.leaves.find(l => l.date === dateStr && l.empId === user.id);
    if (existing) {
      showToast('您在此日期已經完成預假，無法重複預假！', 'error');
      return;
    }

    // 3. Check Limit
    const dateLeaves = state.leaves.filter(l => l.date === dateStr);
    const { limit, type } = getLimitForDate(dateStr);

    if (dateLeaves.length >= limit) {
      showToast(`搶假失敗！該日期 (${type}) 預假人數已達到上限 (${limit} 人)，已為您自動封鎖。`, 'error');
      renderCalendar();
      return;
    }

    // 4. Perform Booking Transaction
    const newLeave = {
      id: `L-${dateStr.replace(/-/g, '')}-${user.id}`,
      date: dateStr,
      empId: user.id,
      empName: user.name,
      hours: 8,
      createdAt: formatDateTime(new Date()),
      status: 'locked'
    };

    state.leaves.push(newLeave);
    saveLeaves();

    showToast(`搶假成功！已為您預扣 8 小時年假，並即時完成假單鎖檔。`, 'success');
    renderApp();
  }

  // Render Personal Leaves List
  function renderMyLeaves() {
    const user = state.currentUser;
    const userLeaves = state.leaves.filter(l => l.empId === user.id);

    if (userLeaves.length === 0) {
      dom.myLeavesEmpty.classList.remove('hidden');
      dom.myLeavesList.innerHTML = '';
      return;
    }

    dom.myLeavesEmpty.classList.add('hidden');
    dom.myLeavesList.innerHTML = userLeaves.map(l => {
      const dayOfWeekStr = getDayOfWeekStr(l.date);
      return `
        <tr>
          <td><strong>${l.date}</strong></td>
          <td>${dayOfWeekStr}</td>
          <td><span class="badge badge-year">- ${l.hours} 小時</span></td>
          <td>${l.createdAt}</td>
          <td><span class="badge badge-locked"><i class="fa-solid fa-lock"></i> 線上鎖檔中 (不可更動)</span></td>
          <td>
            <span class="text-dim" style="font-size:0.85rem;"><i class="fa-solid fa-user-lock"></i> 已防竄改鎖檔 (需聯繫主管協助撤銷)</span>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Render Admin View
  function renderAdminView() {
    // 0. Update Model Rules Form Controls & Rules Doc Editor
    if (dom.limitWeekday) dom.limitWeekday.value = state.modelRules.weekday;
    if (dom.limitSat) dom.limitSat.value = state.modelRules.sat;
    if (dom.limitSun) dom.limitSun.value = state.modelRules.sun;
    if (dom.limitHoliday) dom.limitHoliday.value = state.modelRules.holiday;
    if (dom.adminRulesTextarea) dom.adminRulesTextarea.value = state.rulesDoc;

    // Render Year Status Control List for Admin (主管各年度關閉/鎖定與重開管理)
    if (dom.adminYearStatusList) {
      dom.adminYearStatusList.innerHTML = state.allowedYears.map(y => {
        const isLocked = state.lockedYears.includes(y);
        const isCurrent = y === state.currentYear;
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <strong style="font-size: 1.05rem; color: var(--accent-cyan);">${y} 年度</strong>
              ${isCurrent ? '<span class="badge" style="background: var(--accent-cyan); color:#000; font-weight:700;">目前管理中</span>' : ''}
              ${isLocked 
                ? '<span class="badge" style="background: rgba(244,63,94,0.2); color: #fb7185; border: 1px solid rgba(244,63,94,0.4);"><i class="fa-solid fa-lock"></i> 主管已暫時關閉/鎖定預假</span>' 
                : '<span class="badge" style="background: rgba(16,185,129,0.2); color: #34d399; border: 1px solid rgba(16,185,129,0.4);"><i class="fa-solid fa-circle-check"></i> 正常開放預假中</span>'}
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn-sm btn-toggle-lock-year ${isLocked ? 'btn-success' : 'btn-danger'}" data-year="${y}">
                ${isLocked ? '<i class="fa-solid fa-lock-open"></i> 重新開啟此年度預假' : '<i class="fa-solid fa-lock"></i> 關閉/鎖定此年度預假'}
              </button>
              ${state.allowedYears.length > 1 ? `
                <button class="btn-secondary btn-sm btn-remove-allowed-year" data-year="${y}" title="主管移除此開放年度">
                  <i class="fa-solid fa-trash"></i> 移除年度
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

      // Bind Lock/Unlock Year Toggles
      dom.adminYearStatusList.querySelectorAll('.btn-toggle-lock-year').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const yearToToggle = parseInt(e.currentTarget.getAttribute('data-year'), 10);
          if (state.lockedYears.includes(yearToToggle)) {
            state.lockedYears = state.lockedYears.filter(y => y !== yearToToggle);
            showToast(`已成功重新開啟 【${yearToToggle} 年度】 線上預假功能！`, 'success');
          } else {
            state.lockedYears.push(yearToToggle);
            showToast(`已關閉/鎖定 【${yearToToggle} 年度】 線上預假功能！同仁端已即時同步停用。`, 'warning');
          }
          saveLockedYears();
          renderApp();
        });
      });

      // Bind Remove Allowed Year
      dom.adminYearStatusList.querySelectorAll('.btn-remove-allowed-year').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const yearToRemove = parseInt(e.currentTarget.getAttribute('data-year'), 10);
          if (confirm(`主管確定要移除【${yearToRemove} 年度】的預假開放授權嗎？`)) {
            state.allowedYears = state.allowedYears.filter(y => y !== yearToRemove);
            state.lockedYears = state.lockedYears.filter(y => y !== yearToRemove);
            if (state.currentYear === yearToRemove) {
              state.currentYear = state.allowedYears[0];
            }
            saveAllowedYears();
            saveLockedYears();
            showToast(`已移除 ${yearToRemove} 年度預假開放權限。`, 'info');
            renderApp();
          }
        });
      });
    }

    // 1. Employee Roster (指定員工編號 911050 為名冊絕對第 1 位)
    const sortedEmployees = [...state.employees].sort((a, b) => {
      // 1. 絕對最高優先權：員工編號 911050 擺第一位
      const ABSOLUTE_PINNED = ['911050'];
      const absA = ABSOLUTE_PINNED.indexOf(a.id);
      const absB = ABSOLUTE_PINNED.indexOf(b.id);
      if (absA !== -1 && absB !== -1) return absA - absB;
      if (absA !== -1) return -1;
      if (absB !== -1) return 1;

      // 2. 主管角色 (role === 'admin') 優先歸類於上方
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;

      // 3. 次要特定同仁順序
      const USER_PINNED = ['A105W2', '961137'];
      const idxA = USER_PINNED.indexOf(a.id);
      const idxB = USER_PINNED.indexOf(b.id);

      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;

      // 4. 其餘同仁按員工編號排序
      return a.id.localeCompare(b.id);
    });

    dom.adminEmpTable.innerHTML = sortedEmployees.map(emp => {
      const empLeaves = state.leaves.filter(l => l.empId === emp.id);
      const bookedHours = empLeaves.reduce((sum, l) => sum + l.hours, 0);
      const remHours = emp.totalHours - bookedHours;

      return `
        <tr>
          <td><code>${emp.id}</code></td>
          <td><strong>${emp.name}</strong></td>
          <td><span class="badge" style="background: rgba(255,255,255,0.08); color: var(--text-main); border: 1px solid var(--border-color);">${emp.title || (emp.role === 'admin' ? '診斷科主管' : '醫事放射師')}</span></td>
          <td>
            <div style="display:flex; align-items:center; gap:4px;">
              <input type="number" class="input-table-hours" data-id="${emp.id}" value="${emp.totalHours}" min="0" step="1" style="width: 75px; padding: 4px 6px; text-align: center; border-radius: 6px; background: rgba(15,23,42,0.8); color: var(--accent-cyan); font-weight:700; border: 1px solid var(--border-color);">
              <span style="font-size:0.8rem; color:var(--text-muted);">小時</span>
            </div>
          </td>
          <td><span style="color: var(--accent-rose); font-weight:600;">${bookedHours} 小時</span></td>
          <td><span style="color: var(--accent-emerald); font-weight:700; font-size:1.05rem;">${remHours} 小時</span></td>
          <td>${empLeaves.length} 天</td>
          <td>
            <button class="btn-secondary btn-sm btn-edit-emp" data-id="${emp.id}" title="完整編輯 details"><i class="fa-solid fa-pen"></i> 編輯</button>
            ${String(emp.id).toLowerCase() !== String(state.currentUser.id).toLowerCase() ? `<button class="btn-danger btn-delete-emp" data-id="${emp.id}"><i class="fa-solid fa-trash"></i> 刪除</button>` : ''}
          </td>
        </tr>
      `;
    }).join('');

    // Bind In-Line Quick Edit Total Hours Input (支援 change 與 blur 即刻寫入與同步)
    dom.adminEmpTable.querySelectorAll('.input-table-hours').forEach(input => {
      const handleHoursChange = (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const val = parseInt(e.currentTarget.value, 10);
        const newHours = isNaN(val) ? 120 : val;
        const emp = state.employees.find(x => String(x.id).trim().toLowerCase() === String(id).trim().toLowerCase());
        if (emp && emp.totalHours !== newHours) {
          emp.totalHours = newHours;

          if (state.currentUser && String(state.currentUser.id).trim().toLowerCase() === String(id).trim().toLowerCase()) {
            state.currentUser.totalHours = newHours;
          }

          saveEmployees();
          showToast(`已成功修改同仁 ${emp.name} (${id}) 的原始年假為 ${newHours} 小時！`, 'success');
          renderApp();
        }
      };

      input.addEventListener('change', handleHoursChange);
      input.addEventListener('blur', handleHoursChange);
    });

    // Bind Edit/Delete Emp
    dom.adminEmpTable.querySelectorAll('.btn-edit-emp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const emp = state.employees.find(x => String(x.id).trim().toLowerCase() === String(id).trim().toLowerCase());
        if (emp) openEmpModal(emp);
      });
    });

    dom.adminEmpTable.querySelectorAll('.btn-delete-emp').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const emp = state.employees.find(x => String(x.id).trim().toLowerCase() === String(id).trim().toLowerCase());
        const empNameText = emp ? emp.name : id;
        if (confirm(`主管確定要刪除同仁 ${empNameText} (${id}) 嗎？其已申請之所有假單也會一併清理。`)) {
          state.employees = state.employees.filter(x => String(x.id).trim().toLowerCase() !== String(id).trim().toLowerCase());
          state.leaves = state.leaves.filter(l => String(l.empId).trim().toLowerCase() !== String(id).trim().toLowerCase());
          saveEmployees();
          saveLeaves();
          showToast(`已成功刪除同仁 ${empNameText} (${id}) 及其相關假單。`, 'info');
          renderApp();
        }
      });
    });

    // 2. Populate Employee Select Filter Options & Proxy Booking Dropdown
    if (dom.adminFilterEmpSelect) {
      const currentSelected = dom.adminFilterEmpSelect.value;
      const optionsHtml = '<option value="">-- 請選擇同仁 (顯示姓名與編號) --</option>' + 
        sortedEmployees.map(e => `<option value="${e.id}" ${String(e.id).toLowerCase() === String(currentSelected).toLowerCase() ? 'selected' : ''}>${e.name} (${e.id}) ${e.role === 'admin' ? '[主管]' : ''}</option>`).join('');
      dom.adminFilterEmpSelect.innerHTML = optionsHtml;
    }

    if (dom.adminProxyEmpSelect) {
      const currentProxySelected = dom.adminProxyEmpSelect.value;
      const proxyOptionsHtml = '<option value="">-- 請選擇同仁 (顯示姓名與剩餘年假時數) --</option>' + 
        sortedEmployees.map(e => {
          const empLeaves = state.leaves.filter(l => l.empId === e.id);
          const bookedHours = empLeaves.reduce((sum, l) => sum + l.hours, 0);
          const remHours = e.totalHours - bookedHours;
          return `<option value="${e.id}" ${String(e.id).toLowerCase() === String(currentProxySelected).toLowerCase() ? 'selected' : ''}>${e.name} (${e.id}) - 剩餘 ${remHours} 小時年假 ${e.role === 'admin' ? '[主管]' : ''}</option>`;
        }).join('');
      dom.adminProxyEmpSelect.innerHTML = proxyOptionsHtml;
    }

    if (dom.adminProxyDateInput && !dom.adminProxyDateInput.value) {
      const defaultDateStr = `${state.currentYear}-${String(state.currentMonth + 1).padStart(2, '0')}-01`;
      dom.adminProxyDateInput.value = defaultDateStr;
    }

    // 3. Query & Render Single Employee Leaves by ID
    const filterSelectVal = dom.adminFilterEmpSelect ? dom.adminFilterEmpSelect.value : '';
    const filterInputVal = dom.adminFilterEmpInput ? dom.adminFilterEmpInput.value.trim() : '';
    const targetEmpId = filterSelectVal || filterInputVal;

    if (!targetEmpId) {
      dom.adminAllLeavesTable.innerHTML = '';
      if (dom.adminLeavesEmptyTip) {
        dom.adminLeavesEmptyTip.style.display = 'block';
        dom.adminLeavesEmptyTip.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 請於上方選擇或輸入員工編號，系統將精確列出該同仁的預假日期。';
      }
    } else {
      const targetEmp = state.employees.find(e => e.id.toLowerCase() === targetEmpId.toLowerCase());
      const targetLeaves = state.leaves.filter(l => l.empId.toLowerCase() === targetEmpId.toLowerCase());

      if (targetLeaves.length === 0) {
        dom.adminAllLeavesTable.innerHTML = '';
        if (dom.adminLeavesEmptyTip) {
          dom.adminLeavesEmptyTip.style.display = 'block';
          const nameTag = targetEmp ? `${targetEmp.name} (<code>${targetEmp.id}</code>)` : `<code>${targetEmpId}</code>`;
          dom.adminLeavesEmptyTip.innerHTML = `<i class="fa-solid fa-folder-open"></i> 同仁 ${nameTag} 目前尚無任何線上預假紀錄。`;
        }
      } else {
        if (dom.adminLeavesEmptyTip) dom.adminLeavesEmptyTip.style.display = 'none';

        dom.adminAllLeavesTable.innerHTML = targetLeaves.map(l => {
          const dayOfWeekStr = getDayOfWeekStr(l.date);
          return `
            <tr>
              <td><strong>${l.date}</strong></td>
              <td>${dayOfWeekStr}</td>
              <td><span class="badge badge-year">- ${l.hours} 小時</span></td>
              <td>${l.createdAt}</td>
              <td><span class="badge badge-locked"><i class="fa-solid fa-shield-halved"></i> 已線上鎖檔</span></td>
              <td>
                <button class="btn-danger btn-admin-delete-leave" data-id="${l.id}">
                  <i class="fa-solid fa-rotate-left"></i> 強制撤銷 ${l.date} 假單並釋放名額
                </button>
              </td>
            </tr>
          `;
        }).join('');

        // Bind Admin Delete Leave
        dom.adminAllLeavesTable.querySelectorAll('.btn-admin-delete-leave').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const leave = state.leaves.find(l => l.id === id);
            if (leave && confirm(`主管確認撤銷 ${leave.empName} 於 ${leave.date} 的預假嗎？系統將自動歸還 8 小時年假並釋放今日搶假名額。`)) {
              state.leaves = state.leaves.filter(l => l.id !== id);
              saveLeaves();
              showToast(`已成功撤銷 ${leave.empName} 於 ${leave.date} 的假單，名額已釋放！`, 'success');
              renderApp();
            }
          });
        });
      }
    }
  }

  // Open Add/Edit Employee Modal
  function openEmpModal(emp = null) {
    if (emp) {
      dom.modalEmpTitle.textContent = '編輯同仁資料';
      dom.empEditOriginalId.value = emp.id;
      dom.empInputId.value = emp.id;
      dom.empInputId.readOnly = true;
      dom.empInputName.value = emp.name || '';
      if (dom.empInputTitle) dom.empInputTitle.value = emp.title || (emp.role === 'admin' ? '診斷科主管' : '醫事放射師');
      dom.empInputRole.value = emp.role || 'user';
      dom.empInputHours.value = emp.totalHours || 120;
      dom.empInputPwd.value = emp.pwd || emp.id;
    } else {
      dom.modalEmpTitle.textContent = '新增同仁資料';
      dom.empEditOriginalId.value = '';
      dom.empInputId.value = '';
      dom.empInputId.readOnly = false;
      dom.empInputName.value = '';
      if (dom.empInputTitle) dom.empInputTitle.value = '醫事放射師';
      dom.empInputRole.value = 'user';
      dom.empInputHours.value = 120;
      dom.empInputPwd.value = '';
    }
    dom.modalEmp.classList.remove('hidden');
  }

  // Handle Save Employee Form Submit (一律同步更新全系統狀態)
  let isSavingEmp = false;
  function handleSaveEmployee(e) {
    if (e) {
      e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (isSavingEmp) return;
    isSavingEmp = true;

    try {
      const origIdEl = document.getElementById('emp-edit-original-id');
      const idEl = document.getElementById('emp-input-id');
      const nameEl = document.getElementById('emp-input-name');
      const titleEl = document.getElementById('emp-input-title');
      const roleEl = document.getElementById('emp-input-role');
      const hoursEl = document.getElementById('emp-input-hours');
      const pwdEl = document.getElementById('emp-input-pwd');

      const origId = origIdEl ? origIdEl.value.trim() : '';
      const id = idEl ? idEl.value.trim() : '';
      const name = nameEl ? nameEl.value.trim() : '';
      const role = roleEl ? roleEl.value : 'user';
      const title = titleEl ? titleEl.value.trim() : (role === 'admin' ? '診斷科主管' : '醫事放射師');
      const rawHours = parseInt(hoursEl ? hoursEl.value : '120', 10);
      const hours = isNaN(rawHours) ? 120 : rawHours;
      const pwd = (pwdEl && pwdEl.value.trim()) ? pwdEl.value.trim() : id;

      if (!id || !name) {
        showToast('請填寫完整員工編號與同仁姓名！', 'error');
        return;
      }

      // 讀取最新 LocalStorage 狀態
      loadStorage();

      if (origId) {
        // 編輯既有同仁
        let emp = state.employees.find(x => String(x.id).trim().toLowerCase() === origId.toLowerCase());
        if (!emp) {
          emp = state.employees.find(x => String(x.id).trim().toLowerCase() === id.toLowerCase());
        }

        if (emp) {
          emp.id = id;
          emp.name = name;
          emp.title = title || (role === 'admin' ? '診斷科主管' : '醫事放射師');
          emp.role = role;
          emp.totalHours = hours;
          emp.pwd = pwd;

          // 1. 同步更新所有已預假假單中的同仁姓名 (l.empName) 與編號
          state.leaves.forEach(l => {
            if (String(l.empId).trim().toLowerCase() === origId.toLowerCase() || String(l.empId).trim().toLowerCase() === id.toLowerCase()) {
              l.empId = id;
              l.empName = name;
            }
          });
          saveLeaves();

          // 2. 若編輯的是當前登入者自己，同步更新 state.currentUser 與 KEY_SESSION
          if (state.currentUser && (String(state.currentUser.id).trim().toLowerCase() === origId.toLowerCase() || String(state.currentUser.id).trim().toLowerCase() === id.toLowerCase())) {
            state.currentUser.id = id;
            state.currentUser.name = name;
            state.currentUser.title = emp.title;
            state.currentUser.role = role;
            state.currentUser.totalHours = hours;
            state.currentUser.pwd = pwd;
            localStorage.setItem(KEY_SESSION, JSON.stringify({ id: id }));
          }
        } else {
          // 若無此 origId 則推入新增
          state.employees.push({ id, name, title: title || '醫事放射師', role, totalHours: hours, pwd });
        }
      } else {
        // 新增同仁
        if (state.employees.some(x => String(x.id).trim().toLowerCase() === id.toLowerCase())) {
          showToast('員工編號已存在，請使用其他編號！', 'error');
          return;
        }
        state.employees.push({ id, name, title: title || '醫事放射師', role, totalHours: hours, pwd });
      }

      // 3. 寫入 LocalStorage 持久化儲存
      saveEmployees();

      // 4. 關閉彈窗 Modal
      const modalEmpEl = document.getElementById('modal-employee');
      if (modalEmpEl) modalEmpEl.classList.add('hidden');
      showToast(`同仁 ${name} (${id}) 設定已成功儲存並完成全系統同步！`, 'success');

      // 5. 全系統重新繪製同步 (更新名冊、表單下拉、頁首狀態與日曆名單)
      renderApp();
    } catch (err) {
      console.error('Save employee error:', err);
      showToast('儲存同仁設定時發生異常：' + err.message, 'error');
    } finally {
      setTimeout(() => {
        isSavingEmp = false;
      }, 300);
    }
  }

  // Export to Excel CSV
  function exportToExcelCSV() {
    if (state.leaves.length === 0) {
      showToast('目前尚無任何預假假單可供匯出！', 'info');
      return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel Chinese rendering
    csvContent += '預假日期,星期,員工編號,員工姓名,扣除年假時數,搶假預約時間,假單狀態\n';

    state.leaves.forEach(l => {
      const dayOfWeek = getDayOfWeekStr(l.date);
      csvContent += `"${l.date}","${dayOfWeek}","${l.empId}","${l.empName}","${l.hours} 小時","${l.createdAt}","${l.status === 'locked' ? '已鎖檔' : '正常'}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `佳里奇美醫院_放射科預假總表_2027_${formatDateFilename(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('全科預假 Excel / CSV 總表導出成功！', 'success');
  }

  // Import Employees from CSV
  function handleImportEmployeeCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length <= 1) {
          showToast('CSV 檔案為空或格式不正確！', 'error');
          return;
        }

        const headers = lines[0].split(',').map(h => h.replace(/^["']|["']$/g, '').trim());
        let count = 0;

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
          if (cols.length < 3) continue;

          const empId = cols[0];
          const name = cols[1];
          let hours = parseFloat(cols[2]);

          // If header specifically mentions 天, multiply by 8
          if (headers[2] && headers[2].includes('天') && !headers[2].includes('時')) {
            hours = hours * 8;
          }

          let role = 'user';
          if (cols[3] && (cols[3].includes('admin') || cols[3].includes('主管'))) role = 'admin';
          if (empId === 'A00534' || empId === 'A001') role = 'admin';

          let pwd = cols[4] || empId;

          const existingIdx = state.employees.findIndex(x => x.id === empId);
          if (existingIdx >= 0) {
            state.employees[existingIdx].name = name;
            state.employees[existingIdx].totalHours = hours;
            state.employees[existingIdx].role = role;
            state.employees[existingIdx].pwd = pwd;
          } else {
            state.employees.push({ id: empId, name, role, totalHours: hours, pwd });
          }
          count++;
        }

        saveEmployees();
        showToast(`成功批次匯入 ${count} 位同仁名冊與年假資料！`, 'success');
        renderApp();
      } catch (err) {
        showToast('解析 CSV 檔案失敗，請檢查格式是否符合規範！', 'error');
      }
      e.target.value = ''; // Reset input
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Helpers
  function formatDateTime(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function formatDateFilename(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  function getDayOfWeekStr(dateStr) {
    const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
    const d = new Date(dateStr);
    return days[d.getDay()];
  }

  // Toast Notification
  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${msg}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Run App when DOM loaded
  document.addEventListener('DOMContentLoaded', init);
})();
