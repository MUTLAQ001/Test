javascript: (function () {
    'use strict';
    const VIEWER_URL = "https://mutlaq001.github.io/Test/";
    const VIEWER_ORIGIN = new URL(VIEWER_URL).origin;
    const PANEL_ID = 'qu-extractor-panel';

    if (document.getElementById(PANEL_ID)) { document.getElementById(PANEL_ID).remove(); }

    function parseTimeDetails(detailsRaw) {
        if (!detailsRaw || detailsRaw.trim() === '') return { timeText: 'غير محدد', location: 'غير محدد' };
        let loc = 'غير محدد';
        if (detailsRaw.includes('@r')) {
            const locMatch = detailsRaw.match(/@r(.*?)(?:@n|@t|$)/);
            if (locMatch && locMatch[1] && locMatch[1].trim() !== '') loc = locMatch[1].trim();
        }
        if (detailsRaw.includes('@t')) {
            const dayMap = { '1': 'الأحد', '2': 'الاثنين', '3': 'الثلاثاء', '4': 'الأربعاء', '5': 'الخميس', '6': 'الجمعة', '7': 'السبت' };
            const timeParts = detailsRaw.split(/@n\s*/).map(part => {
                const segments = part.split('@t');
                if (segments.length < 2) return null;
                const days = segments[0].trim().split(/\s+/).map(d => dayMap[d] || d).join(' ');
                const timeStr = segments[1].replace(/@r.*$/, '').trim();
                return `${days}: ${timeStr}`;
            }).filter(Boolean);
            const timeText = timeParts.length > 0 ? timeParts.join('<br>') : 'غير محدد';
            return { timeText, location: loc };
        }
        return { timeText: 'غير محدد', location: loc };
    }

    function extractCourses(rows) {
        const coursesData = [];
        let lastTheoreticalCourse = null;
        const getVal = (row, th) => {
            let cell = row.querySelector(`td[data-th=" ${th} "]`) || row.querySelector(`td[data-th="${th}"]`) || row.querySelector(`td[data-th*="${th}"]`);
            return cell ? cell.textContent.trim() : '';
        };
        rows.forEach(row => {
            const code = getVal(row, 'رمز المقرر');
            const name = getVal(row, 'اسم المقرر');
            const section = getVal(row, 'الشعبة');
            if (name && code && section) {
                if (lastTheoreticalCourse && code !== lastTheoreticalCourse.code) { lastTheoreticalCourse = null; }
                let hours = getVal(row, 'الساعات');
                let type = getVal(row, 'النشاط');
                const status = getVal(row, 'الحالة');
                const campus = getVal(row, 'المقر');
                const instructor = row.querySelector('input[type="hidden"][id$=":instructor"]')?.value.trim();
                const detailsRaw = row.querySelector('input[type="hidden"][id$=":section"]')?.value.trim();
                let examPeriodId = row.querySelector('input[type="hidden"][id$=":examPeriod"]')?.value.trim();
                const isPractical = type && (type.includes('عملي') || type.includes('تدريب') || type.includes('تمارين'));
                if (isPractical && (!hours || hours.trim() === '0' || hours.trim() === '') && lastTheoreticalCourse && lastTheoreticalCourse.code === code) {
                    hours = lastTheoreticalCourse.hours;
                    examPeriodId = lastTheoreticalCourse.examPeriodId;
                }
                const timeDetails = parseTimeDetails(detailsRaw);
                const courseInfo = { code, name, section, time: timeDetails.timeText, location: timeDetails.location, instructor: instructor || 'غير محدد', examPeriodId: examPeriodId || null, hours: hours || '0', type: type || 'نظري', status: status || 'غير معروف', campus: campus || 'غير معروف' };
                coursesData.push(courseInfo);
                if (!isPractical) { lastTheoreticalCourse = { code: courseInfo.code, hours: courseInfo.hours, examPeriodId: examPeriodId }; }
            }
        });
        return coursesData;
    }

    function buildPanel() {
        const wrap = document.createElement('div');
        wrap.id = PANEL_ID;
        wrap.innerHTML = `
<style>
#${PANEL_ID}{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(5,5,10,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);direction:rtl;font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:16px;box-sizing:border-box;}
#${PANEL_ID} *{box-sizing:border-box;}
#${PANEL_ID} .qx-card{background:#15131f;color:#e9e7f2;border:1px solid rgba(190,175,250,.16);border-radius:22px;box-shadow:0 24px 60px -20px rgba(0,0,0,.7);width:100%;max-width:460px;max-height:88dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:22px;text-align:center;}
#${PANEL_ID} .qx-title{font-size:1.15rem;font-weight:700;color:#fff;margin:0 0 6px;}
#${PANEL_ID} .qx-sub{font-size:.9rem;color:#a9a4c0;margin:0 0 18px;line-height:1.7;}
#${PANEL_ID} .qx-count{display:inline-block;background:rgba(139,92,246,.16);border:1px solid rgba(139,92,246,.4);color:#c4b5fd;border-radius:999px;padding:5px 14px;font-weight:700;font-size:.85rem;margin-bottom:16px;}
#${PANEL_ID} button{-webkit-appearance:none;appearance:none;width:100%;padding:.85rem 1rem;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-family:inherit;font-weight:700;font-size:.95rem;cursor:pointer;transition:transform .15s ease,opacity .15s ease;background:rgba(255,255,255,.06);color:#e9e7f2;margin-bottom:10px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
#${PANEL_ID} button.qx-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);border-color:transparent;color:#fff;}
#${PANEL_ID} button:active{transform:scale(.98);}
#${PANEL_ID} button.qx-ghost{background:transparent;color:#a9a4c0;border-color:transparent;margin-bottom:0;}
#${PANEL_ID} textarea{width:100%;min-height:120px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0e0d16;color:#cfcbe4;font-family:ui-monospace,Menlo,monospace;font-size:12px;padding:10px;margin-bottom:10px;resize:vertical;direction:ltr;text-align:left;}
#${PANEL_ID} .qx-steps{text-align:right;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.14);border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:.85rem;color:#c8c4dc;line-height:1.9;}
#${PANEL_ID} .qx-hidden{display:none;}
</style>
<div class="qx-card">
  <div class="qx-count" id="qx-count"></div>
  <h3 class="qx-title" id="qx-title">تم استخراج المقررات</h3>
  <p class="qx-sub" id="qx-sub">اضغط لفتح الجدول ونقل البيانات تلقائياً.</p>
  <div id="qx-main">
    <button class="qx-primary" id="qx-open">فتح QU Schedule</button>
    <button id="qx-manual">نسخ البيانات يدوياً</button>
  </div>
  <div id="qx-fallback" class="qx-hidden">
    <div class="qx-steps">
      <div>١ — اضغط "نسخ البيانات".</div>
      <div>٢ — افتح موقع QU Schedule.</div>
      <div>٣ — الإعدادات ← استيراد باللصق ← الصق.</div>
    </div>
    <textarea id="qx-json" readonly></textarea>
    <button class="qx-primary" id="qx-copy">نسخ البيانات</button>
    <button id="qx-goto">فتح QU Schedule</button>
  </div>
  <button class="qx-ghost" id="qx-close">إغلاق</button>
</div>`;
        document.body.appendChild(wrap);
        return wrap;
    }

    function showFallback(panel, json) {
        panel.querySelector('#qx-main').classList.add('qx-hidden');
        panel.querySelector('#qx-fallback').classList.remove('qx-hidden');
        panel.querySelector('#qx-title').textContent = 'انقل البيانات يدوياً';
        panel.querySelector('#qx-sub').textContent = 'المتصفح منع النافذة المنبثقة. استخدم النسخ واللصق بدلاً منها.';
        panel.querySelector('#qx-json').value = json;
    }

    function copyText(text, btn) {
        const done = () => { const old = btn.textContent; btn.textContent = 'تم النسخ ✓'; setTimeout(() => { btn.textContent = old; }, 1800); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => legacyCopy(text, done));
        } else { legacyCopy(text, done); }
    }

    function legacyCopy(text, done) {
        const ta = document.getElementById('qx-json');
        if (!ta) return;
        ta.removeAttribute('readonly');
        ta.focus();
        ta.setSelectionRange(0, text.length);
        try { document.execCommand('copy'); done(); } catch (e) { }
        ta.setAttribute('readonly', 'readonly');
    }

    function waitForRows(attempt) {
        const rows = document.querySelectorAll('tr.ROW1, tr.ROW2');
        if (rows.length > 0) { start(rows); return; }
        if (attempt >= 20) {
            alert("فشل استخراج البيانات.\n\nلم يتم العثور على أي مقررات.\n\nتأكد من أنك في صفحة 'المقررات المطروحة' بعد أن تقوم بالبحث.");
            return;
        }
        setTimeout(() => waitForRows(attempt + 1), 300);
    }

    function start(rows) {
        const courses = extractCourses(rows);
        if (!courses || courses.length === 0) {
            alert("فشل استخراج البيانات. لم يتم العثور على بيانات يمكن قراءتها في الجدول.");
            return;
        }
        const json = JSON.stringify(courses);
        const panel = buildPanel();
        panel.querySelector('#qx-count').textContent = `${courses.length} شعبة`;

        let viewerWindow = null;
        let handshakeTimer = null;

        const messageHandler = (event) => {
            if (event.origin !== VIEWER_ORIGIN) return;
            if (event.data === 'request_schedule_data') {
                const target = viewerWindow || event.source;
                if (!target) return;
                target.postMessage({ type: 'universityCoursesData', data: courses }, VIEWER_ORIGIN);
                if (handshakeTimer) { clearTimeout(handshakeTimer); handshakeTimer = null; }
                window.removeEventListener('message', messageHandler);
                panel.remove();
            }
        };
        window.addEventListener('message', messageHandler, false);

        const openViewer = () => {
            viewerWindow = window.open(VIEWER_URL, 'QU_Schedule_Viewer');
            if (!viewerWindow || viewerWindow.closed || typeof viewerWindow.closed === 'undefined') {
                showFallback(panel, json);
                return;
            }
            panel.querySelector('#qx-sub').textContent = 'جاري إرسال البيانات... لا تغلق هذه الصفحة.';
            handshakeTimer = setTimeout(() => { showFallback(panel, json); }, 12000);
        };

        panel.querySelector('#qx-open').addEventListener('click', openViewer);
        panel.querySelector('#qx-goto').addEventListener('click', openViewer);
        panel.querySelector('#qx-manual').addEventListener('click', () => showFallback(panel, json));
        panel.querySelector('#qx-copy').addEventListener('click', (e) => copyText(json, e.currentTarget));
        panel.querySelector('#qx-close').addEventListener('click', () => {
            if (handshakeTimer) clearTimeout(handshakeTimer);
            window.removeEventListener('message', messageHandler);
            panel.remove();
        });
    }

    waitForRows(0);
})();
