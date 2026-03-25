    // ══════════════════════════════════════
    // CONSTANTS
    // ══════════════════════════════════════
    const PRICES = { domestic: 90000, pearl: 100000, foreign: 130000 };
    const TNAMES = { domestic: '국산 일반', pearl: '국산 펄', foreign: '외제차' };
    const PANELS = [
      { id: 'front_bumper', name: '앞 범퍼' }, { id: 'rear_bumper', name: '뒤 범퍼' },
      { id: 'fender_fl', name: '앞 펜더 (운전석)' }, { id: 'fender_fr', name: '앞 펜더 (조수석)' },
      { id: 'fender_rl', name: '뒷 펜더 (운전석)' }, { id: 'fender_rr', name: '뒷 펜더 (조수석)' },
      { id: 'door_fl', name: '앞 도어 (운전석)' }, { id: 'door_fr', name: '앞 도어 (조수석)' },
      { id: 'door_rl', name: '뒤 도어 (운전석)' }, { id: 'door_rr', name: '뒤 도어 (조수석)' },
      { id: 'hood', name: '후드' }, { id: 'trunk', name: '트렁크' },
      { id: 'roof', name: '지붕', isRoof: true },
      { id: 'step_l', name: '사이드스텝 (운전석)' }, { id: 'step_r', name: '사이드스텝 (조수석)' },
      { id: 'pil_al', name: 'A필러 (운전석)' }, { id: 'pil_ar', name: 'A필러 (조수석)' },
      { id: 'pil_bl', name: 'B필러 (운전석)' }, { id: 'pil_br', name: 'B필러 (조수석)' },
      { id: 'mirror_l', name: '사이드미러 (운전석)' }, { id: 'mirror_r', name: '사이드미러 (조수석)' },
    ];

    // ── 3-step status system: 대기 → 작업중 → 작업완료 ──
    const STATUS_FLOW = ['입고', '작업지시', '작업완료'];
    const STATUS_BADGE = {
      '입고': '<span class="badge b-wait">대기</span>',
      '작업지시': '<span class="badge b-work">작업 중</span>',
      '작업중': '<span class="badge b-work">작업 중</span>',
      '작업완료': '<span class="badge b-done">완료</span>',
      '완료': '<span class="badge b-done">완료</span>',
      '픽업대기': '<span class="badge b-done">완료</span>',
      '출고': '<span class="badge b-done">완료</span>',
    };
    const getBadge = s => STATUS_BADGE[s] || `<span class="badge b-wait">${s || '?'}</span>`;

    // status migration: old → new
    function migrateStatus(s) {
      if (s === '작업중') return '작업지시';
      if (s === '완료' || s === '픽업대기' || s === '출고') return '작업완료';
      if (STATUS_FLOW.includes(s)) return s;
      return '입고';
    }
    const isDone = r => migrateStatus(r.status) === '작업완료';

    function nextAction(status) {
      const s = migrateStatus(status);
      const labels = { '입고': '작업지시 →', '작업지시': '완료 →' };
      return labels[s] || null;
    }
    function dPlus(r) { if (isDone(r)) return ''; const d = r.indate; if (!d) return ''; return Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000); }
    function haptic() { try { navigator.vibrate && navigator.vibrate(30); } catch (e) { } }

    const WO_DM = {
      front_bumper: 'wo-fb', rear_bumper: 'wo-rb', fender_fl: 'wo-ffl', fender_fr: 'wo-ffr',
      fender_rl: 'wo-frl', fender_rr: 'wo-frr', door_fl: 'wo-dfl', door_fr: 'wo-dfr',
      door_rl: 'wo-drl', door_rr: 'wo-drr', hood: 'wo-hood', trunk: 'wo-trunk', roof: 'wo-roof',
      mirror_l: 'wo-ml', mirror_r: 'wo-mr', step_l: 'wo-sl', step_r: 'wo-sr',
      pil_al: 'wo-pal', pil_ar: 'wo-par', pil_bl: 'wo-pbl', pil_br: 'wo-pbr', pil_cl: 'wo-pcl', pil_cr: 'wo-pcr',
    };

    // ══════════════════════════════════════
    // FIREBASE
    // ══════════════════════════════════════
    import { initializeApp } from "firebase/app";
    import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc, query, orderBy, where, serverTimestamp, getDocs } from "firebase/firestore";
    const app = initializeApp({
      apiKey: "AIzaSyAB_AXUPHoagnPBl9esorFqy7e2PcD1f1Y", authDomain: "new-wan-seong.firebaseapp.com",
      projectId: "new-wan-seong", storageBucket: "new-wan-seong.firebasestorage.app",
      messagingSenderId: "306851978177", appId: "1:306851978177:web:2f6ec14f88d1e033c9ad40"
    });
    const db = getFirestore(app);
    const colRef = collection(db, 'records');
    const dealersRef = collection(db, 'dealers');
    const tgReqRef = collection(db, 'telegramRequests');
    const settingsRef = collection(db, 'settings');

    // Express API 기본 URL
    const API = 'https://us-central1-new-wan-seong.cloudfunctions.net/api';
    const apiCall = async (path, body) => {
      const r = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return r.json();
    };

    // ══════════════════════════════════════
    // STATE
    // ══════════════════════════════════════
    let records = [], filterStatus = '입고', editId = null;
    let modalStatus = '입고', carType = 'domestic', selPanels = {}, parts = [];
    let currentMonth = new Date(), dealerDetailName = null;
    let weeklyMonth = new Date(), currentWeek = 1;
    weeklyMonth.setDate(1);
    let tgRequests = [], dealerChatIds = {}; // 텔레그램 상태

    // ══════════════════════════════════════
    // FIREBASE SYNC
    // ══════════════════════════════════════
    onSnapshot(colRef, snap => {
      records = snap.docs.map(d => d.data());
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      renderAll();
      if (dealerDetailName) renderDealerDetail(dealerDetailName);
    }, err => { showToast('❌ DB오류: ' + err.code); console.error(err); });

    // 텔레그램 요청 실시간 수신
    onSnapshot(query(tgReqRef, orderBy('createdAt', 'desc')), snap => {
      tgRequests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = tgRequests.filter(r => r.status === 'pending').length;
      const badge = $('tgBadge');
      if (badge) { badge.textContent = pending; badge.style.display = pending ? 'inline' : 'none'; }
      const activeTab = document.querySelector('.sb-item.on');
      if (activeTab && activeTab.dataset.tab === 'telegram') renderTelegramTab();
    }, err => { console.warn('TG요청 수신 오류:', err.code); });

    // 딜러 chatId 실시간 수신
    onSnapshot(dealersRef, snap => {
      dealerChatIds = {};
      snap.docs.forEach(d => { const data = d.data(); if (data.name) dealerChatIds[data.name] = data.chatId || ''; });
    }, err => { console.warn('딜러 수신 오류:', err.code); });

    async function saveToDb(rec) { try { await setDoc(doc(db, 'records', rec.id), rec); } catch (e) { showToast('❌ 저장오류'); console.error(e); } }
    async function deleteFromDb(id) { try { await deleteDoc(doc(db, 'records', id)); } catch (e) { showToast('❌ 삭제오류'); console.error(e); } }

    // ══════════════════════════════════════
    // UTILS
    // ══════════════════════════════════════
    const $ = s => document.getElementById(s), $$ = s => document.querySelectorAll(s);
    function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function fmtDate(d) { if (!d) return '-'; const p = String(d).split('-'); return p.length === 3 ? `${p[1]}/${p[2]}` : String(d); }
    function calcPlates(r) {
      if (!r.selPanels) return 0;
      let t = 0; Object.entries(r.selPanels).forEach(([id, v]) => { t += id === 'roof' ? 2 : v?.severe ? 2 : v?.half ? 0.5 : 1; }); return t;
    }
    function platesLabel(r) { const n = calcPlates(r); return n ? n + '판' : '-'; }

    // ══════════════════════════════════════
    // SIDEBAR & TABS
    // ══════════════════════════════════════
    function toggleSidebar() { $('sidebar').classList.toggle('open'); $('sidebarOverlay').classList.toggle('open'); }
    function closeSidebar() { $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.remove('open'); }
    function showTab(t) {
      ['dash', 'dealers', 'weekly', 'analytics', 'telegram'].forEach(n => {
        const el = $('tab-' + n); if (el) el.style.display = n === t ? 'block' : 'none';
        const nav = $('nav-' + n); if (nav) nav.classList.toggle('on', n === t);
      });
      $('pageTitle').textContent = { dash: '작업 현황', dealers: '딜러별 내역', weekly: '주별 현황', analytics: '경영 현황', telegram: '텔레그램 요청' }[t] || t;
      if (t === 'dealers') renderDealers();
      if (t === 'weekly') renderWeekly();
      if (t === 'analytics') renderAnalytics();
      if (t === 'telegram') renderTelegramTab();
      closeSidebar();
    }

    // ══════════════════════════════════════
    // FILTER
    // ══════════════════════════════════════
    function setFilter(s) {
      filterStatus = s;
      $$('.fbtn').forEach(b => b.classList.toggle('on', b.dataset.filter === s));
      renderTable();
    }

    // ══════════════════════════════════════
    // MODAL
    // ══════════════════════════════════════
    // Modal tab (mobile only)
    const isMobile = () => window.innerWidth <= 768;
    function setModalTab(tab) {
      $$('.modal-tab').forEach(t => t.classList.toggle('on', t.dataset.mtab === tab));
      if (isMobile()) {
        $('pane-info').classList.toggle('hidden', tab !== 'info');
        $('pane-quote').classList.toggle('hidden', tab !== 'quote');
      } else {
        $('pane-info').classList.remove('hidden');
        $('pane-quote').classList.remove('hidden');
      }
      if (tab === 'quote') setTimeout(renderDiagram, 50);
    }

    function openModal(id = null) {
      editId = id;
      const rec = id ? records.find(r => r.id === id) : null;
      $('modalTitle').textContent = id ? '차량 수정' : '차량 접수';
      $('btnDel').style.display = id ? 'block' : 'none';
      $('statusSection').style.display = id ? 'block' : 'none';

      const today = new Date().toISOString().split('T')[0];
      $('f-carnum').value = rec?.carnum || '';
      const badge = $('carnumAiBadge'); if (badge) badge.style.display = 'none';
      $('f-dealer').value = rec?.dealer || '';
      $('f-carmaker').value = rec?.carmaker || '';
      $('f-carmodel').value = rec?.carmodel || '';
      $('f-indate').value = rec?.indate || today;
      $('f-work').value = rec?.work || '';
      $('f-memo').value = rec?.memo || '';

      carType = rec?.carType || 'domestic';
      selPanels = rec?.selPanels ? JSON.parse(JSON.stringify(rec.selPanels)) : {};
      parts = rec?.parts ? JSON.parse(JSON.stringify(rec.parts)) : [];
      modalStatus = rec ? migrateStatus(rec.status) : '입고';

      $$('.tybtn').forEach(b => b.classList.toggle('on', b.dataset.t === carType));
      updateStatusUI();
      renderPanels(); renderParts(); updateQuoteStrip();
      updatePrintTrack(rec);

      setModalTab('info');
      $('overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
      history.pushState({ modal: true }, '');
      setTimeout(() => { renderDiagram(); $('f-carnum').focus(); }, 80);
    }
    function closeModal() { $('overlay').classList.remove('open'); document.body.style.overflow = ''; editId = null; }

    function updateStatusUI() {
      $$('#statusSteps .ss').forEach(btn => {
        const st = btn.dataset.st;
        const cls = 'ss' + (st === modalStatus ? ` s-on-${st === '입고' ? 'wait' : st === '작업지시' ? 'work' : 'done'}` : '');
        btn.className = cls;
      });
      // print track: show when 작업지시 or later
      const showPrint = modalStatus !== '입고';
      $('printTrack').classList.toggle('show', showPrint);
    }
    function updatePrintTrack(rec) {
      const printed = rec?.printed || false;
      $('printDot').classList.toggle('printed', printed);
      $('printText').textContent = printed ? `✅ 인쇄됨 (${rec.printedAt ? fmtDate(rec.printedAt) : ''})` : '⚠️ 작업지시서 미인쇄';
    }

    // ══════════════════════════════════════
    // CAR TYPE
    // ══════════════════════════════════════
    function setCarType(t) { carType = t; $$('.tybtn').forEach(b => b.classList.toggle('on', b.dataset.t === t)); renderPanels(); updateQuoteStrip(); }

    // ══════════════════════════════════════
    // SVG DIAGRAM (same as v3)
    // ══════════════════════════════════════
    function renderDiagram() {
      const svg = $('woDiagram'); if (!svg) return;
      const W = 560, cx = 280, sp = 18, gap = 12;
      const bh = 44, hh = 88, dh = 88, th = 70, fw = 44, sw = 14, mw = 20, mh = 32, rw = 100, dw = 86;
      const y_fb = 20, y_hd = y_fb + bh + sp, y_d1 = y_hd + hh + sp, y_d2 = y_d1 + dh + sp, y_tk = y_d2 + dh + sp, y_rb = y_tk + th + sp;
      const totalH = y_rb + bh + 24;
      const roof_x = cx - rw / 2, door_lx = roof_x - gap - dw, door_rx = roof_x + rw + gap;
      const step_lx = door_lx - gap - sw, step_rx = door_rx + dw + gap;
      const body_x = door_lx, body_w = dw + gap + rw + gap + dw;
      const fend_lx = body_x - gap - fw, fend_rx = body_x + body_w + gap;
      const mir_lx = fend_lx - 5 - mw, mir_rx = fend_rx + fw + 5;
      const bmp_x = cx - body_w / 2 + 12, bmp_w = body_w - 24;
      const roof_h = dh * 2 + sp;
      const pA_w = roof_x - (door_lx + dw) - 2, pA_h = dh, pA_lx = door_lx + dw + 1, pA_rx = roof_x + rw + 1, pA_y = y_d1;
      const pB_h = pA_w, pB_w = dw, pB_y = y_d1 + Math.round(roof_h / 2) - Math.round(pB_h / 2);
      const pB_lx = door_lx, pB_rx = door_rx + dw - pB_w;
      const pC_w = pA_w, pC_h = dh, pC_lx = pA_lx, pC_rx = pA_rx, pC_y = y_d2;
      svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);
      const p = (id, x, y, w, h, rx, label, rot) => {
        const pid = WO_DM[id] || ('wo-' + id), lx = x + w / 2, ly = y + h / 2;
        const tr = rot ? `transform="rotate(${rot},${lx},${ly})"` : '';
        return `<rect id="${pid}" class="wo-cp" data-panel="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#eceae4" stroke="#999" stroke-width="2"/>
    <text id="${pid}-t" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="14" fill="#333" font-weight="800" pointer-events="none" font-family="Noto Sans KR" ${tr}>${label}</text>`;
      };
      const pl = (id, x, y, w, h, label) => {
        const pid = WO_DM[id] || ('wo-' + id), lx = x + w / 2, ly = y + h / 2;
        return `<rect id="${pid}" class="wo-cp" data-panel="${id}" x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#d6d3cc" stroke="#aaa" stroke-width="1.5" stroke-dasharray="4,3"/>
    <text id="${pid}-t" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#777" font-weight="800" pointer-events="none" font-family="Noto Sans KR">${label}필러</text>`;
      };
      svg.innerHTML = `<defs><pattern id="wo-pat-half" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#888" stroke-width="3.5"/></pattern></defs>
    ${p('front_bumper', bmp_x, y_fb, bmp_w, bh, 12, '앞 범퍼', 0)}
    ${p('hood', body_x, y_hd, body_w, hh, 7, '후드', 0)}
    ${p('fender_fl', fend_lx, y_hd, fw, hh, 7, '앞펜더(운전)', -90)}${p('fender_fr', fend_rx, y_hd, fw, hh, 7, '앞펜더(조수)', 90)}
    ${p('mirror_l', mir_lx, y_hd + hh / 2 - mh / 2, mw, mh, 6, '미러', 0)}${p('mirror_r', mir_rx, y_hd + hh / 2 - mh / 2, mw, mh, 6, '미러', 0)}
    ${p('roof', roof_x, y_d1, rw, roof_h, 9, '지붕', 0)}
    ${p('step_l', step_lx, y_d1, sw, roof_h, 4, '스텝(운전)', -90)}${p('step_r', step_rx, y_d1, sw, roof_h, 4, '스텝(조수)', 90)}
    ${p('door_fl', door_lx, y_d1, dw, dh, 6, '앞도어(운전)', 0)}${p('door_fr', door_rx, y_d1, dw, dh, 6, '앞도어(조수)', 0)}
    ${pl('pil_al', pA_lx, pA_y, pA_w, pA_h, 'A')}${pl('pil_ar', pA_rx, pA_y, pA_w, pA_h, 'A')}
    ${pl('pil_bl', pB_lx, pB_y, pB_w, pB_h, 'B')}${pl('pil_br', pB_rx, pB_y, pB_w, pB_h, 'B')}
    ${pl('pil_cl', pC_lx, pC_y, pC_w, pC_h, 'C')}${pl('pil_cr', pC_rx, pC_y, pC_w, pC_h, 'C')}
    ${p('door_rl', door_lx, y_d2, dw, dh, 6, '뒷도어(운전)', 0)}${p('door_rr', door_rx, y_d2, dw, dh, 6, '뒷도어(조수)', 0)}
    ${p('trunk', body_x, y_tk, body_w, th, 7, '트렁크', 0)}
    ${p('fender_rl', fend_lx, y_tk, fw, th, 7, '뒷펜더(운전)', -90)}${p('fender_rr', fend_rx, y_tk, fw, th, 7, '뒷펜더(조수)', 90)}
    ${p('rear_bumper', bmp_x, y_rb, bmp_w, bh, 12, '뒤 범퍼', 0)}
    <text x="6" y="${y_fb + 14}" font-size="10" fill="#ccc" font-family="monospace">앞▲</text>
    <text x="6" y="${y_rb + bh}" font-size="10" fill="#ccc" font-family="monospace">뒤▼</text>`;
      svg.onclick = e => { const cp = e.target.closest('.wo-cp'); if (cp && cp.dataset.panel) togglePanel(cp.dataset.panel); };
      syncDiagram();
    }
    function syncDiagram() {
      $$('.wo-cp').forEach(e => e.classList.remove('hit-half', 'hit-one', 'hit-two'));
      $$('[id$="-t"]').forEach(t => { if (t.id.startsWith('wo-')) t.setAttribute('fill', '#444'); });
      Object.entries(selPanels).forEach(([id, val]) => {
        const el = document.getElementById(WO_DM[id]); if (!el) return;
        if (val?.severe) { el.classList.add('hit-two'); const t = document.getElementById(WO_DM[id] + '-t'); if (t) t.setAttribute('fill', '#fff'); }
        else if (val?.half) el.classList.add('hit-half');
        else el.classList.add('hit-one');
      });
    }

    // ══════════════════════════════════════
    // PANELS
    // ══════════════════════════════════════
    function renderPanels() {
      const g = $('panelGrid'); g.innerHTML = '';
      PANELS.forEach(p => {
        const sel = selPanels[p.id], sv = sel?.severe, half = sel?.half;
        const plates = p.isRoof ? 2 : sv ? 2 : half ? 0.5 : 1;
        const price = PRICES[carType] * plates;
        const cls = 'pnl' + (sel ? (sv ? ' sv' : half ? ' half-on' : ' on') : '');
        const d = document.createElement('div'); d.className = cls;
        d.innerHTML = `<div class="pnl-name">${esc(p.name)}</div><div class="pnl-price">${price.toLocaleString()}원${p.isRoof ? ' (2판)' : ''}</div>
      ${sel ? `<div class="sv-wrap">${p.isRoof ? '<span style="font-size:10px;color:var(--muted2)">지붕 2판</span>'
            : `<button class="sv-btn${half ? ' half-active' : ''}" data-action="half" data-pid="${p.id}">½ 0.5판</button><button class="sv-btn${sv ? ' on' : ''}" data-action="severe" data-pid="${p.id}">⚠️ 2판</button>`}</div>` : ''}`;
        d.addEventListener('click', e => { if (e.target.closest('[data-action]')) return; togglePanel(p.id); });
        g.appendChild(d);
      });
      g.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', e => { e.stopPropagation(); const pid = btn.dataset.pid; btn.dataset.action === 'half' ? toggleHalf(pid) : toggleSevere(pid); });
      });
    }
    function togglePanel(id) { selPanels[id] ? delete selPanels[id] : selPanels[id] = { severe: false, half: false }; haptic(); renderPanels(); updateQuoteStrip(); syncDiagram(); $('f-work').value = buildWorkText(); }
    function toggleHalf(id) { if (selPanels[id]) { selPanels[id].half = !selPanels[id].half; if (selPanels[id].half) selPanels[id].severe = false; } haptic(); renderPanels(); updateQuoteStrip(); syncDiagram(); $('f-work').value = buildWorkText(); }
    function toggleSevere(id) { if (selPanels[id]) { selPanels[id].severe = !selPanels[id].severe; if (selPanels[id].severe) selPanels[id].half = false; } haptic(); renderPanels(); updateQuoteStrip(); syncDiagram(); $('f-work').value = buildWorkText(); }

    // ══════════════════════════════════════
    // PARTS
    // ══════════════════════════════════════
    function renderParts() {
      const list = $('partsList'); list.innerHTML = '';
      parts.forEach((p, i) => {
        const r = document.createElement('div'); r.className = 'part-row';
        r.innerHTML = `<input type="text" placeholder="부품명" value="${esc(p.name || '')}" data-idx="${i}" data-field="name">
      <input type="number" placeholder="공임" value="${p.labor || ''}" data-idx="${i}" data-field="labor" style="text-align:right">
      <input type="number" placeholder="부품값" value="${p.cost || ''}" data-idx="${i}" data-field="cost" style="text-align:right">
      <button class="del-btn" data-delidx="${i}">×</button>`;
        list.appendChild(r);
      });
      list.oninput = e => { const t = e.target; if (t.dataset.idx !== undefined) { parts[t.dataset.idx][t.dataset.field] = t.value; updateQuoteStrip(); $('f-work').value = buildWorkText(); } };
      list.onclick = e => { const btn = e.target.closest('[data-delidx]'); if (btn) { parts.splice(parseInt(btn.dataset.delidx), 1); renderParts(); updateQuoteStrip(); $('f-work').value = buildWorkText(); } };
    }

    // ══════════════════════════════════════
    // QUOTE
    // ══════════════════════════════════════
    function calcQuoteLines() {
      const lines = [];
      PANELS.forEach(p => { const sel = selPanels[p.id]; if (!sel) return; const plates = p.isRoof ? 2 : sel.severe ? 2 : sel.half ? 0.5 : 1; const note = p.isRoof ? ' (2판)' : sel.severe ? ' (2판)' : sel.half ? ' (0.5판)' : ''; lines.push({ name: p.name + note, amt: PRICES[carType] * plates }); });
      parts.forEach(p => { const l = parseInt(p.labor) || 0, c = parseInt(p.cost) || 0; if (p.name && (l || c)) lines.push({ name: `${p.name} 교환`, amt: l + c }); });
      return lines;
    }
    function calcTotal() { return calcQuoteLines().reduce((s, l) => s + l.amt, 0); }
    function updateQuoteStrip() {
      const lines = calcQuoteLines(), total = lines.reduce((s, l) => s + l.amt, 0);
      const strip = $('quoteStrip');
      if (!lines.length) { strip.innerHTML = '<div class="qs-empty">패널 또는 부품을 선택해주세요</div>'; return; }
      let h = '<div class="qs-lines">';
      lines.forEach(l => { h += `<div class="qs-line"><span>${esc(l.name)}</span><span class="qa">${l.amt.toLocaleString()}원</span></div>`; });
      h += `</div><div class="qs-total"><span class="ql">총 견적</span><span class="qv">₩${total.toLocaleString()}</span></div>`;
      strip.innerHTML = h;
    }
    function buildWorkText() {
      const items = [];
      PANELS.forEach(p => { const sel = selPanels[p.id]; if (!sel) return; const note = p.isRoof ? ' (2판)' : sel.severe ? ' (2판)' : sel.half ? ' (0.5판)' : ''; items.push(p.name + note); });
      parts.forEach(p => { if (p.name) items.push(p.name + ' 교환'); });
      return items.join(', ');
    }

    // ══════════════════════════════════════
    // SAVE / DELETE
    // ══════════════════════════════════════
    async function saveRec() {
      const carnum = $('f-carnum').value.trim(), dealer = $('f-dealer').value.trim();
      if (!carnum || !dealer) { showToast('⚠️ 차량번호와 딜러명은 필수'); return; }
      const total = calcTotal();
      const existing = editId ? records.find(r => r.id === editId) : null;
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      const rec = {
        id: editId || Date.now().toString(),
        carnum, dealer,
        carmaker: $('f-carmaker').value.trim(),
        carmodel: $('f-carmodel').value.trim(),
        carType, selPanels: JSON.parse(JSON.stringify(selPanels)),
        parts: JSON.parse(JSON.stringify(parts)),
        amount: total,
        indate: $('f-indate').value,
        work: $('f-work').value.trim(),
        memo: $('f-memo').value.trim(),
        status: modalStatus,
        completedAt: modalStatus === '작업완료' ? (existing?.completedAt || now) : null,
        outdate: modalStatus === '작업완료' ? (existing?.outdate || today) : '',
        createdAt: editId ? existing?.createdAt : Date.now(),
        printed: existing?.printed || false,
        printedAt: existing?.printedAt || null,
      };
      await saveToDb(rec);
      showToast(editId ? '✅ 수정됐어요' : `✅ 접수! 견적 ₩${total.toLocaleString()}`);
      closeModal();
    }
    async function deleteRec() {
      if (!confirm('정말 삭제할까요?')) return;
      await deleteFromDb(editId); closeModal(); showToast('🗑 삭제됐어요');
    }

    // ══════════════════════════════════════
    // QUICK ADVANCE
    // ══════════════════════════════════════
    async function advance(id, e) {
      e.stopPropagation();
      const rec = records.find(r => r.id === id); if (!rec) return;
      const cur = migrateStatus(rec.status);
      const idx = STATUS_FLOW.indexOf(cur);
      if (idx < 0 || idx >= STATUS_FLOW.length - 1) return;
      const next = STATUS_FLOW[idx + 1];
      const now = new Date().toISOString();
      const update = { ...rec, status: next };
      if (next === '작업완료') { update.completedAt = now; update.outdate = now.split('T')[0]; }
      await saveToDb(update);
      showToast(`→ ${next === '작업지시' ? '작업 중' : next === '작업완료' ? '작업 완료' : next}`);
    }

    // ══════════════════════════════════════
    // PRINT WORK ORDER + tracking
    // ══════════════════════════════════════
    async function printWorkOrder() {
      if (modalStatus === '입고') {
        modalStatus = '작업지시';
        updateStatusUI();
      }

      const carnum = $('f-carnum').value || '-', dealer = $('f-dealer').value || '-';
      const indate = $('f-indate').value || '-', carmodel = $('f-carmodel').value || '-';
      const today = new Date();
      const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
      
      // CarType에서 가격 정보 제거 및 총 판 수 계산
      const ctBtn = document.querySelector('.tybtn.on');
      let carTypeName = ctBtn ? ctBtn.innerText.split('\n')[0] : '';
      carTypeName = carTypeName.split(' ')[0] + (carTypeName.includes('펄') ? ' 펄' : ''); 

      // 총 판 수 계산 (1.0, 0.5, 2.0 합산)
      let totalPlates = 0;
      Object.entries(selPanels).forEach(([id, val]) => {
          const p = PANELS.find(p => p.id === id);
          if (p?.isRoof || val?.severe) totalPlates += 2;
          else if (val?.half) totalPlates += 0.5;
          else totalPlates += 1;
      });
      if (totalPlates > 0) carTypeName += ` / ${totalPlates}판`;

      const panelNames = {}; PANELS.forEach(p => panelNames[p.id] = p.name);
      const panelItems = Object.entries(selPanels).map(([id, val]) => `<div class="pa-panel-item${val?.severe ? ' severe' : ''}">${panelNames[id] || id}${val?.severe ? ' ×2' : val?.half ? ' ×0.5' : ''}</div>`).join('');
      const partItems = parts.filter(p => p.name).map(p => `<div class="pa-part-item">${esc(p.name)}</div>`).join('');

      const svgEl = $('woDiagram'); let svgHtml = '';
      if (svgEl) {
        const clone = svgEl.cloneNode(true); clone.setAttribute('width', '100%'); clone.removeAttribute('height');
        Object.entries(selPanels).forEach(([id, val]) => {
          const pid = WO_DM[id]; if (!pid) return; const el = clone.querySelector('#' + pid); if (!el) return;
          if (val?.severe) { el.setAttribute('fill', '#222'); el.setAttribute('stroke', '#000'); el.setAttribute('stroke-width', '4'); const t = clone.querySelector('#' + pid + '-t'); if (t) t.setAttribute('fill', '#fff'); }
          else if (val?.half) { el.setAttribute('fill', '#bbb'); el.setAttribute('stroke', '#555'); }
          else { el.setAttribute('fill', '#888'); el.setAttribute('stroke', '#333'); el.setAttribute('stroke-width', '3.5'); }
        }); svgHtml = clone.outerHTML;
      }

      const pw = window.open('', '_blank');
      if (!pw) { showToast('⚠️ 팝업 차단됨'); return; }
      pw.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>작업지시서</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;background:#e8e8e4;min-height:100vh;padding-bottom:50px}

/* ── 프리뷰: A4 비율 ── */
.preview-wrap{max-width:800px;margin:0 auto;padding:12px}
.pa-page{background:#fff;padding:8mm 10mm;box-shadow:0 2px 16px rgba(0,0,0,.1);border-radius:4px;min-height:280mm;display:flex;flex-direction:column}

.pa-header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #1a1a1a;padding-bottom:5px;margin-bottom:5px}
.pa-title{font-size:18px;font-weight:900;letter-spacing:.1em}
.pa-date{font-size:10px;color:#999}
.pa-carnum{font-size:28px;font-weight:900;color:#1a1a1a;margin-bottom:5px;line-height:1}
.pa-meta{display:grid;grid-template-columns:repeat(4,1fr);margin-bottom:8px;border:1.5px solid #1a1a1a;border-radius:5px;overflow:hidden}
.pa-meta span{display:flex;flex-direction:column;padding:4px 8px;border-right:1px solid #ccc}
.pa-meta span:last-child{border-right:none}
.pa-meta b{font-size:9px;font-weight:900;color:#888;margin-bottom:1px}
.pa-meta span>span{font-size:14px;font-weight:700;color:#1a1a1a}

/* 도면 영역 최대화 */
.pa-diagram{margin:5px 0;flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fdfdfd;border-radius:8px}
.pa-diagram svg{width:105%;height:auto;max-height:100%;display:block;transform:scale(1.05)} /* 꽉 차게 살짝 확대 */

.pa-bottom{display:grid;grid-template-columns:1.2fr 1fr;gap:12px;border-top:2px solid #1a1a1a;padding-top:8px}
.pa-section-title{font-size:13px;font-weight:900;color:#333;margin-bottom:5px;border-bottom:1.5px solid #333;padding-bottom:2px}
.pa-panels{display:flex;flex-wrap:wrap;gap:4px;align-content:flex-start}
.pa-panel-item{border:1.5px solid #333;border-radius:4px;padding:4px 8px;font-size:13px;font-weight:900;white-space:nowrap}
.pa-panel-item.severe{background:#1a1a1a;color:#fff;border-color:#1a1a1a}
.pa-part-item{display:flex;align-items:center;gap:5px;padding:4px 0;font-size:12px;font-weight:700;border-bottom:1px solid #eee}
.pa-part-item::before{content:'교환';font-size:9px;font-weight:900;background:#1a1a1a;color:#fff;padding:1px 5px;border-radius:3px}

.print-bar{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,0.95);padding:14px;text-align:center;border-top:1px solid #ddd;z-index:10}
.print-btn{padding:12px 40px;background:#1a1a1a;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:900;cursor:pointer}

@media(max-width:600px){
  .pa-page{padding:6mm 8mm}
  .pa-carnum{font-size:24px}
  .pa-meta span>span{font-size:12px}
  .pa-panel-item{font-size:12px;padding:4px 8px}
  .pa-bottom{grid-template-columns:1fr}
}

@media print{
  .print-bar{display:none}
  body{background:#fff;padding:0;margin:0}
  .preview-wrap{padding:0;max-width:none}
  .pa-page{box-shadow:none;border-radius:0;padding:8mm 10mm;width:210mm;height:297mm;overflow:hidden}
  @page{size:A4;margin:0}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style></head>
<body>

<div class="preview-wrap"><div class="pa-page">
  <div class="pa-header"><div class="pa-title">작업 지시서</div><div class="pa-date">${dateStr}</div></div>
  <div class="pa-carnum">${esc(carnum)}</div>
  <div class="pa-meta"><span><b>딜러</b><span>${esc(dealer)}</span></span><span><b>차종</b><span>${esc(carmodel)}</span></span><span><b>입고일</b><span>${indate}</span></span><span><b>구분</b><span>${carTypeName || '-'}</span></span></div>
  <div class="pa-diagram">${svgHtml}</div>
  <div class="pa-bottom">
    <div><div class="pa-section-title">도색 부위</div><div class="pa-panels">${panelItems || '<div style="color:#ccc;font-size:12px">선택된 부위 없음</div>'}</div></div>
    <div><div class="pa-section-title">부품 교환</div>${partItems || '<div style="color:#ccc;font-size:12px">교환 부품 없음</div>'}</div>
  </div>
</div></div>
<div class="print-bar"><button class="print-btn" onclick="window.print()">🖨️ 인쇄하기</button></div>
</body></html>`);
      pw.document.close();

      // Mark as printed and auto-advance status
      if (editId) {
        const rec = records.find(r => r.id === editId);
        if (rec) {
          let needSave = false;
          let updateObj = { ...rec };
          
          if (!rec.printed) {
            updateObj.printed = true;
            updateObj.printedAt = new Date().toISOString().split('T')[0];
            needSave = true;
          }
          if (migrateStatus(rec.status) === '입고') {
            updateObj.status = '작업지시';
            needSave = true;
          }
          
          if (needSave) {
            await saveToDb(updateObj);
            updatePrintTrack(updateObj);
            if (updateObj.status === '작업지시' && migrateStatus(rec.status) === '입고') {
              showToast('✅ 작업지시서 인쇄 및 작업지시로 변경됨');
            } else {
              showToast('🖨️ 인쇄 기록 저장됨');
            }
          }
        }
      }
    }

    // ══════════════════════════════════════
    // TABLE
    // ══════════════════════════════════════
    function rowCells(r, i) {
      const dp = dPlus(r); const dpHtml = dp !== '' ? `<div class="dplus${dp >= 5 ? ' old' : ''}">D+${dp}</div>` : '';
      return `<div class="td rnum">${i + 1}</div>
    <div class="td mono gray">${fmtDate(r.indate)}</div>
    <div class="td bold mono">${esc(r.carnum) || '-'}</div>
    <div class="td gray">${esc(r.carmodel) || '-'}</div>
    <div class="td gray" title="${esc(r.work)}">${esc(r.work) || '-'}</div>
    <div class="td">${esc(r.dealer) || '-'}</div>
    <div class="td orange">${r.amount ? r.amount.toLocaleString() + '원' : '-'}</div>
    <div class="td gray">${platesLabel(r)}</div>
    <div class="td">${getBadge(r.status)}${dpHtml}</div>`;
    }

    function renderTable() {
      const q = ($('searchInput').value || '').replace(/\s/g, '').toLowerCase();
      const now = new Date(), mp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const filtered = records.filter(r => {
        const ms = migrateStatus(r.status);
        let statusMatch = false;
        if (filterStatus === '입고') statusMatch = ms === '입고';
        else if (filterStatus === '작업지시') statusMatch = ms === '작업지시';
        else if (filterStatus === '작업완료') { statusMatch = ms === '작업완료'; if (statusMatch && r.outdate && !String(r.outdate).startsWith(mp)) statusMatch = false; }
        else statusMatch = true;
        const mq = !q || (r.carnum || '').replace(/\s/g, '').toLowerCase().includes(q) || (r.dealer || '').toLowerCase().includes(q);
        return statusMatch && mq;
      });

      filtered.sort((a, b) => {
        const order = { '입고': 0, '작업지시': 1, '작업완료': 2 };
        const oa = order[migrateStatus(a.status)] ?? 9, ob = order[migrateStatus(b.status)] ?? 9;
        if (oa !== ob) return oa - ob;
        if (oa === 2) return (b.outdate || '').localeCompare(a.outdate || '');
        return (a.indate || '').localeCompare(b.indate || '');
      });

      const body = $('tableBody');
      if (!filtered.length) {
        body.innerHTML = '<div class="empty-tbl"><div class="eicon">🚗</div><div>차량이 없어요</div></div>';
        $('mobCards').innerHTML = body.innerHTML; return;
      }
      body.innerHTML = filtered.map((r, i) => {
        const nl = nextAction(r.status);
        const hasChatId = dealerChatIds[r.dealer];
        const pickupBtn = isDone(r) && hasChatId
          ? `<button class="ra-btn pickup-btn" data-pickup="${r.id}" title="딜러에게 픽업 알림 발송">📱</button>`
          : '';
        return `<div class="tbl-row${isDone(r) ? ' faded' : ''}" data-rid="${r.id}">
      ${rowCells(r, i)}
      <div class="td row-acts">
        ${nl ? `<button class="ra-btn next" data-adv="${r.id}">${nl}</button>` : pickupBtn || `<span style="font-size:10px;color:var(--muted2)">완료</span>`}
      </div></div>`;
      }).join('');

      const dpBadge = r => { const d = dPlus(r); return d !== '' ? `<span class="dplus${d >= 5 ? ' old' : ''}">D+${d}</span>` : ''; }
      $('mobCards').innerHTML = filtered.map(r => {
        const nl = nextAction(r.status);
        const hasChatId = dealerChatIds[r.dealer];
        return `<div class="mob-card" data-rid="${r.id}">
      <div class="mc-top"><div class="mc-carnum">${esc(r.carnum)}</div><div class="mc-amt">${r.amount ? '₩' + r.amount.toLocaleString() : '-'}</div></div>
      <div class="mc-mid">${getBadge(r.status)}${dpBadge(r)}<span class="mc-dealer">👤 ${esc(r.dealer)}</span>${(r.carmaker || r.carmodel) ? `<span class="mc-dealer">🚗 ${[r.carmaker, r.carmodel].filter(Boolean).map(esc).join(' ')}</span>` : ''}</div>
      <div class="mc-work">${esc(r.work) || '작업 내용 없음'}</div>
      <div class="mc-bot" style="margin-top:8px">
        <div class="mc-date">📅 ${r.indate || '-'}</div>
        ${nl ? `<button class="mc-action" data-adv="${r.id}">${nl}</button>` : (isDone(r) && hasChatId ? `<button class="mc-action" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe" data-pickup="${r.id}">📱 픽업 알림</button>` : '')}
      </div></div>`;
      }).join('');
    }

    // ══════════════════════════════════════
    // STATS
    // ══════════════════════════════════════
    function renderStats() {
      const now = new Date();
      const mp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const wait = records.filter(r => migrateStatus(r.status) === '입고').length;
      const work = records.filter(r => migrateStatus(r.status) === '작업지시').length;
      const doneThisMonth = records.filter(r => isDone(r) && r.outdate && String(r.outdate).startsWith(mp));
      const doneAll = records.filter(r => isDone(r)).length;
      const rev = doneThisMonth.reduce((s, r) => s + (r.amount || 0), 0);

      $('cnt-wait').textContent = wait;
      $('cnt-work').textContent = work;
      $('cnt-done').textContent = doneThisMonth.length;
      $('cnt-done-sub').textContent = `이달 ${doneThisMonth.length}건 / 총 ${doneAll}건`;
      $('sb-rev').textContent = '₩' + rev.toLocaleString();
      $('sb-revsub').textContent = `완료 ${doneThisMonth.length}건`;
    }

    // ══════════════════════════════════════
    // DEALERS
    // ══════════════════════════════════════
    function renderDealers() {
      const y = currentMonth.getFullYear(), m = currentMonth.getMonth() + 1;
      const mp = `${y}-${String(m).padStart(2, '0')}`;
      $('monthLabel').textContent = `${y}.${String(m).padStart(2, '0')}`;
      if (dealerDetailName) { renderDealerDetail(dealerDetailName); return; }
      $('dealerGridView').style.display = 'block'; $('dealerDetailView').style.display = 'none';
      const dm = {};
      records.forEach(r => {
        if (!r.dealer || !r.indate || !String(r.indate).startsWith(mp)) return;
        if (!dm[r.dealer]) dm[r.dealer] = { total: 0, count: 0, done: 0, active: 0 };
        dm[r.dealer].count++; dm[r.dealer].total += (r.amount || 0);
        isDone(r) ? dm[r.dealer].done++ : dm[r.dealer].active++;
      });
      const cards = $('dealerCards');
      const list = Object.entries(dm).sort((a, b) => b[1].total - a[1].total);
      if (!list.length) { cards.innerHTML = '<div style="grid-column:1/-1;padding:50px;text-align:center;color:var(--muted)">이 달 거래가 없어요</div>'; return; }
      cards.innerHTML = list.map(([name, d]) => `<div class="d-card" data-dealer="${esc(name)}">
    <div class="d-card-top"><div class="d-avatar">${esc(name[0])}</div><div class="d-amt">₩${d.total.toLocaleString()}</div></div>
    <div class="d-name">${esc(name)}</div><div class="d-sub">${y}년 ${m}월</div>
    <div class="d-stats"><div class="ds-item"><div class="ds-val">${d.count}</div><div class="ds-label">총</div></div>
    <div class="ds-item"><div class="ds-val" style="color:var(--s-done)">${d.done}</div><div class="ds-label">완료</div></div>
    <div class="ds-item"><div class="ds-val" style="color:var(--s-work)">${d.active}</div><div class="ds-label">진행</div></div></div></div>`).join('');
    }
    function openDealerDetail(name) { dealerDetailName = name; renderDealerDetail(name); }
    function closeDealerDetail() { dealerDetailName = null; $('dealerDetailView').style.display = 'none'; $('dealerGridView').style.display = 'block'; renderDealers(); }
    function renderDealerDetail(name) {
      const y = currentMonth.getFullYear(), m = currentMonth.getMonth() + 1, mp = `${y}-${String(m).padStart(2, '0')}`;
      $('dealerGridView').style.display = 'none'; const dv = $('dealerDetailView'); dv.style.display = 'block';
      const recs = records.filter(r => r.dealer === name && r.indate && String(r.indate).startsWith(mp));
      const total = recs.reduce((s, r) => s + (r.amount || 0), 0);
      const doneRecs = recs.filter(isDone);
      const tblRows = recs.length ? recs.map((r, i) => `<div class="tbl-row" style="grid-template-columns:var(--cols)" data-rid="${r.id}">${rowCells(r, i)}</div>`).join('')
        : '<div class="empty-tbl"><div class="eicon">📋</div>내역 없음</div>';
      const mobRows = recs.map(r => `<div class="mob-card" data-rid="${r.id}">
    <div class="mc-top"><div class="mc-carnum">${esc(r.carnum)}</div><div class="mc-amt">${r.amount ? '₩' + r.amount.toLocaleString() : '-'}</div></div>
    <div class="mc-mid">${getBadge(r.status)}<span class="mc-dealer">🚗 ${esc([r.carmaker, r.carmodel].filter(Boolean).join(' ') || '-')}</span></div>
    <div class="mc-work">${esc(r.work) || '-'}</div></div>`).join('');
      dv.innerHTML = `<button class="back-btn" id="dealerBackBtn">← 목록</button>
    <div class="d-detail-header"><div><div class="ddh-name">${esc(name)}</div><div style="font-size:12px;color:var(--muted)">${y}년 ${m}월</div></div>
    <div class="ddh-stats"><div><div class="ddh-sv" style="color:var(--accent2)">₩${total.toLocaleString()}</div><div class="ddh-sl">총 견적</div></div>
    <div><div class="ddh-sv">${recs.length}</div><div class="ddh-sl">총 대수</div></div>
    <div><div class="ddh-sv" style="color:var(--s-done)">${doneRecs.length}</div><div class="ddh-sl">완료</div></div>
    <div><button class="btn-primary" data-invoice="${esc(name)}" data-iy="${y}" data-im="${m}">🧾 청구서</button></div></div></div>
    <div class="tbl-wrap"><div class="tbl-head" style="grid-template-columns:var(--cols)">
    <div class="th">#</div><div class="th">입고일</div><div class="th">차량번호</div><div class="th">차종</div><div class="th">작업내용</div><div class="th">딜러</div><div class="th">견적</div><div class="th">판</div><div class="th">상태</div></div><div>${tblRows}</div></div>
    <div class="mob-detail-cards">${mobRows}</div>`;
      dv.querySelector('#dealerBackBtn').onclick = closeDealerDetail;
      const invBtn = dv.querySelector('[data-invoice]'); if (invBtn) invBtn.onclick = () => openInvoice(name, y, m);
      dv.querySelectorAll('[data-rid]').forEach(el => { el.onclick = () => openModal(el.dataset.rid); });
    }

    // ══════════════════════════════════════
    // WEEKLY
    // ══════════════════════════════════════
    function getWeeksInMonth(year, month) {
      const weeks = [], first = new Date(year, month - 1, 1), last = new Date(year, month, 0);
      let s = new Date(first), wn = 1;
      while (s <= last) {
        const e = new Date(s); e.setDate(s.getDate() + 6); if (e > last) e.setTime(last.getTime());
        weeks.push({ weekNum: wn, start: new Date(s), end: new Date(e) }); s.setDate(s.getDate() + 7); wn++;
      }
      return weeks;
    }
    function renderWeekly() {
      const y = weeklyMonth.getFullYear(), m = weeklyMonth.getMonth() + 1;
      $('weeklyMonthLabel').textContent = `${y}년 ${m}월`;
      const weeks = getWeeksInMonth(y, m);
      $('weeklyTabs').innerHTML = weeks.map(w => {
        const s = `${w.start.getMonth() + 1}/${w.start.getDate()}`, e = `${w.end.getMonth() + 1}/${w.end.getDate()}`;
        return `<button class="week-tab${currentWeek === w.weekNum ? ' on' : ''}" data-week="${w.weekNum}">${w.weekNum}주차<br><span style="font-size:10px;font-weight:500">${s}~${e}</span></button>`;
      }).join('');
      const week = weeks.find(w => w.weekNum === currentWeek); if (!week) return;
      const weekRecs = records.filter(r => {
        if (!isDone(r)) return false;
        const ds = r.outdate; if (!ds) return false;
        const d = new Date(String(ds) + 'T12:00:00'); return d >= week.start && d <= week.end;
      });
      const allAmt = weekRecs.reduce((s, r) => s + (r.amount || 0), 0);
      const donePlates = weekRecs.reduce((s, r) => s + calcPlates(r), 0);
      const dayMap = {};
      weekRecs.forEach(r => { const d = r.outdate || ''; if (!dayMap[d]) dayMap[d] = []; dayMap[d].push(r); });
      const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
      const dayGroups = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, recs]) => {
        const dayName = DAYS[new Date(date + 'T12:00:00').getDay()];
        const dayAmt = recs.reduce((s, r) => s + (r.amount || 0), 0);
        const rows = recs.map((r, i) => `<div class="weekly-row" data-rid="${r.id}">${rowCells(r, i)}</div>`).join('');
        const mobRows = recs.map(r => `<div class="mob-card" data-rid="${r.id}" style="border-radius:0;border-left:0;border-right:0;border-top:0">
      <div class="mc-top"><div class="mc-carnum">${esc(r.carnum)}</div><div class="mc-amt">${r.amount ? '₩' + r.amount.toLocaleString() : '-'}</div></div>
      <div class="mc-mid"><span class="mc-dealer">👤 ${esc(r.dealer)}</span></div></div>`).join('');
        return `<div class="weekly-day-group"><div class="weekly-day-header"><div class="weekly-day-title">${date} (${dayName}) · ${recs.length}대</div>
      <div class="weekly-day-amount">₩${dayAmt.toLocaleString()}</div></div>
      <div class="weekly-day-rows"><div class="weekly-row" style="background:var(--surface2);cursor:default">
      <div class="th">#</div><div class="th">입고일</div><div class="th">차량번호</div><div class="th">차종</div><div class="th">작업내용</div><div class="th">딜러</div><div class="th">견적</div><div class="th">판</div><div class="th">상태</div></div>${rows}</div>
      <div class="weekly-mob-cards">${mobRows}</div></div>`;
      }).join('');
      $('weeklyContent').innerHTML = `<div class="weekly-summary">
    <div class="weekly-sum-item"><div class="weekly-sum-val" style="color:var(--s-done)">${weekRecs.length}</div><div class="weekly-sum-label">완료</div></div>
    <div class="weekly-sum-item"><div class="weekly-sum-val" style="color:var(--s-work)">${donePlates}</div><div class="weekly-sum-label">판수</div></div>
    <div class="weekly-sum-item"><div class="weekly-sum-val" style="color:var(--accent2)">₩${allAmt.toLocaleString()}</div><div class="weekly-sum-label">매출</div></div>
  </div>${dayGroups || '<div style="text-align:center;padding:40px;color:var(--muted2)"><div style="font-size:30px">📅</div><div style="margin-top:8px">이 주에 완료 내역이 없어요</div></div>'}`;
    }

    // ══════════════════════════════════════
    // INVOICE
    // ══════════════════════════════════════
    function openInvoice(dealerName, year, month) {
      const recs = records.filter(r => { if (r.dealer !== dealerName || !r.indate) return false; const d = new Date(r.indate + 'T12:00:00'); return d.getFullYear() === year && (d.getMonth() + 1) === month; });
      const today = new Date(); const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
      let rows = '', subtotal = 0;
      recs.forEach((r, i) => {
        const amt = r.amount || 0; subtotal += amt; const panels = r.selPanels ? Object.keys(r.selPanels).length : 0;
        rows += `<tr><td>${i + 1}</td><td>${r.indate || '-'}</td><td style="font-weight:700">${esc(r.carnum) || '-'}</td><td>${esc(r.carmodel) || '-'}</td><td>${TNAMES[r.carType] || '-'}</td><td>${panels}부위${r.parts?.length ? ` +${r.parts.length}부품` : ''}</td><td>${amt.toLocaleString()}원</td></tr>`;
      });
      if (!rows) rows = '<tr><td colspan="7" style="text-align:center;color:#bbb;padding:30px">내역 없음</td></tr>';
      const vat = Math.round(subtotal * 0.1), total = subtotal + vat;
      $('invContent').innerHTML = `<div class="inv-page"><div class="inv-top"><div><div class="inv-company">완성 정비소</div><div class="inv-title">청구서</div></div>
    <div class="inv-meta"><div><b>청구월</b> ${year}년 ${month}월</div><div><b>발행일</b> ${dateStr}</div><div><b>건수</b> ${recs.length}건</div></div></div>
    <div class="inv-to"><div><div class="inv-to-name">${esc(dealerName)} 귀중</div><div class="inv-to-sub">${year}년 ${month}월 청구서</div></div>
    <div class="inv-to-right"><div><b>합계</b></div><div style="font-size:20px;font-weight:900;color:#e25d00">${total.toLocaleString()}원</div><div style="font-size:11px;color:#bbb">(VAT 포함)</div></div></div>
    <table class="inv-table"><thead><tr><th style="width:30px">#</th><th style="width:90px">입고일</th><th style="width:100px">차량번호</th><th style="width:100px">차종</th><th style="width:80px">구분</th><th>작업</th><th style="width:100px">금액</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="inv-summary"><div class="inv-sum-row"><span>소계</span><span class="inv-sum-val">${subtotal.toLocaleString()}원</span></div>
    <div class="inv-sum-row"><span>VAT 10%</span><span class="inv-sum-val">${vat.toLocaleString()}원</span></div>
    <div class="inv-sum-row total"><span>합계</span><span class="inv-sum-val">${total.toLocaleString()}원</span></div></div>
    <div class="inv-footer">완성 정비소 발행</div></div>`;
      $('invArea').classList.add('show');
    }

    // ══════════════════════════════════════
    // CSV EXPORT
    // ══════════════════════════════════════
    function exportCSV() {
      const h = ['차량번호', '딜러', '차종', '작업내용', '입고일', '완료일', '견적금액', '상태', '메모'];
      const rows = records.map(r => [r.carnum, r.dealer, TNAMES[r.carType] || '', r.work || '', r.indate || '', r.outdate || '', r.amount || 0, r.status, r.memo || '']);
      const csv = '\uFEFF' + [h, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const now = new Date(); a.download = `정비내역_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`;
      a.click(); URL.revokeObjectURL(a.href); showToast('📥 CSV 저장');
    }

    // ══════════════════════════════════════
    // TOAST
    // ══════════════════════════════════════
    let toastTimer;
    function showToast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800); }

    // ══════════════════════════════════════
    // RENDER ALL
    // ══════════════════════════════════════
    // ══════════════════════════════════════
    // ANALYTICS
    // ══════════════════════════════════════
    function renderAnalytics() {
      const now = new Date(), curY = now.getFullYear(), curM = now.getMonth();

      // 최근 6개월 데이터 수집
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(curY, curM - i, 1);
        const y = d.getFullYear(), m = d.getMonth() + 1;
        const mp = `${y}-${String(m).padStart(2, '0')}`;
        const done = records.filter(r => isDone(r) && r.outdate && String(r.outdate).startsWith(mp));
        const rev = done.reduce((s, r) => s + (r.amount || 0), 0);
        const plates = done.reduce((s, r) => s + calcPlates(r), 0);
        months.push({ label: `${m}월`, mp, y, m, count: done.length, rev, plates });
      }
      const thisMonth = months[5], lastMonth = months[4];
      const revChange = lastMonth.rev ? Math.round((thisMonth.rev - lastMonth.rev) / lastMonth.rev * 100) : 0;
      const maxRev = Math.max(...months.map(m => m.rev), 1);

      // 월별 매출 바 차트
      const barColors = ['#d0cdc4', '#b0ada4', '#8b7cf6', '#6366f1', '#ef8c00', '#e25d00'];
      const barsHtml = months.map((m, i) => {
        const pct = Math.round(m.rev / maxRev * 100);
        const isThis = i === 5;
        return `<div class="ana-bar-row">
      <div class="ana-bar-label">${m.label}</div>
      <div class="ana-bar-track">
        <div class="ana-bar-fill" style="width:${pct}%;background:${isThis ? 'var(--accent2)' : barColors[i]}"></div>
        <div class="ana-bar-val${pct > 60 ? ' inside' : ''}">${m.rev ? '₩' + m.rev.toLocaleString() : '-'}</div>
      </div>
    </div>`;
      }).join('');

      // 딜러별 매출 (이달)
      const thisMP = months[5].mp;
      const dealerMap = {};
      records.forEach(r => {
        if (!isDone(r) || !r.outdate || !String(r.outdate).startsWith(thisMP) || !r.dealer) return;
        if (!dealerMap[r.dealer]) dealerMap[r.dealer] = { amt: 0, cnt: 0 };
        dealerMap[r.dealer].amt += (r.amount || 0);
        dealerMap[r.dealer].cnt++;
      });
      const dealerList = Object.entries(dealerMap).sort((a, b) => b[1].amt - a[1].amt).slice(0, 8);
      const dealerHtml = dealerList.length ? dealerList.map(([name, d], i) => `
    <div class="ana-dealer-row">
      <div class="ana-dealer-rank">${i + 1}</div>
      <div class="ana-dealer-name">${esc(name)}</div>
      <div class="ana-dealer-amt">₩${d.amt.toLocaleString()}</div>
      <div class="ana-dealer-cnt">${d.cnt}대</div>
    </div>`).join('') : '<div style="padding:20px;text-align:center;color:var(--muted)">이달 데이터 없음</div>';

      // 평균 작업 소요일
      const doneWithDates = records.filter(r => isDone(r) && r.indate && r.outdate);
      let totalDays = 0, dayCount = 0;
      doneWithDates.forEach(r => {
        const inD = new Date(r.indate + 'T00:00:00'), outD = new Date(r.outdate + 'T00:00:00');
        const diff = Math.round((outD - inD) / 86400000);
        if (diff >= 0 && diff < 100) { totalDays += diff; dayCount++; }
      });
      const avgDays = dayCount ? Math.round(totalDays / dayCount * 10) / 10 : '-';
      // 이달 평균
      const doneThisMonth = doneWithDates.filter(r => String(r.outdate).startsWith(thisMP));
      let tmDays = 0, tmCnt = 0;
      doneThisMonth.forEach(r => {
        const diff = Math.round((new Date(r.outdate + 'T00:00:00') - new Date(r.indate + 'T00:00:00')) / 86400000);
        if (diff >= 0 && diff < 100) { tmDays += diff; tmCnt++; }
      });
      const avgThisMonth = tmCnt ? Math.round(tmDays / tmCnt * 10) / 10 : '-';

      // 월별 처리 대수/판수 (이달)
      const thisCount = thisMonth.count, thisPlates = thisMonth.plates;
      const lastCount = lastMonth.count, lastPlates = lastMonth.plates;
      const cntChange = lastCount ? Math.round((thisCount - lastCount) / lastCount * 100) : 0;

      const changeTag = (val) => val > 0 ? `<span class="ana-change up">▲${val}%</span>` : val < 0 ? `<span class="ana-change down">▼${Math.abs(val)}%</span>` : '';

      $('analyticsContent').innerHTML = `
    <!-- 이달 요약 -->
    <div class="ana-month-summary">
      <div class="ana-ms-card"><div class="ana-ms-val" style="color:var(--accent2)">₩${thisMonth.rev.toLocaleString()}</div><div class="ana-ms-label">이달 매출 ${changeTag(revChange)}</div></div>
      <div class="ana-ms-card"><div class="ana-ms-val">${thisCount}<span style="font-size:13px;color:var(--muted)">대</span> / ${thisPlates}<span style="font-size:13px;color:var(--muted)">판</span></div><div class="ana-ms-label">이달 처리 ${changeTag(cntChange)}</div></div>
    </div>

    <div class="ana-grid">
      <!-- 월별 매출 추이 -->
      <div class="ana-card full">
        <div class="ana-title">📈 월별 매출 추이 (최근 6개월)</div>
        <div class="ana-bar-wrap">${barsHtml}</div>
      </div>

      <!-- 딜러별 매출 -->
      <div class="ana-card">
        <div class="ana-title">👥 딜러별 매출 (${thisMonth.m}월)</div>
        <div class="ana-dealer-list">${dealerHtml}</div>
      </div>

      <!-- 평균 작업 소요일 -->
      <div class="ana-card">
        <div class="ana-title">⏱ 평균 작업 소요일</div>
        <div class="ana-avg-box">
          <div class="ana-avg-num">${avgThisMonth}</div>
          <div class="ana-avg-unit">일 <span style="font-size:12px;color:var(--muted)">(이달)</span></div>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:8px">전체 평균: <strong style="color:var(--text)">${avgDays}일</strong> (${dayCount}건 기준)</div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">
          <div class="ana-title" style="margin-bottom:8px">📊 월별 처리량</div>
          ${months.map(m => `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span style="color:var(--muted)">${m.label}</span><span><strong>${m.count}</strong>대 / <strong>${m.plates}</strong>판</span></div>`).join('')}
        </div>
      </div>
    </div>`;
    }

    function renderAll() {
      renderStats(); renderTable();
      if ($('tab-weekly').style.display !== 'none') renderWeekly();
      if ($('tab-dealers').style.display !== 'none') renderDealers();
      if ($('tab-analytics').style.display !== 'none') renderAnalytics();
    }

    // ══════════════════════════════════════
    // TELEGRAM TAB
    // ══════════════════════════════════════
    function renderTelegramTab() {
      const container = $('tgContent'); if (!container) return;
      const pending = tgRequests.filter(r => r.status === 'pending');
      const handled = tgRequests.filter(r => r.status !== 'pending').slice(0, 10);

      const fmtTs = ts => {
        if (!ts) return '-';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      };

      const cardHtml = (req, showActions) => {
        const pickupRow = req.needPickup
          ? `<br><b>픽업</b> <span style="color:#2563eb;font-weight:600">📍 필요 · ${esc(req.pickupLocation || '장소 미입력')}</span>`
          : `<br><b>픽업</b> <span style="color:var(--muted)">🚶 직접 입고</span>`;
        return `<div class="tg-req-card" id="tgreq-${req.id}">
          <div class="tg-req-top">
            <div class="tg-req-dealer">👤 ${esc(req.dealerName)}</div>
            <div class="tg-req-time">${fmtTs(req.createdAt)}</div>
          </div>
          <div class="tg-req-type">📝 접수 요청</div>
          <div class="tg-req-body">
            <b>차량번호</b> ${esc(req.carnum || '-')}<br>
            <b>차종</b> ${esc(req.carmodel || '-')}<br>
            <b>작업내용</b> ${esc(req.work || '-')}
            ${pickupRow}
            ${req.memo ? `<br><b>메모</b> ${esc(req.memo)}` : ''}
          </div>
          ${showActions && req.status === 'pending' ? `
          <div class="tg-req-actions">
            <button class="btn-tg-approve" data-approve="${req.id}">✅ 승인 · 접수</button>
            <button class="btn-tg-reject" data-reject="${req.id}" data-chatid="${req.chatId}" data-carnum="${esc(req.carnum || '')}">✕ 거절</button>
          </div>` : `<div style="font-size:11px;color:var(--muted);margin-top:4px">${req.status === 'approved' ? '✅ 승인됨' : req.status === 'confirmed' ? '✅ 픽업 확인' : '❌ 거절됨'}</div>`}
        </div>`;
      };

      let html = '';

      if (!pending.length) {
        html += `<div class="tg-empty"><div style="font-size:36px">📭</div><div style="margin-top:8px;font-size:14px">새로운 요청이 없습니다</div></div>`;
      } else {
        html += `<div class="tg-section-title">대기 중 (${pending.length})</div>`;
        html += pending.map(r => cardHtml(r, true)).join('');
      }

      if (handled.length) {
        html += `<div class="tg-section-title" style="margin-top:24px">처리됨 (최근 10건)</div>`;
        html += handled.map(r => cardHtml(r, false)).join('');
      }

      // 딜러 Chat ID 관리 섹션
      const dealers = [...new Set(records.map(r => r.dealer).filter(Boolean))].sort();
      if (dealers.length) {
        html += `<div class="tg-section-title" style="margin-top:28px">딜러 텔레그램 연동</div>`;
        html += `<div style="font-size:12px;color:var(--muted);margin-bottom:10px">딜러가 봇에서 /start 입력 → Chat ID 확인 → 아래 등록</div>`;
        html += dealers.map(name => `
          <div class="dealer-chatid-row">
            <div class="dealer-chatid-name">${esc(name)}</div>
            <input class="dealer-chatid-input" id="chatid-${esc(name)}" type="text" placeholder="숫자 Chat ID" value="${esc(dealerChatIds[name] || '')}">
            <button class="dealer-chatid-save" data-save-dealer="${esc(name)}">저장</button>
          </div>`).join('');
      }

      container.innerHTML = html;

      // 이벤트: 승인 (접수 요청)
      container.querySelectorAll('[data-approve]').forEach(btn => {
        btn.onclick = () => approveTgRequest(btn.dataset.approve);
      });
      // 이벤트: 픽업 확인
      container.querySelectorAll('[data-confirm]').forEach(btn => {
        btn.onclick = () => confirmPickup(btn.dataset.confirm);
      });
      // 이벤트: 거절
      container.querySelectorAll('[data-reject]').forEach(btn => {
        btn.onclick = () => rejectTgRequest(btn.dataset.reject, btn.dataset.chatid, btn.dataset.carnum);
      });
      // 이벤트: 딜러 chatId 저장
      container.querySelectorAll('[data-save-dealer]').forEach(btn => {
        btn.onclick = async () => {
          const name = btn.dataset.saveDealer;
          const chatId = (document.getElementById(`chatid-${name}`)?.value || '').trim();
          await setDoc(doc(db, 'dealers', name), { name, chatId, updatedAt: Date.now() }, { merge: true });
          showToast(`✅ ${name} Chat ID 저장`);
        };
      });
    }

    async function approveTgRequest(reqId) {
      const req = tgRequests.find(r => r.id === reqId); if (!req) return;
      const today = new Date().toISOString().split('T')[0];
      const newRec = {
        id: Date.now().toString(),
        carnum: req.carnum || '',
        dealer: req.dealerName || '',
        work: req.work || '',
        memo: req.memo || '',
        carmaker: '', carmodel: req.carmodel || '', carType: 'domestic',
        selPanels: {}, parts: [], amount: 0,
        indate: today, status: '입고',
        createdAt: Date.now(),
        printed: false, printedAt: null,
        completedAt: null, outdate: ''
      };
      await saveToDb(newRec);
      await updateDoc(doc(db, 'telegramRequests', reqId), { status: 'approved' });
      try {
        await apiCall('/approve', { chatId: req.chatId, carnum: req.carnum, work: req.work });
      } catch (e) { console.warn('승인 메시지 발송 실패:', e); }
      showToast(`✅ ${req.carnum} 접수 승인 완료`);
    }

    async function confirmPickup(reqId) {
      const req = tgRequests.find(r => r.id === reqId); if (!req) return;
      await updateDoc(doc(db, 'telegramRequests', reqId), { status: 'confirmed' });
      showToast(`✅ 픽업 확인 처리됨`);
    }

    async function rejectTgRequest(reqId, chatId, carnum) {
      await updateDoc(doc(db, 'telegramRequests', reqId), { status: 'rejected' });
      try {
        await apiCall('/reject', { chatId, carnum, reason: '' });
      } catch (e) { console.warn('거절 메시지 발송 실패:', e); }
      showToast('❌ 요청 거절됨');
    }

    async function sendPickupNotification(recordId) {
      const rec = records.find(r => r.id === recordId); if (!rec) return;
      const chatId = dealerChatIds[rec.dealer];
      if (!chatId) { showToast('⚠️ 딜러 Chat ID 미등록'); return; }
      try {
        showToast('📱 전송 중...');
        await apiCall('/send-pickup', { chatId, carnum: rec.carnum, work: rec.work });
        showToast(`✅ ${rec.dealer}님께 픽업 알림 발송 완료`);
      } catch (e) {
        showToast('❌ 발송 실패: ' + (e.message || '오류'));
        console.error(e);
      }
    }

    // ══════════════════════════════════════
    // ══════════════════════════════════════
    // GEMINI + OPENAI API 설정
    // ══════════════════════════════════════
    const GEMINI_KEY_STORE = 'gemini_api_key_v1';
    const OPENAI_KEY_STORE = 'openai_api_key_v1';

    function getGeminiKey() { return localStorage.getItem(GEMINI_KEY_STORE) || ''; }
    function setGeminiKey(k) { localStorage.setItem(GEMINI_KEY_STORE, k.trim()); updateSettStatus(); }
    
    function getOpenAIKey() { return localStorage.getItem(OPENAI_KEY_STORE) || ''; }
    function setOpenAIKey(k) { localStorage.setItem(OPENAI_KEY_STORE, k.trim()); updateSettStatus(); }

    function updateSettStatus() {
      const gK = getGeminiKey();
      const oK = getOpenAIKey();
      const el = $('settStatus');
      if (!el) return;
      
      if (gK && oK) {
        el.textContent = '✅ Gemini & OpenAI 키 등록됨 — 모든 AI 기능 정상';
        el.className = 'sett-status has-key';
      } else if (gK) {
        el.textContent = '⚠️ OpenAI 키 없음 — 음성 인식 불가 (사진 인식만 가능)';
        el.className = 'sett-status no-key';
      } else {
        el.textContent = '⚠️ API 키 없음 — 등록 후 AI 인식 사용 가능';
        el.className = 'sett-status no-key';
      }
    }

    function openSett() {
      $('settApiKeyInput').value = getGeminiKey();
      const openaiInput = $('settOpenAiKeyInput');
      if(openaiInput) openaiInput.value = getOpenAIKey();
      updateSettStatus();
      $('settWrap').classList.add('open');
    }
    function closeSett() { $('settWrap').classList.remove('open'); }

    // ── 국산/외제 및 펄 색 자동 판별 ──
    function determineCarType(maker, isPearl) {
      if (!maker) return null;
      const m = maker.replace(/\s/g, '').toLowerCase();
      
      const domesticMakers = [
        '현대', 'hyundai', '제네시스', 'genesis', '기아', 'kia',
        '쌍용', 'ssangyong', 'kgm', 'kg모빌리티',
        '르노', 'renault', '삼성', 'samsung',
        '쉐보레', 'chevrolet', '대우', 'daewoo'
      ];
      
      const isDomestic = domesticMakers.some(dm => m.includes(dm));
      
      if (isDomestic) {
        return isPearl ? 'pearl' : 'domestic';
      } else {
        return 'foreign';
      }
    }

    function setAiStatus(msg, cls = '') {
      const el = $('aiStatus'); if (!el) return;
      el.textContent = msg; el.className = 'ai-status' + (cls ? ' ' + cls : '');
    }

    async function runVehicleAI(file) {
      console.log('[AI] 분석 시작: ', file.name);
      const key = getGeminiKey();
      if (!key) { console.warn('[AI] API 키 없음'); openSett(); return; }

      // 미리보기 세팅
      const preview = $('aiPreview');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';

      const btn = $('aiRecogBtn');
      btn.disabled = true;
      setAiStatus('🔍 AI 분석 중...', 'loading');

      try {
        // base64 변환
        const b64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = () => rej(new Error('파일 읽기 실패'));
          r.readAsDataURL(file);
        });

        const prompt = `이 자동차 사진에서 다음 정보를 추출해줘. 반드시 아래 JSON 형식으로만 응답해 (다른 텍스트 없이):
{
  "plate": "번호판 (예: 12가 3456, 인식불가면 빈문자열)",
  "maker": "제조사 (예: 현대, 기아, BMW, 벤츠, 아우디 등, 모르면 빈문자열)",
  "model": "차종/모델명 (예: 쏘렌토, 아반떼, E클래스, 없으면 빈문자열)",
  "color": "색상 (예: 흰색, 검정색, 은색 등)",
  "is_pearl": "색상이 '펄'이 들어간 색상인 것 같으면 true, 아니면 false (예: 화이트펄이면 true)"
}
번호판이 여러 개면 가장 잘 보이는 것 하나만. 제조사와 차종은 차량 외형으로 추측해도 됨.`;

        console.log('[AI] 프롬프트 전송 중...');
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } },
                  { text: prompt }
                ]
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
            })
          }
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const msg = err?.error?.message || `HTTP ${resp.status}`;
          console.error('[AI] Fetch Error:', msg, err);
          throw new Error(msg);
        }

        const data = await resp.json();
        console.log('[AI] Raw response:', data);

        // thinking model (gemini-2.5-flash)은 thought:true 인 part를 반환하므로 필터링
        const allParts = data?.candidates?.[0]?.content?.parts || [];
        const textParts = allParts.filter(p => p.text && !p.thought);
        let raw = textParts.map(p => p.text).join('\n');
        
        // thought parts밖에 없는 경우 fallback
        if (!raw.trim()) {
          console.log('[AI] No direct text parts, falling back to all parts');
          raw = allParts.map(p => p.text || '').join('\n');
        }
        
        console.log('[AI] Extracted text from response:', raw);

        // JSON 추출: ```json 코드블록 우선, 없으면 중괄호 블록
        let jsonStr = '';
        const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
          console.log('[AI] Extracted JSON from code block');
        } else {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
            console.log('[AI] Extracted JSON from curly braces');
          }
        }
        
        console.log('[AI] Final JSON string for parsing:', jsonStr);

        if (!jsonStr) throw new Error('AI 응답에서 JSON을 찾을 수 없음\n응답: ' + raw.slice(0, 200));
        
        let parsed;
        try { 
          parsed = JSON.parse(jsonStr); 
          console.log('[AI] Parsed JSON:', parsed);
        } catch (e) { 
          console.error('[AI] JSON Parse Fail:', e);
          throw new Error('AI 응답 파싱 실패: ' + jsonStr.slice(0, 80)); 
        }

        let filled = [];
        if (parsed.plate) {
          $('f-carnum').value = parsed.plate.replace(/\s/g, '').replace(/(.{2})(.+)(.{4})/, '$1$2 $3');
          filled.push('번호판');
          const badge = $('carnumAiBadge'); if (badge) badge.style.display = 'inline';
        }
        if (parsed.maker) { $('f-carmaker').value = parsed.maker; filled.push('제조사'); }
        if (parsed.model) { $('f-carmodel').value = parsed.model; filled.push('차종'); }

        // 자동 차종 선택 (국산/외제/펄)
        const autoType = determineCarType(parsed.maker, parsed.is_pearl);
        if (autoType) {
            setCarType(autoType);
            filled.push(`구분(${TNAMES[autoType]})`);
        }

        if (filled.length > 0) {
          console.log('[AI] Success:', filled.join(', '));
          setAiStatus('✅ ' + filled.join(' · ') + ' 인식 완료', 'ok');
        } else {
          console.warn('[AI] No info detected');
          setAiStatus('⚠️ 인식된 정보 없음 — 직접 입력해주세요', 'err');
        }
      } catch (e) {
        console.error('[AI] Error:', e);
        let msg = e.message || '알 수 없는 오류';
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) msg = 'API 키가 유효하지 않아요. 설정에서 다시 확인해주세요.';
        else if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) msg = 'API 할당량 초과. 잠시 후 다시 시도해주세요.';
        setAiStatus('❌ ' + msg, 'err');
      } finally {
        btn.disabled = false;
      }
    }

    // ══════════════════════════════════════
    // GEMINI AI 음성 파싱 (Speech to Text -> LLM)
    // ══════════════════════════════════════
    let recognition = null;

    async function parseVoiceWithGemini(transcript) {
      console.log('[AI Voice] 분석 시작: ', transcript);
      const key = getGeminiKey();
      if (!key) { console.warn('[AI] API 키 없음'); openSett(); return; }

      const btn = $('aiMicBtn');
      btn.disabled = true;
      setAiStatus('🤖 텍스트 분석 중...', 'loading');

      try {
        const prompt = `다음은 자동차 정비소 직원의 음성 기록이야. 여기서 접수하려는 '딜러(고객) 이름'과 '작업할 부위(패널)들'을 뽑아줘.

음성: "${transcript}"

반드시 아래 JSON 형식으로만 응답해 (다른 텍스트 없이):
{
  "dealer": "추출한 딜러명 (홍길동, 다나카, 상사 이름 등. 없으면 빈문자열)",
  "work": "작업 내용 (간단히 요약. 예: 앞범퍼 판금도색, 문짝 교환 등. 없으면 빈문자열)",
  "panels": ["front_bumper", "door_fl", "... 해당하는 패널 ID 배열"],
  "maker": "언급된 차량 제조사 혹은 브랜드 (예: 현대, BMW 등. 없으면 빈문자열)",
  "model": "추출된 구체적인 차종/모델명 (예: 쏘렌토, 5시리즈 등. 없으면 빈문자열)",
  "is_pearl": "말투나 맥락상 '펄' 색상이거나 '진주색' 등이 언급되면 true, 아니면 false"
}

[참고할 패널 ID 목록과 한글 매핑]
front_bumper: 앞 범퍼
rear_bumper: 뒤 범퍼
fender_fl: 앞 펜더(휀다) 좌측(운전석)
fender_fr: 앞 펜더 우측(조수석)
fender_rl: 뒷(뒤) 펜더 좌측
fender_rr: 뒷 펜더 우측
door_fl: 앞 도어(문) 좌측
door_fr: 앞 도어 우측
door_rl: 뒤 도어 좌측
door_rr: 뒤 도어 우측
hood: 후드(본넷)
trunk: 트렁크
roof: 지붕
step_l: 사이드스텝 좌측
step_r: 사이드스텝 우측
pil_al: A필러 좌측
pil_ar: A필러 우측
pil_bl: B필러 좌측
pil_br: B필러 우측

해당되는 패널이 없으면 빈 배열 []`;

        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
            })
          }
        );

        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        
        const allParts = data?.candidates?.[0]?.content?.parts || [];
        const textParts = allParts.filter(p => p.text && !p.thought);
        let raw = textParts.map(p => p.text).join('\n');
        if (!raw.trim()) raw = allParts.map(p => p.text || '').join('\n');

        let jsonStr = '';
        const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
        if (codeBlockMatch) {
          jsonStr = codeBlockMatch[1].trim();
        } else {
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) jsonStr = jsonMatch[0];
        }

        if (!jsonStr) throw new Error('AI 응답에서 JSON 파싱 불가');
        
        let parsed;
        try {
          // Remove unescaped newlines within strings that might cause parsing errors
          const sanitizedJson = jsonStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r')
              // fix cases where the LLM might have output actual newlines between JSON boundaries
              .replace(/\\n\s*}/g, '\n}')
              .replace(/{\s*\\n/g, '{\n')
              .replace(/,\s*\\n/g, ',\n')
              .replace(/\\n\s*"/g, '\n"')
              .replace(/"\s*\\n/g, '"\n')
              .replace(/\\n\s*]/g, '\n]')
              .replace(/\[\s*\\n/g, '[\n');
              
          parsed = JSON.parse(sanitizedJson);
        } catch(e) {
          console.error("JSON 파싱 에러, 원본:", jsonStr);
          throw new Error('AI 응답 객체 변환 실패 (단어에 특수문자)');
        }
        
        let filled = [];

        if (parsed.dealer) { 
          $('f-dealer').value = parsed.dealer; 
          filled.push('👤딜러'); 
        }
        
        if (parsed.work) { 
          $('f-work').value = parsed.work; 
          filled.push('📝작업내용'); 
        }
        
        // 자동 차종 선택 및 필드 입력
        if (parsed.maker) {
          $('f-carmaker').value = parsed.maker;
          filled.push('🏭제조사');
          
          const autoType = determineCarType(parsed.maker, parsed.is_pearl);
          if (autoType) {
            setCarType(autoType);
            filled.push(`💰${TNAMES[autoType]}`);
          }
        }
        
        if (parsed.model) {
          $('f-carmodel').value = parsed.model;
          filled.push('🚗차종');
        }
        
        if (Array.isArray(parsed.panels) && parsed.panels.length > 0) {
          if (!window.selPanels) window.selPanels = {};
          parsed.panels.forEach(pid => {
            if (PANELS.find(p => p.id === pid)) {
              if (!selPanels[pid]) selPanels[pid] = {};
              selPanels[pid].panel = true; // Auto select panel
            }
          });
          
          if (typeof renderPanels === 'function') renderPanels();
          if (typeof updateQuote === 'function') updateQuote();
          filled.push('🚗패널');
        }

        if (filled.length > 0) {
          setAiStatus('✅ 인식 완료 (' + filled.join(', ') + ')', 'ok');
          showToast('음성 인식으로 자동 입력되었습니다.');
        } else {
          setAiStatus('⚠️ 인식된 정보가 없습니다.', 'err');
        }

      } catch (e) {
        setAiStatus('❌ ' + e.message, 'err');
      } finally {
        btn.disabled = false;
        $('aiMicIcon').textContent = '🎙️';
        btn.innerHTML = '<span class="ai-icon" id="aiMicIcon">🎙️</span> 음성으로 입력 (딜러, 작업내용)';
      }
    }

    // ══════════════════════════════════════
    // OPENAI WHISPER API 음성 녹음 및 텍스트 변환
    // ══════════════════════════════════════
    let mediaRecorder = null;
    let audioChunks = [];

    async function toggleSpeechRecognition() {
      const btn = $('aiMicBtn');
      const openaiKey = getOpenAIKey();
      
      if (!openaiKey) {
        showToast('⚠️ 설정에서 OpenAI API 키를 먼저 등록해주세요.');
        openSett();
        return;
      }

      // 이미 녹음 중이면 종료 후 Whisper로 전송
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          // 마이크 스트림 완전 종료
          stream.getTracks().forEach(t => t.stop());
          
          if (audioChunks.length === 0) {
            resetMicButton();
            setAiStatus('녹음된 소리가 없습니다.', '');
            return;
          }

          btn.innerHTML = '<span class="ai-icon" id="aiMicIcon">⏳</span> Whisper 변환 중...';
          setAiStatus('🤖 음성을 텍스트로 변환하는 중...', 'loading');
          
          try {
            // Safari 등 iOS 기기를 위해 실제 녹음된 mimeType을 확인하고,
            // 확장자를 m4a 혹은 webm으로 유연하게 넘겨주도록 수정
            const mimeType = mediaRecorder.mimeType || 'audio/mp4'; 
            const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
            
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const formData = new FormData();
            
            // Whisper는 확장자를 매우 중요하게 여김 (mp4, m4a, mp3, webm 등 지원)
            formData.append('file', audioBlob, `record.${ext}`);
            formData.append('model', 'whisper-1');
            formData.append('language', 'ko'); // 한국어 명시

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${openaiKey}`
              },
              body: formData
            });

            if (!response.ok) {
              const errData = await response.json();
              throw new Error(errData.error?.message || 'Whisper API 실패');
            }

            const data = await response.json();
            const transcript = data.text;
            
            console.log('[WHISPER] 결과:', transcript);
            
            if (!transcript.trim()) {
              setAiStatus('⚠️ 인식된 음성이 없습니다.', 'err');
              resetMicButton();
              return;
            }

            // 변환된 텍스트를 Gemini로 넘겨서 패널 파싱
            btn.innerHTML = '<span class="ai-icon" id="aiMicIcon">⏳</span> 내용 파싱 중...';
            setAiStatus(`💬 "${transcript.slice(0,15)}..." 파싱 중`, 'loading');
            parseVoiceWithGemini(transcript);

          } catch (error) {
            console.error('[STT Error]', error);
            setAiStatus('❌ 음성 변환 실패: ' + error.message, 'err');
            resetMicButton();
          }
        };

        // 녹음 시작
        mediaRecorder.start();
        btn.innerHTML = '<span class="ai-icon" id="aiMicIcon">⏹️</span> 녹음 중... (완료 시 탭)';
        btn.style.opacity = '1';
        btn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)'; // Red for recording
        setAiStatus('🎤 말씀해주세요. (주변 소음 주의)', 'loading');

      } catch (err) {
        console.error('마이크 권한 오류:', err);
        showToast('⚠️ 마이크 권한을 허용해야 합니다.');
        resetMicButton();
      }
      
      function resetMicButton() {
          btn.style.opacity = '1';
          btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          btn.innerHTML = '<span class="ai-icon" id="aiMicIcon">🎙️</span> 음성으로 입력 (딜러, 작업내용)';
      }
    }

    // ══════════════════════════════════════
    // EVENT LISTENERS
    // ══════════════════════════════════════
    $('sidebarOverlay').onclick = toggleSidebar;
    $('mobMenuBtn').onclick = toggleSidebar;
    $$('.sb-item').forEach(el => { if (el.dataset.tab) el.onclick = () => showTab(el.dataset.tab); });
    $('btnExport').onclick = exportCSV;
    $('btnNew').onclick = () => openModal();
    $('filterBar').onclick = e => { const btn = e.target.closest('.fbtn'); if (btn && btn.dataset.filter) setFilter(btn.dataset.filter); };
    $('searchInput').oninput = renderTable;

    // Table delegation
    $('tableBody').onclick = e => {
      const adv = e.target.closest('[data-adv]'); if (adv) { advance(adv.dataset.adv, e); return; }
      const pickup = e.target.closest('[data-pickup]'); if (pickup) { e.stopPropagation(); sendPickupNotification(pickup.dataset.pickup); return; }
      const row = e.target.closest('[data-rid]'); if (row) openModal(row.dataset.rid);
    };
    $('mobCards').onclick = e => {
      const adv = e.target.closest('[data-adv]'); if (adv) { advance(adv.dataset.adv, e); return; }
      const pickup = e.target.closest('[data-pickup]'); if (pickup) { e.stopPropagation(); sendPickupNotification(pickup.dataset.pickup); return; }
      const card = e.target.closest('[data-rid]'); if (card) openModal(card.dataset.rid);
    };

    // Modal
    $('modalCloseBtn').onclick = closeModal;
    $('overlay').onclick = e => { if (e.target === $('overlay')) closeModal(); };
    $('modalTabs').onclick = e => { const btn = e.target.closest('.modal-tab'); if (btn) setModalTab(btn.dataset.mtab); };
    $('statusSteps').onclick = e => { const btn = e.target.closest('.ss'); if (btn) { modalStatus = btn.dataset.st; updateStatusUI(); } };
    $('btnDel').onclick = deleteRec;
    $('btnPrint').onclick = printWorkOrder;
    $('btnCancel').onclick = closeModal;
    $('btnSave').onclick = saveRec;

    // AI 인식
    $('aiRecogBtn').onclick = () => $('aiFileInput').click();
    $('aiCamBtn').onclick = () => $('aiFileInput').click();
    $('aiGalBtn').onclick = () => $('aiGalleryInput').click();

    $('aiFileInput').onchange = e => { const f = e.target.files?.[0]; if (f) runVehicleAI(f); e.target.value = ''; };
    $('aiGalleryInput').onchange = e => { const f = e.target.files?.[0]; if (f) runVehicleAI(f); e.target.value = ''; };

    // AI 음성 스크립트
    $('aiMicBtn').onclick = toggleSpeechRecognition;

    // 설정
    $('openSettBtn').onclick = openSett;
    $('settCloseBtn').onclick = closeSett;
    $('settWrap').onclick = e => { if (e.target === $('settWrap')) closeSett(); };
    $('settSaveBtn').onclick = () => {
      const gK = $('settApiKeyInput').value.trim();
      const oK = $('settOpenAiKeyInput').value.trim();
      
      setGeminiKey(gK);
      setOpenAIKey(oK);
      
      if (!gK && !oK) {
        showToast('⚠️ API 키를 하나라도 입력해주세요.');
      } else {
        showToast('✅ API 키가 저장되었습니다.');
        closeSett();
      }
    };

    // 초기 상태 업데이트
    updateSettStatus();

    // 텔레그램 봇 토큰 저장
    $('settTgSaveBtn').onclick = async () => {
      const token = ($('settTgTokenInput').value || '').trim();
      if (!token) { showToast('⚠️ 토큰을 입력해주세요'); return; }
      try {
        await setDoc(doc(db, 'settings', 'telegram'), { botToken: token }, { merge: true });
        showToast('✅ 텔레그램 봇 토큰 저장 완료');
        $('settTgStatus').textContent = '✅ 토큰 저장됨. Webhook 등록 버튼을 눌러주세요.';
        $('settTgStatus').style.color = 'var(--s-done)';
      } catch (e) { showToast('❌ 저장 실패: ' + e.message); }
    };

    // Webhook 등록
    $('settTgWebhookBtn').onclick = async () => {
      $('settTgStatus').textContent = '🔗 Webhook 등록 중...';
      try {
        const result = await apiCall('/register-webhook', {});
        if (result.ok) {
          $('settTgStatus').textContent = '✅ Webhook 등록 완료! 이제 봇이 메시지를 받습니다.';
          $('settTgStatus').style.color = 'var(--s-done)';
          showToast('✅ Webhook 등록 성공');
        } else {
          $('settTgStatus').textContent = '❌ ' + (result.description || result.error || '등록 실패. 토큰을 먼저 저장해주세요.');
          $('settTgStatus').style.color = 'var(--danger)';
        }
      } catch (e) {
        $('settTgStatus').textContent = '❌ 오류: ' + (e.message || '함수 배포를 확인해주세요');
        $('settTgStatus').style.color = 'var(--danger)';
      }
    };

    // 설정 열릴 때 토큰 상태 확인
    async function loadTgTokenStatus() {
      try {
        const snap = await getDocs(query(collection(db, 'settings')));
        const tgDoc = snap.docs.find(d => d.id === 'telegram');
        if (tgDoc?.data()?.botToken) {
          $('settTgStatus').textContent = '✅ 봇 토큰 등록됨';
          $('settTgStatus').style.color = 'var(--s-done)';
        }
      } catch (e) { /* 무시 */ }
    }

    // openSett 함수 래핑으로 토큰 상태 로드
    const _origOpenSett = openSett;
    openSett = function() { _origOpenSett(); loadTgTokenStatus(); };

    $('addPartBtn').onclick = () => { parts.push({ name: '', labor: '', cost: '' }); renderParts(); };
    $('typeRow').onclick = e => { const btn = e.target.closest('.tybtn'); if (btn) setCarType(btn.dataset.t); };

    // Enter → next field
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.classList.contains('modal-field')) {
        e.preventDefault(); const next = e.target.dataset.next; if (next) $(next)?.focus();
      }
    });

    // Dealer nav
    $('dealerPrev').onclick = () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1); renderDealers(); };
    $('dealerNext').onclick = () => { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1); renderDealers(); };
    $('dealerCards').onclick = e => { const c = e.target.closest('.d-card'); if (c) openDealerDetail(c.dataset.dealer); };

    // Weekly nav
    $('weeklyPrev').onclick = () => { weeklyMonth.setMonth(weeklyMonth.getMonth() - 1); currentWeek = 1; renderWeekly(); };
    $('weeklyNext').onclick = () => { weeklyMonth.setMonth(weeklyMonth.getMonth() + 1); currentWeek = 1; renderWeekly(); };
    $('weeklyTabs').onclick = e => { const btn = e.target.closest('.week-tab'); if (btn) { currentWeek = parseInt(btn.dataset.week); renderWeekly(); } };
    $('weeklyContent').onclick = e => { const row = e.target.closest('[data-rid]'); if (row) openModal(row.dataset.rid); };

    // Invoice
    $('invCloseBtn').onclick = () => $('invArea').classList.remove('show');
    $('invPrintBtn').onclick = () => { 
        showToast('🖨️ 인쇄 준비 중...'); 
        setTimeout(() => window.print(), 350); 
    };

    // ESC + Back button
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if ($('invArea').classList.contains('show')) $('invArea').classList.remove('show');
        else if ($('overlay').classList.contains('open')) closeModal();
      }
    });
    window.addEventListener('popstate', () => { if ($('overlay').classList.contains('open')) closeModal(); });

    // ══════════════════════════════════════
    // INIT
    // ══════════════════════════════════════
    (function () {
      const now = new Date(), days = ['일', '월', '화', '수', '목', '금', '토'];
      $('topDate').textContent = ` · ${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${days[now.getDay()]}`;
      $('monthLabel').textContent = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
      renderPanels();
    })();
