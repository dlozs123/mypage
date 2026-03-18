(function () {
  'use strict';

  /* ===================================================================
   *  CONFIG & CONSTANTS
   * =================================================================== */
  const IMAGE_BASE = 'https://b.dlozs.top/';
  const FIRST_IMAGE = 'flan1.png';
  const ALL_IMAGES = [
    { name: 'flan1.png', w: 1400, h: 902 },
    { name: 'flan2.png', w: 2400, h: 1708 },
    { name: 'remiflan1.jpg', w: 5840, h: 4764 },
    { name: 'remiflan2.jpg', w: 4732, h: 3312 },
    { name: 'remiflan3.jpg', w: 2400, h: 1400 },
    { name: 'remiflan4.jpg', w: 8192, h: 6220 },
    { name: 'remiflan5.jpg', w: 4000, h: 2740 },
    { name: 'remiflan6.jpg', w: 2400, h: 1400 },
    { name: 'remiflan7.jpg', w: 2488, h: 1586 },
  ];

  const BGM_LIST = [
    'https://mp4.dlozs.top/01%20Smile!_HLS/01%20Smile!.m3u8',
    'https://mp4.dlozs.top/02%20Sweet%20alyssum_HLS/02%20Sweet%20alyssum.m3u8',
    'https://mp4.dlozs.top/03%20Flanberry%20chocolate_HLS/03%20Flanberry%20chocolate.m3u8',
  ];

  const MEMO_TYPE_LABELS = {
    birthday_solar: '🎂 阳历生日',
    birthday_lunar: '🌙 阴历生日',
    monthly: '🔁 每月事项',
    once: '📌 单次事项',
  };

  let supabase = null;

  /* ===================================================================
   *  UTILS
   * =================================================================== */
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = vals[i] || ''));
      return obj;
    });
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /* ===================================================================
   *  BACKGROUND IMAGES & PAGINATION
   * =================================================================== */
  let currentSectionIndex = 0;
  const sections = [];
  const TOTAL_SECTIONS = 5;

  let navTimeout = null;
  const navTriggerArea = document.getElementById('navTriggerArea');
  const navArrows = document.getElementById('navArrows');

  function setupBackgrounds() {
    const others = ALL_IMAGES.filter(img => img.name !== FIRST_IMAGE);
    const chosen = shuffle(others).slice(0, 4);
    const sectionImages = [
      ALL_IMAGES.find(img => img.name === FIRST_IMAGE),
      ...chosen,
    ];

    for (let i = 0; i < TOTAL_SECTIONS; i++) {
      const sec = document.getElementById(`section${i + 1}`);
      if (!sec) continue;
      
      const img = sectionImages[i];
      if (img) {
        const url = IMAGE_BASE + encodeURIComponent(img.name);
        sec.style.backgroundImage = `url("${url}")`;
        
        // Dynamic min-height based on aspect ratio for the section
        const ratio = img.h / img.w;
        const heightVw = Math.round(ratio * 100);
        const minH = Math.max(heightVw, 60);
        sec.style.minHeight = `${minH}vw`;
      }
      
      sections.push(sec);
    }
    
    // Show first section
    goToSection(0);
  }

  let isTransitioning = false;

  function goToSection(index) {
    if (isTransitioning) return;
    if (index < 0) index = TOTAL_SECTIONS - 1;
    if (index >= TOTAL_SECTIONS) index = 0;
    
    if (currentSectionIndex === index && sections[index].classList.contains('active')) return;
    
    isTransitioning = true;
    const oldSection = sections[currentSectionIndex];
    const newSection = sections[index];
    currentSectionIndex = index;
    
    // Fade out old section if it exists and is active
    if (oldSection && oldSection.classList.contains('active')) {
      oldSection.classList.remove('active');
      
      // Wait for fade out to complete (0.8s matching CSS)
      setTimeout(() => {
        oldSection.style.display = 'none';
        showNewSection(newSection);
      }, 800);
    } else {
      // First load or no active section
      showNewSection(newSection);
    }
  }

  function showNewSection(newSection) {
    // 1. Set display block to put it in DOM flow (height will be calculated)
    newSection.style.display = 'flex';
    
    // Reset scroll to top of the new page
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    // 2. Wait a tick for browser to register block rendering, then fade in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        newSection.classList.add('active');
        
        // Wait for fade in to complete
        setTimeout(() => {
          isTransitioning = false;
        }, 800);
      });
    });
  }

  function showNavArrows() {
    navArrows.classList.add('visible');
    if (navTimeout) clearTimeout(navTimeout);
    
    navTimeout = setTimeout(() => {
      navArrows.classList.remove('visible');
    }, 2000);
  }

  function initPagination() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    prevBtn.addEventListener('click', () => goToSection(currentSectionIndex - 1));
    nextBtn.addEventListener('click', () => goToSection(currentSectionIndex + 1));
    
    navTriggerArea.addEventListener('mouseenter', showNavArrows);
    navTriggerArea.addEventListener('mousemove', showNavArrows);
    navArrows.addEventListener('mouseenter', showNavArrows);
    navArrows.addEventListener('mousemove', showNavArrows);
    
    // Also show briefly on any click or touch for mobile friendliness
    document.addEventListener('touchstart', showNavArrows, {passive: true});
  }

  /* ===================================================================
   *  BGM PLAYER (HLS) — muted autoplay, unmute on interaction
   * =================================================================== */
  let bgmIndex = 0;
  let hlsInstance = null;
  let bgmUnmuted = false;

  function initBGM() {
    bgmIndex = Math.floor(Math.random() * BGM_LIST.length);
    const audio = document.getElementById('bgmAudio');
    const btn = document.getElementById('bgmBtn');

    // 1. 初始状态：静音播放（这步是为了让浏览器预加载资源）
    audio.muted = true;
    loadAndPlayBGM(bgmIndex);

    // 2. 定义解锁函数
    const unmuteOnInteraction = () => {
      if (bgmUnmuted) return;
      
      bgmUnmuted = true;
      audio.muted = false;
      
      // 重要：解除静音后必须显式再 play() 一次，确保触发播放
      audio.play().then(() => {
        btn.classList.add('playing');
        console.log("BGM Unmuted and Playing");
      }).catch(err => {
        console.warn("Playback failed even after interaction:", err);
        // 如果失败了，重置标记位，让下一次点击有机会再次尝试
        bgmUnmuted = false; 
      });

      // 移除全局监听
      interactionEvents.forEach(e => document.removeEventListener(e, unmuteOnInteraction));
    };

    // 3. 监听交互（移除 mousemove 和 scroll，这两个通常无法解锁音频权限）
    const interactionEvents = ['click', 'touchstart', 'keydown'];
    interactionEvents.forEach(e => {
      // 注意：这里用 true 捕获模式，确保即便点击了子元素也能触发
      document.addEventListener(e, unmuteOnInteraction, { once: true, capture: true });
    });

    // BGM 按钮：跳过下一首
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // 如果还没解锁，先解锁
      if (!bgmUnmuted) {
        unmuteOnInteraction();
      } else {
        nextBGM();
      }
    });

    audio.addEventListener('ended', () => nextBGM());
  }

  function loadAndPlayBGM(index) {
    const audio = document.getElementById('bgmAudio');
    const btn = document.getElementById('bgmBtn');
    const url = BGM_LIST[index];

    if (hlsInstance) {
      hlsInstance.destroy();
      hlsInstance = null;
    }

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      hlsInstance = new Hls();
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(audio);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        // 尝试播放
        audio.play().then(() => {
          if (bgmUnmuted) btn.classList.add('playing');
        }).catch(() => {
          // 静音播放失败也没关系，等待用户点击
        });
      });
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      // iOS 原生支持代码
      audio.src = url;
      audio.play().then(() => {
        if (bgmUnmuted) btn.classList.add('playing');
      }).catch(() => {});
    }
  }

  function nextBGM() {
    bgmIndex = (bgmIndex + 1) % BGM_LIST.length;
    loadAndPlayBGM(bgmIndex);
  }


  /* ===================================================================
   *  CSV LOADERS
   * =================================================================== */
  async function loadNavCSV() {
    try {
      const res = await fetch('nav.csv');
      const text = await res.text();
      const items = parseCSV(text).slice(0, 9);
      const grid = document.getElementById('navGrid');
      grid.innerHTML = items.map(item => `
        <a class="nav-item" href="${item.url}" target="_blank" rel="noopener">
          <span class="nav-name">${item.name}</span>
          <span class="nav-url">${extractDomain(item.url)}</span>
        </a>
      `).join('');
    } catch (e) {
      console.warn('Failed to load nav.csv:', e);
    }
  }

  async function loadSitesCSV() {
    try {
      const res = await fetch('sites.csv');
      const text = await res.text();
      const items = parseCSV(text);
      const container = document.getElementById('sitesContainer');
      container.innerHTML = items.map(item => `
        <a class="site-row" href="${item.url}" target="_blank" rel="noopener">
          <span class="site-name">${item.name}</span>
          <span class="site-url">${extractDomain(item.url)}</span>
        </a>
      `).join('');
    } catch (e) {
      console.warn('Failed to load sites.csv:', e);
    }
  }

  /* ===================================================================
   *  SUPABASE INIT
   * =================================================================== */
  async function initSupabase() {
    try {
      const res = await fetch('config.json');
      const config = await res.json();
      if (config.supabaseUrl && config.supabaseAnonKey) {
        const { createClient } = window.supabase;
        supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      }
    } catch (e) {
      console.warn('Supabase config not loaded:', e);
    }
  }

  /* ===================================================================
   *  CALENDAR
   * =================================================================== */
  let calYear, calMonth, selectedDate = null;
  let allMemos = [];

  function initCalendar() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth(); // 0-indexed

    document.getElementById('prevYear').addEventListener('click', () => { calYear--; renderCalendar(); });
    document.getElementById('nextYear').addEventListener('click', () => { calYear++; renderCalendar(); });
    document.getElementById('prevMonth').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar();
    });
    document.getElementById('todayBtn').addEventListener('click', () => {
      const now = new Date();
      calYear = now.getFullYear();
      calMonth = now.getMonth();
      selectedDate = null;
      renderCalendar();
    });

    renderCalendar();
  }

  async function renderCalendar() {
    document.getElementById('monthYear').textContent = `${calYear}年 ${calMonth + 1}月`;

    // Load memos for visible period
    await loadMemos();

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    // Day headers
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    dayNames.forEach(d => {
      const el = document.createElement('div');
      el.className = 'cal-day-header';
      el.textContent = d;
      grid.appendChild(el);
    });

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const prevMonthDays = new Date(calYear, calMonth, 0).getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

    // Compute which days have memos (solar dates)
    const memoDays = getMemoSolarDaysForMonth(calYear, calMonth + 1);

    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = prevMonthDays - i;
      grid.appendChild(el);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const el = document.createElement('div');
      el.className = 'cal-day';
      el.textContent = d;

      const dateStr = `${calYear}-${calMonth + 1}-${d}`;

      if (dateStr === todayStr) el.classList.add('today');
      if (selectedDate === dateStr) el.classList.add('selected');
      if (memoDays.has(d)) el.classList.add('has-memo');

      el.addEventListener('click', () => {
        selectedDate = dateStr;
        renderCalendar();
        showDayMemos(calYear, calMonth + 1, d);
      });

      grid.appendChild(el);
    }

    // Next month padding
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
      const el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = i;
      grid.appendChild(el);
    }

    // If a day is selected, show its memos
    if (selectedDate) {
      const [sy, sm, sd] = selectedDate.split('-').map(Number);
      showDayMemos(sy, sm, sd);
    } else {
      document.getElementById('dayMemos').innerHTML = '';
    }
  }

  /* ===================================================================
   *  MEMO LOGIC
   * =================================================================== */
  async function loadMemos() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.from('memos').select('*');
      if (!error && data) allMemos = data;
    } catch (e) {
      console.warn('Failed to load memos:', e);
    }
  }

  /**
   * Returns a Set of day-numbers (1-31) in the given solar month that
   * have at least one memo event.
   */
  function getMemoSolarDaysForMonth(year, month) {
    const days = new Set();
    const daysInMonth = new Date(year, month, 0).getDate();

    allMemos.forEach(memo => {
      if (memo.type === 'birthday_solar') {
        if (memo.month === month) days.add(memo.day);
      } else if (memo.type === 'birthday_lunar') {
        // Convert lunar date to solar for this year
        const solarDate = lunarToSolar(year, memo.month, memo.day);
        if (solarDate && solarDate.month === month) days.add(solarDate.day);
      } else if (memo.type === 'monthly') {
        // Handle month with fewer days (e.g., 31st -> last day)
        const effectiveDay = Math.min(memo.day, daysInMonth);
        days.add(effectiveDay);
      } else if (memo.type === 'once') {
        if (memo.year === year && memo.month === month) days.add(memo.day);
      }
    });
    return days;
  }

  /**
   * Get memos that fall on a specific solar date.
   */
  function getMemosForDate(year, month, day) {
    const daysInMonth = new Date(year, month, 0).getDate();
    return allMemos.filter(memo => {
      if (memo.type === 'birthday_solar') {
        return memo.month === month && memo.day === day;
      } else if (memo.type === 'birthday_lunar') {
        const sd = lunarToSolar(year, memo.month, memo.day);
        return sd && sd.month === month && sd.day === day;
      } else if (memo.type === 'monthly') {
        const effectiveDay = Math.min(memo.day, daysInMonth);
        return effectiveDay === day;
      } else if (memo.type === 'once') {
        return memo.year === year && memo.month === month && memo.day === day;
      }
      return false;
    });
  }

  function showDayMemos(year, month, day) {
    const container = document.getElementById('dayMemos');
    const memos = getMemosForDate(year, month, day);
    if (memos.length === 0) {
      container.innerHTML = `<div style="font-size:0.85rem;color:var(--text-secondary);padding:8px;">该日期无备忘事项</div>`;
      return;
    }
    container.innerHTML = memos.map(m => `
      <div class="day-memo-item">
        <span class="memo-title">${m.title}</span>
        <span class="memo-type-tag">${MEMO_TYPE_LABELS[m.type] || m.type}</span>
        <button class="memo-delete" data-id="${m.id}" title="删除">✕</button>
      </div>
    `).join('');

    container.querySelectorAll('.memo-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!supabase) return;
        await supabase.from('memos').delete().eq('id', id);
        await renderCalendar();
      });
    });
  }

  /* ===================================================================
   *  LUNAR ↔ SOLAR CONVERSION  (uses lunar-javascript)
   * =================================================================== */
  function lunarToSolar(solarYear, lunarMonth, lunarDay) {
    try {
      if (typeof Lunar === 'undefined' && typeof window.Lunar === 'undefined') return null;
      const LunarClass = window.Lunar || Lunar;

      // Try to create lunar date for this year
      // Handle leap month: if it's a leap month that doesn't exist, use the regular month
      let lunar;
      try {
        lunar = LunarClass.fromYmd(solarYear, lunarMonth, lunarDay);
      } catch {
        // If the day doesn't exist (e.g., lunar month only has 29 days), skip
        return null;
      }

      const solar = lunar.getSolar();
      return { year: solar.getYear(), month: solar.getMonth(), day: solar.getDay() };
    } catch {
      return null;
    }
  }

  function solarToLunar(year, month, day) {
    try {
      if (typeof Solar === 'undefined' && typeof window.Solar === 'undefined') return null;
      const SolarClass = window.Solar || Solar;
      const solar = SolarClass.fromYmd(year, month, day);
      const lunar = solar.getLunar();
      return { year: lunar.getYear(), month: lunar.getMonth(), day: lunar.getDay() };
    } catch {
      return null;
    }
  }

  /* ===================================================================
   *  MEMO FORM
   * =================================================================== */
  let currentMemoType = null;

  function initMemoForm() {
    const monthSel = document.getElementById('memoMonth');
    const daySel = document.getElementById('memoDay');
    const yearSel = document.getElementById('memoYear');

    // Populate month & day selects
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${m}月`;
      monthSel.appendChild(opt);
    }
    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `${d}日`;
      daySel.appendChild(opt);
    }
    // Populate year select (current year ± 5)
    const nowYear = new Date().getFullYear();
    for (let y = nowYear; y <= nowYear + 5; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = `${y}年`;
      yearSel.appendChild(opt);
    }

    // If a date is selected in the calendar, pre-fill the form
    if (selectedDate) {
      const [sy, sm, sd] = selectedDate.split('-').map(Number);
      monthSel.value = sm;
      daySel.value = sd;
      yearSel.value = sy;
    }

    // Type buttons
    document.querySelectorAll('.memo-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        currentMemoType = type;

        document.querySelectorAll('.memo-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const form = document.getElementById('memoForm');
        form.classList.add('visible');

        // Show/hide year for 'once' type
        document.getElementById('memoYear').style.display = type === 'once' ? '' : 'none';

        // Pre-fill from selected date
        if (selectedDate) {
          const [sy, sm, sd] = selectedDate.split('-').map(Number);
          if (type === 'birthday_lunar') {
            // Convert selected solar date to lunar for pre-fill
            const lunar = solarToLunar(sy, sm, sd);
            if (lunar) {
              monthSel.value = lunar.month;
              daySel.value = lunar.day;
            }
          } else {
            monthSel.value = sm;
            daySel.value = sd;
            yearSel.value = sy;
          }
        }
      });
    });

    // Submit
    document.getElementById('memoSubmit').addEventListener('click', async () => {
      if (!supabase || !currentMemoType) return;
      const title = document.getElementById('memoTitle').value.trim();
      if (!title) { alert('请输入事项名称'); return; }

      const month = parseInt(monthSel.value);
      const day = parseInt(daySel.value);
      const year = currentMemoType === 'once' ? parseInt(yearSel.value) : null;

      const record = {
        type: currentMemoType,
        title,
        month,
        day,
        year,
        is_lunar: currentMemoType === 'birthday_lunar',
      };

      const { error } = await supabase.from('memos').insert([record]);
      if (error) {
        console.error('Insert error:', error);
        alert('添加失败: ' + error.message);
        return;
      }

      // Reset & refresh
      document.getElementById('memoTitle').value = '';
      document.getElementById('memoForm').classList.remove('visible');
      document.querySelectorAll('.memo-type-btn').forEach(b => b.classList.remove('active'));
      currentMemoType = null;
      await renderCalendar();
    });
  }

  /* ===================================================================
   *  REMINDER POPUP  (shows memos in next 30 days)
   * =================================================================== */
  async function checkReminders() {
    // Only show once per day
    const shown = localStorage.getItem('reminder_shown');
    if (shown === todayKey()) return;

    if (!supabase) return;
    await loadMemos();
    if (allMemos.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminders = [];

    for (let offset = 0; offset <= 30; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const memos = getMemosForDate(year, month, day);
      memos.forEach(m => {
        reminders.push({
          title: m.title,
          type: m.type,
          date: `${month}月${day}日`,
          daysLeft: offset,
        });
      });
    }

    if (reminders.length === 0) return;

    // Remove duplicates for same-day same-type (lunar birthday edge case)
    const seen = new Set();
    const unique = reminders.filter(r => {
      const key = `${r.title}-${r.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const list = document.getElementById('reminderList');
    list.innerHTML = unique.map(r => `
      <div class="reminder-item">
        <div class="r-title">${r.title}</div>
        <div class="r-detail">${MEMO_TYPE_LABELS[r.type] || r.type}</div>
        <div class="r-days">${r.date}${r.daysLeft === 0 ? ' — 📍 就是今天！' : ` — 还有 ${r.daysLeft} 天`}</div>
      </div>
    `).join('');

    const modal = document.getElementById('reminderModal');
    modal.classList.add('visible');

    document.getElementById('modalCloseBtn').addEventListener('click', () => {
      modal.classList.remove('visible');
      localStorage.setItem('reminder_shown', todayKey());
    });
  }

  /* ===================================================================
   *  FADE-IN ON SCROLL
   * =================================================================== */
  function initScrollAnimations() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
  }

  /* ===================================================================
   *  INIT
   * =================================================================== */
  async function main() {
    setupBackgrounds();
    initPagination();
    initBGM();
    initScrollAnimations();

    await Promise.all([loadNavCSV(), loadSitesCSV(), initSupabase()]);

    initCalendar();
    initMemoForm();

    // Delay reminder check to let memos load
    setTimeout(() => checkReminders(), 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
