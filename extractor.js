// --- START OF FILE extractor.js ---
javascript:(function() {
    'use strict';
    console.clear();
    console.log("🚀 QU Schedule Extractor v38 (Path: /Test/) Initialized...");

    // UPDATED: The URL of your viewer (index.html)
    const VIEWER_URL = "https://mutlaq001.github.io/Test/"; 
    const TEMP_STORAGE_KEY = 'temp_qu_schedule_data_v2';

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
            const cell = row.querySelector(`td[data-th*="${th}"]`);
            return cell ? cell.textContent.trim() : '';
        };

        rows.forEach(row => {
            const code = getVal(row, 'رمز المقرر');
            const name = getVal(row, 'اسم المقرر');
            const section = getVal(row, 'الشعبة');

            if (name && code && section) {
                if (lastTheoreticalCourse && code !== lastTheoreticalCourse.code) {
                    lastTheoreticalCourse = null;
                }

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

                if (!isPractical) {
                    lastTheoreticalCourse = { code: courseInfo.code, hours: courseInfo.hours, examPeriodId: examPeriodId };
                }
            }
        });
        return coursesData;
    }

    // Main execution block
    setTimeout(() => {
        const courseRows = document.querySelectorAll('tr.ROW1, tr.ROW2');
        
        if (courseRows.length === 0) {
            alert("فشل استخراج البيانات.\n\nلم يتم العثور على أي مقررات.\n\nتأكد من أنك في صفحة 'المقررات المطروحة' بعد أن تقوم بالبحث.");
            return;
        }

        const courses = extractCourses(courseRows);

        if (courses && courses.length > 0) {
            sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(courses));
            const viewerWindow = window.open(VIEWER_URL, 'QU_Schedule_Viewer');

            if (!viewerWindow || viewerWindow.closed || typeof viewerWindow.closed === 'undefined') {
                alert("فشل فتح نافذة العارض.\n\nالرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع والمحاولة مرة أخرى.");
                sessionStorage.removeItem(TEMP_STORAGE_KEY);
                return;
            }

            const messageHandler = (event) => {
                if (event.source === viewerWindow && event.data === 'request_schedule_data') {
                    const storedData = sessionStorage.getItem(TEMP_STORAGE_KEY);
                    if (storedData) {
                        viewerWindow.postMessage({ type: 'universityCoursesData', data: JSON.parse(storedData) }, new URL(VIEWER_URL).origin);
                        sessionStorage.removeItem(TEMP_STORAGE_KEY);
                        window.removeEventListener('message', messageHandler);
                    }
                }
            };
            window.addEventListener('message', messageHandler, false);
        } else {
            alert("فشل استخراج البيانات. لم يتم العثور على بيانات يمكن قراءتها في الجدول.");
        }
    }, 1000);
})();
// --- END OF FILE extractor.js ---
