document.addEventListener('DOMContentLoaded', () => {
    if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) && window.innerWidth < 1024) {
        document.body.classList.add('mobile-view');
        return;
    }

    const QU_ScheduleApp = {
        state: {
            calendar: null,
            allCoursesData: [],
            groupedCourses: {},
            selectedSections: new Set(),
            hiddenCourseCodes: new Set(),
            customColors: {},
            userSettings: {
                theme: 'dark',
                accentColor: '#8b5cf6',
                showWeekends: false,
                minTime: '08:00:00',
                maxTime: '22:00:00',
                hiddenCourseCodes: []
            }
        },
        constants: {
            PRESET_COLORS: {
                purple: '#8b5cf6',
                blue: '#3b82f6',
                pink: '#ec4899',
                green: '#22c55e',
                orange: '#f97316'
            },
            COLOR_PALETTE: ['#8b5cf6', '#3b82f6', '#ec4899', '#22c55e', '#f97316', '#ef4444', '#06b6d4', '#d946ef'],
            DAY_MAPPING: {
                'الأحد': 0,
                'الاثنين': 1,
                'الثلاثاء': 2,
                'الأربعاء': 3,
                'الخميس': 4,
                'الجمعة': 5,
                'السبت': 6
            },
            STORAGE_KEYS: {
                SETTINGS: 'quScheduleSettings_v15',
                COURSES: 'quScheduleCourses_v15',
                SELECTED: 'quScheduleSelected_v15',
                COLORS: 'quScheduleColors_v15'
            }
        },
        dom: {},

        init() {
            this._populateDOMElements();
            this._setupEventListeners();
            this._loadSettings();
            this._loadCustomColors();
            this._initializeCalendar();
            this._loadDataFromStorage();
            this._listenForDataFromOpener();
            this._updateBookmarkletCode();
        },

        _loadDataFromStorage() {
            const storedCourses = localStorage.getItem(this.constants.STORAGE_KEYS.COURSES);
            if (storedCourses) {
                try {
                    const courses = JSON.parse(storedCourses);
                    this._processAndDisplayData(courses);
                    this._loadSelectedSections();
                    this.updateCalendarAndConflicts();
                } catch (e) {
                    localStorage.removeItem(this.constants.STORAGE_KEYS.COURSES);
                    this.dom.installSection.style.display = 'block';
                }
            } else {
                this.dom.installSection.style.display = 'block';
            }
        },
        _listenForDataFromOpener() {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'universityCoursesData') {
                    const courses = event.data.data;
                    localStorage.setItem(this.constants.STORAGE_KEYS.COURSES, JSON.stringify(courses));
                    this.state.selectedSections.clear();
                    localStorage.removeItem(this.constants.STORAGE_KEYS.SELECTED);
                    this._processAndDisplayData(courses);
                    this.updateCalendarAndConflicts();
                }
            }, false);
            if (window.opener) {
                window.opener.postMessage('request_schedule_data', '*');
            }
        },
        _processAndDisplayData(courses) {
            this.dom.installSection.style.display = 'none';
            this.state.allCoursesData = courses.map((section, index) => ({
                ...section,
                uniqueId: `${section.code}-${section.section}-${index}`,
                timeSlots: this._parseTimeEntries(section.time)
            }));
            this.state.groupedCourses = this.state.allCoursesData.reduce((acc, course) => {
                if (!acc[course.code])
                    acc[course.code] = {
                        name: course.name,
                        code: course.code,
                        sections: []
                    };
                acc[course.code].sections.push(course);
                return acc;
            }, {});
            let colorIndex = 0;
            Object.values(this.state.groupedCourses).forEach(group => {
                group.color = this.state.customColors[group.code] || this.constants.COLOR_PALETTE[colorIndex++ % this.constants.COLOR_PALETTE.length];
            });
            document.getElementById('no-data-message').style.display = 'none';
            this._renderCoursesList();
            this._buildSettingsModal();
        },
        _loadSelectedSections() {
            const stored = localStorage.getItem(this.constants.STORAGE_KEYS.SELECTED);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed))
                        this.state.selectedSections = new Set(parsed);
                } catch (e) {
                    localStorage.removeItem(this.constants.STORAGE_KEYS.SELECTED);
                }
            }
        },
        _loadCustomColors() {
            const stored = localStorage.getItem(this.constants.STORAGE_KEYS.COLORS);
            if (stored) {
                try {
                    this.state.customColors = JSON.parse(stored);
                } catch (e) {
                    localStorage.removeItem(this.constants.STORAGE_KEYS.COLORS);
                }
            }
        },
        _saveCustomColors() {
            localStorage.setItem(this.constants.STORAGE_KEYS.COLORS, JSON.stringify(this.state.customColors));
        },
        updateCalendarAndConflicts() {
            if (!this.state.calendar)
                return;
            this.state.calendar.removeAllEvents();
            const selectedCourseDetails = Array.from(this.state.selectedSections).map(id => this.state.allCoursesData.find(c => c.uniqueId === id)).filter(Boolean);
            const conflictMap = this._calculateConflicts(selectedCourseDetails);
            selectedCourseDetails.forEach(section => {
                const group = this.state.groupedCourses[section.code];
                if (group && !this.state.hiddenCourseCodes.has(section.code)) {
                    const lectureEvents = this._createLectureEventsForSection(section, false, group.color);
                    this.state.calendar.addEventSource(lectureEvents);
                }
            });
            this._renderFinalExams(selectedCourseDetails);
            this._renderMyScheduleSummary(selectedCourseDetails, conflictMap);
            this._updateAvailableSectionsUI(selectedCourseDetails);
            localStorage.setItem(this.constants.STORAGE_KEYS.SELECTED, JSON.stringify(Array.from(this.state.selectedSections)));
        },
        _renderCoursesList() {
            const coursesListContainer = this.dom.coursesList;
            coursesListContainer.innerHTML = '';
            const visibleCourses = Object.values(this.state.groupedCourses).filter(g => !this.state.hiddenCourseCodes.has(g.code));
            if (Object.keys(this.state.groupedCourses).length > 0 && visibleCourses.length === 0) {
                coursesListContainer.innerHTML = `<div class="no-data"><i class="ri-eye-off-line"></i><h4>لا توجد مقررات ظاهرة</h4><p>يمكنك إظهار المقررات من الإعدادات.</p></div>`;
                return;
            }
            visibleCourses.sort((a, b) => a.code.localeCompare(b.code)).forEach((group, i) => {
                const courseItem = document.createElement('div');
                courseItem.className = 'course-item';
                courseItem.style.animationDelay = `${i * 50}ms`;
                const sectionsHTML = group.sections.map(section => {
                    const isNoTime = section.time === 'غير محدد';
                    return `<div class="section-btn ${this.state.selectedSections.has(section.uniqueId) ? 'selected' : ''} ${isNoTime ? 'no-time' : ''}" data-unique-id="${section.uniqueId}" style="${isNoTime ? '--item-color:' + group.color : ''}"><div class="section-btn-number">${section.section}</div><div class="section-type">${section.type || ''}</div></div>`;
                }).join('');
                courseItem.innerHTML = `<div class="course-item-header"><span class="color-dot" style="background-color: ${group.color};"></span><div class="course-info"><h3>${group.name} (${group.code})</h3><p>${group.sections.length} شعب متاحة</p></div><i class="ri-arrow-down-s-line toggle-icon"></i></div><div class="sections-wrapper"><div class="sections-grid">${sectionsHTML}</div></div>`;
                coursesListContainer.appendChild(courseItem);
            });
        },
        _renderMyScheduleSummary(selectedCourses, conflictMap) {
            const container = this.dom.myScheduleContainer;
            if (selectedCourses.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'flex';
            this.dom.conflictBanner.style.display = conflictMap.size > 0 ? 'flex' : 'none';
            const tableContainer = this.dom.myScheduleTableContainer;
            tableContainer.innerHTML = '';
            const table = document.createElement('table');
            table.className = 'my-schedule-table';
            table.innerHTML = `<thead><tr><th>المقرر</th><th>الشعبة</th><th>المحاضر</th><th>المواعيد</th><th>الحالة</th><th>فترة الاختبار</th><th>المكان</th><th>الساعات</th></tr></thead>`;
            const tbody = document.createElement('tbody');
            let totalCredits = 0;
            const uniqueCourseCodes = new Set();
            selectedCourses.sort((a, b) => a.code.localeCompare(b.code)).forEach(course => {
                if (!uniqueCourseCodes.has(course.code)) {
                    totalCredits += parseInt(course.hours, 10) || 0;
                    uniqueCourseCodes.add(course.code);
                }
                const examText = course.examPeriodId || "لا يوجد";
                const statusClass = course.status.includes('مفتوحة') ? 'open' : 'closed';
                const conflictMessages = conflictMap.get(course.uniqueId);
                const isConflicted = !!conflictMessages;
                const row = document.createElement('tr');
                if (isConflicted)
                    row.classList.add('has-conflict');
                row.innerHTML = `<td class="course-cell"><div class="course-code">${isConflicted ? `<i class="ri-alert-fill conflict-icon" title="${conflictMessages.join('\n')}"></i>` : ''} ${course.code}</div><div class="course-name">${course.name}</div></td><td class="section-cell"><div class="section-number">${course.section}</div><div class="section-type">${course.type}</div></td><td>${course.instructor}</td><td>${course.time.replace(/<br>/g, ' ')}</td><td><span class="status-badge status-${statusClass}">${course.status}</span></td><td>${examText}</td><td>${course.location}</td><td><div class="hours-value">${course.hours}</div></td>`;
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            tableContainer.appendChild(table);
            this.dom.totalCreditsSummary.innerHTML = `إجمالي الساعات: <span>${totalCredits}</span>`;
        },
        _renderFinalExams(selectedCourses) {
            this.dom.examsList.innerHTML = '';
            const uniqueExams = [...new Map(selectedCourses.map(e => e.examPeriodId ? [e.examPeriodId, e] : [e.uniqueId, e])).values()];
            const validExams = uniqueExams.filter(e => e.examPeriodId);
            if (validExams.length === 0) {
                this.dom.examsList.innerHTML = `<div class="no-data"><i class="ri-file-text-line"></i><h4>لا توجد اختبارات</h4><p>لم يتم تحديد اختبارات نهائية للمقررات المختارة.</p></div>`;
                return;
            }
            validExams.sort((a, b) => parseInt(a.examPeriodId, 10) - parseInt(b.examPeriodId, 10)).forEach((exam) => {
                const examItem = document.createElement('div');
                examItem.className = 'course-item';
                examItem.innerHTML = `<div class="course-item-header" style="cursor:default;"><div class="course-info"><h3>${exam.name} (${exam.code})</h3><p><strong>فترة الاختبار: ${exam.examPeriodId}</strong></p></div></div>`;
                this.dom.examsList.appendChild(examItem);
            });
        },
        _updateAvailableSectionsUI(selectedCourses) {
            this.state.allCoursesData.forEach(section => {
                const btn = document.querySelector(`.section-btn[data-unique-id='${section.uniqueId}']`);
                if (btn) {
                    btn.classList.remove('conflicted');
                    if (!this.state.selectedSections.has(section.uniqueId)) {
                        btn.classList.toggle('conflicted', this._isSectionConflicted(section, selectedCourses));
                    }
                }
            });
        },
        _populateDOMElements() {
            const ids = ['courses-list', 'exams-list', 'my-schedule-container', 'my-schedule-summary', 'my-schedule-table-container', 'total-credits-summary', 'calendar', 'clear-calendar-btn', 'sidebar', 'settings-btn', 'settings-modal', 'modal-overlay', 'install-section', 'no-data-message', 'conflict-banner'];
            ids.forEach(id => {
                this.dom[id.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
            });
            this.dom.tabButtons = document.querySelectorAll('.tab-btn');
            this.dom.tabContents = document.querySelectorAll('.tab-content');
        },
        _calculateConflicts(selectedCourses) {
            const conflictMap = new Map();
            for (let i = 0; i < selectedCourses.length; i++) {
                for (let j = i + 1; j < selectedCourses.length; j++) {
                    const cA = selectedCourses[i],
                        cB = selectedCourses[j];
                    if (cA.code === cB.code)
                        continue;
                    const msgA = conflictMap.get(cA.uniqueId) || [],
                        msgB = conflictMap.get(cB.uniqueId) || [];
                    if (cA.timeSlots.some(sA => cB.timeSlots.some(sB => sA.day === sB.day && sA.start < sB.end && sA.end > sB.start))) {
                        msgA.push(`تعارض وقت محاضرة مع ${cB.name} (${cB.code})`);
                        msgB.push(`تعارض وقت محاضرة مع ${cA.name} (${cA.code})`);
                    }
                    if (cA.examPeriodId && cB.examPeriodId && cA.examPeriodId === cB.examPeriodId) {
                        msgA.push(`تعارض اختبار نهائي مع ${cB.name} (${cB.code})`);
                        msgB.push(`تعارض اختبار نهائي مع ${cA.name} (${cA.code})`);
                    }
                    if (msgA.length > 0)
                        conflictMap.set(cA.uniqueId, msgA);
                    if (msgB.length > 0)
                        conflictMap.set(cB.uniqueId, msgB);
                }
            }
            return conflictMap;
        },
        _isSectionConflicted(section, selectedCourses) {
            return selectedCourses.some(sel => {
                if (section.code === sel.code)
                    return false;
                const lectureConflict = section.timeSlots.some(sA => sel.timeSlots.some(sB => sA.day === sB.day && sA.start < sB.end && sA.end > sB.start));
                const examConflict = section.examPeriodId && sel.examPeriodId && section.examPeriodId === sel.examPeriodId;
                return lectureConflict || examConflict;
            });
        },
        _createLectureEventsForSection(section, isPreview, color) {
            const sourceId = isPreview ? 'preview-source' : undefined;
            return {
                id: sourceId,
                events: section.timeSlots.map(slot => ({
                    title: `${section.name}`,
                    daysOfWeek: [slot.day],
                    startTime: slot.start,
                    endTime: slot.end,
                    backgroundColor: isPreview ? 'transparent' : color,
                    borderColor: isPreview ? color : this._adjustColorBrightness(color, -20),
                    classNames: isPreview ? ['preview-event'] : [],
                    extendedProps: { ...section
                    },
                    display: 'block'
                }))
            };
        },
        _parseTimeEntries(timeString) {
            if (!timeString || typeof timeString !== 'string' || timeString === 'غير محدد')
                return [];
            return timeString.split('<br>').map(entry => {
                const parts = entry.match(/([\u0621-\u064A\s]+):\s*(\d{1,2}:\d{2})\s*(ص|م)\s*-\s*(\d{1,2}:\d{2})\s*(ص|م)/);
                if (!parts)
                    return null;
                const days = parts[1].trim().split(/\s+/);
                const start = this._convertTo24Hour(parts[2], parts[3]);
                const end = this._convertTo24Hour(parts[4], parts[5]);
                return days.map(day => this.constants.DAY_MAPPING[day] !== undefined ? {
                    day: this.constants.DAY_MAPPING[day],
                    start,
                    end
                } : null);
            }).flat().filter(Boolean);
        },
        _convertTo24Hour(time, period) {
            let [h, m] = time.split(':');
            h = parseInt(h, 10);
            if (period.includes('م') && h !== 12)
                h += 12;
            if (period.includes('ص') && h === 12)
                h = 0;
            return `${String(h).padStart(2, '0')}:${m}:00`;
        },
        _setupEventListeners() {
            this.dom.clearCalendarBtn.addEventListener('click', () => this._handleClearCalendar());
            this.dom.settingsBtn.addEventListener('click', () => this._toggleSettingsModal(true));
            this.dom.modalOverlay.addEventListener('click', () => this._toggleSettingsModal(false));
            this.dom.tabButtons.forEach(button => button.addEventListener('click', () => this._handleTabClick(button)));
            this.dom.coursesList.addEventListener('click', e => this._handleCourseListClick(e));
            this.dom.coursesList.addEventListener('mouseover', e => this._handleSectionHover(e, true));
            this.dom.coursesList.addEventListener('mouseout', e => this._handleSectionHover(e, false));
        },
        _handleSectionHover(event, isHovering) {
            const sectionBtn = event.target.closest('.section-btn');
            if (!sectionBtn)
                return;
            if (isHovering) {
                const uniqueId = sectionBtn.dataset.uniqueId;
                const section = this.state.allCoursesData.find(c => c.uniqueId === uniqueId);
                if (section)
                    this._showPreviewEvent(section);
            } else {
                this._removePreviewEvent();
            }
        },
        _showPreviewEvent(section) {
            this._removePreviewEvent();
            const group = this.state.groupedCourses[section.code];
            if (!group)
                return;
            const previewEventSource = this._createLectureEventsForSection(section, true, group.color);
            this.state.calendar.addEventSource(previewEventSource);
        },
        _removePreviewEvent() {
            const existingSource = this.state.calendar.getEventSourceById('preview-source');
            if (existingSource)
                existingSource.remove();
        },
        _handleCourseListClick(e) {
            const sectionBtn = e.target.closest('.section-btn');
            const header = e.target.closest('.course-item-header');
            if (sectionBtn) {
                const uniqueId = sectionBtn.dataset.uniqueId;
                sectionBtn.classList.toggle('selected');
                if (this.state.selectedSections.has(uniqueId)) {
                    this.state.selectedSections.delete(uniqueId);
                } else {
                    this.state.selectedSections.add(uniqueId);
                }
                this.updateCalendarAndConflicts();
            } else if (header) {
                header.parentElement.classList.toggle('open');
            }
        },
        _handleClearCalendar() {
            Swal.fire({
                title: 'هل أنت متأكد؟',
                text: "سيتم مسح جميع المواد المختارة من الجدول.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'نعم، امسح الجدول!',
                cancelButtonText: 'إلغاء',
                customClass: {
                    popup: 'swal-popup-animation-in'
                },
                showClass: {
                    popup: ''
                },
                hideClass: {
                    popup: 'swal-popup-animation-out'
                },
            }).then((result) => {
                if (result.isConfirmed) {
                    this.state.selectedSections.clear();
                    this.updateCalendarAndConflicts();
                    document.querySelectorAll('.section-btn.selected').forEach(b => b.classList.remove('selected'));
                    Swal.fire({
                        toast: true,
                        position: 'bottom',
                        icon: 'success',
                        title: 'تم مسح الجدول بنجاح',
                        showConfirmButton: false,
                        timer: 2000
                    });
                }
            });
        },
        _handleTabClick(button) {
            this.dom.tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            this.dom.tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(button.dataset.tab).classList.add('active');
        },
        _updateBookmarkletCode() {
            const extractorFunctionString = `(function() { 'use strict'; const VIEWER_URL = "https://mutlaq001.github.io/Test/"; const TEMP_STORAGE_KEY = 'temp_qu_schedule_data'; function parseTimeDetails(detailsRaw) { if (!detailsRaw || detailsRaw.trim() === '') return { timeText: 'غير محدد', location: 'غير محدد' }; let loc = 'غير محدد'; if (detailsRaw.includes('@r')) { const locMatch = detailsRaw.match(/@r(.*?)(?:@n|@t|$)/); if (locMatch && locMatch[1] && locMatch[1].trim() !== '') loc = locMatch[1].trim(); } if (detailsRaw.includes('@t')) { const dayMap = { '1': 'الأحد', '2': 'الاثنين', '3': 'الثلاثاء', '4': 'الأربعاء', '5': 'الخميس', '6': 'الجمعة', '7': 'السبت' }; const timeParts = detailsRaw.split(/@n\\s*/).map(part => { const segments = part.split('@t'); if (segments.length < 2) return null; const days = segments[0].trim().split(/\\s+/).map(d => dayMap[d] || d).join(' '); const timeStr = segments[1].replace(/@r.*$/, '').trim(); return \`\${days}: \${timeStr}\`; }).filter(Boolean); const timeText = timeParts.length > 0 ? timeParts.join('<br>') : 'غير محدد'; return { timeText, location: loc }; } return { timeText: 'غير محدد', location: loc }; } function extractCourses(rows) { const coursesData = []; let lastTheoreticalCourse = null; const getVal = (row, th) => { let cell = row.querySelector(\`td[data-th=" \${th} "]\`) || row.querySelector(\`td[data-th="\${th}"]\`) || row.querySelector(\`td[data-th*="\${th}"]\`); return cell ? cell.textContent.trim() : ''; }; rows.forEach(row => { const code = getVal(row, 'رمز المقرر'); const name = getVal(row, 'اسم المقرر'); const section = getVal(row, 'الشعبة'); if (name && code && section) { if (lastTheoreticalCourse && code !== lastTheoreticalCourse.code) { lastTheoreticalCourse = null; } let hours = getVal(row, 'الساعات'); let type = getVal(row, 'النشاط'); const status = getVal(row, 'الحالة'); const campus = getVal(row, 'المقر'); const instructor = row.querySelector('input[type="hidden"][id$=":instructor"]')?.value.trim(); const detailsRaw = row.querySelector('input[type="hidden"][id$=":section"]')?.value.trim(); let examPeriodId = row.querySelector('input[type="hidden"][id$=":examPeriod"]')?.value.trim(); const isPractical = type && (type.includes('عملي') || type.includes('تدريب') || type.includes('تمارين')); if (isPractical && (!hours || hours.trim() === '0' || hours.trim() === '') && lastTheoreticalCourse && lastTheoreticalCourse.code === code) { hours = lastTheoreticalCourse.hours; examPeriodId = lastTheoreticalCourse.examPeriodId; } const timeDetails = parseTimeDetails(detailsRaw); const courseInfo = { code, name, section, time: timeDetails.timeText, location: timeDetails.location, instructor: instructor || 'غير محدد', examPeriodId: examPeriodId || null, hours: hours || '0', type: type || 'نظري', status: status || 'غير معروف', campus: campus || 'غير معروف' }; coursesData.push(courseInfo); if (!isPractical) { lastTheoreticalCourse = { code: courseInfo.code, hours: courseInfo.hours, examPeriodId: examPeriodId }; } } }); return coursesData; } setTimeout(() => { const courseRows = document.querySelectorAll('tr.ROW1, tr.ROW2'); if (courseRows.length === 0) { alert("فشل استخراج البيانات.\\n\\nلم يتم العثور على أي مقررات.\\n\\nتأكد من أنك في صفحة 'المقررات المطروحة' بعد أن تقوم بالبحث."); return; } const courses = extractCourses(courseRows); if (courses && courses.length > 0) { sessionStorage.setItem(TEMP_STORAGE_KEY, JSON.stringify(courses)); const viewerWindow = window.open(VIEWER_URL, 'QU_Schedule_Viewer'); if (!viewerWindow || viewerWindow.closed || typeof viewerWindow.closed === 'undefined') { alert("فشل فتح نافذة العارض.\\n\\nالرجاء السماح بالنوافذ المنبثقة (Pop-ups) لهذا الموقع والمحاولة مرة أخرى."); sessionStorage.removeItem(TEMP_STORAGE_KEY); return; } const messageHandler = (event) => { if (event.source === viewerWindow && event.data === 'request_schedule_data') { const storedData = sessionStorage.getItem(TEMP_STORAGE_KEY); if (storedData) { viewerWindow.postMessage({ type: 'universityCoursesData', data: JSON.parse(storedData) }, new URL(VIEWER_URL).origin); sessionStorage.removeItem(TEMP_STORAGE_KEY); window.removeEventListener('message', messageHandler); } } }; window.addEventListener('message', messageHandler, false); } else { alert("فشل استخراج البيانات. لم يتم العثور على بيانات يمكن قراءتها في الجدول."); } }, 1000); })();`;
            const bookmarkletHref = `javascript:${extractorFunctionString}`;
            
            document.getElementById('install-section').innerHTML = `<h3>طريقة التثبيت</h3><p>اسحب هذا الزر إلى شريط الإشارات المرجعية:</p><a class="bookmarklet-button" href="${bookmarkletHref}" onclick="Swal.fire({title:'خطأ!', text:'لا تضغط على الزر، بل قم بسحبه إلى شريط الإشارات المرجعية في متصفحك.', icon:'error'}); return false;">QU Schedule</a>`;
        },
        _initializeCalendar() {
            if (this.state.calendar)
                this.state.calendar.destroy();
            const calendarOptions = {
                initialView: 'timeGridWeek',
                locale: 'ar',
                headerToolbar: false,
                allDaySlot: false,
                events: [],
                dir: 'rtl',
                dayHeaderFormat: {
                    weekday: 'long'
                },
                slotMinTime: this.state.userSettings.minTime,
                slotMaxTime: this.state.userSettings.maxTime,
                hiddenDays: this.state.userSettings.showWeekends ? [] : [5, 6],
                nowIndicator: false,
                dayCellDidMount: (arg) => {
                    if (arg.isToday)
                        arg.el.style.backgroundColor = 'transparent';
                },
                eventContent: (arg) => {
                    const props = arg.event.extendedProps;
                    const wrapper = document.createElement('div');
                    wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden; font-size: 0.8rem; line-height: 1.4;';
                    wrapper.innerHTML = `<b style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-title); font-weight: 400;">${arg.event.title.split('(')[0].trim()}</b><small>${props.section} - ${props.instructor}</small><small style="margin-top: auto;"><i class="ri-map-pin-line"></i> ${props.location}</small>`;
                    return {
                        domNodes: [wrapper]
                    };
                },
                windowResize: () => {
                    this.state.calendar.updateSize();
                }
            };
            this.state.calendar = new FullCalendar.Calendar(this.dom.calendar, calendarOptions);
            this.state.calendar.render();
        },
        _adjustColorBrightness(hex, p) {
            let r = parseInt(hex.slice(1, 3), 16),
                g = parseInt(hex.slice(3, 5), 16),
                b = parseInt(hex.slice(5, 7), 16);
            p /= 100;
            r = Math.round(Math.min(255, Math.max(0, r * (1 + p))));
            g = Math.round(Math.min(255, Math.max(0, g * (1 + p))));
            b = Math.round(Math.min(255, Math.max(0, b * (1 + p))));
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        },
        _hexToRgb(hex) {
            let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '139, 92, 246';
        },
        _hexToHue(H) {
            if (!H)
                return 257;
            let r = 0,
                g = 0,
                b = 0;
            if (H.length == 7) {
                r = "0x" + H[1] + H[2];
                g = "0x" + H[3] + H[4];
                b = "0x" + H[5] + H[6];
            }
            r /= 255;
            g /= 255;
            b /= 255;
            let cmin = Math.min(r, g, b),
                cmax = Math.max(r, g, b),
                delta = cmax - cmin,
                h = 0;
            if (delta == 0)
                h = 0;
            else if (cmax == r)
                h = ((g - b) / delta) % 6;
            else if (cmax == g)
                h = (b - r) / delta + 2;
            else
                h = (r - g) / delta + 4;
            h = Math.round(h * 60);
            if (h < 0)
                h += 360;
            return h;
        },
        _loadSettings() {
            const saved = localStorage.getItem(this.constants.STORAGE_KEYS.SETTINGS);
            if (saved) {
                try {
                    this.state.userSettings = { ...this.state.userSettings,
                        ...JSON.parse(saved)
                    };
                    this.state.hiddenCourseCodes = new Set(this.state.userSettings.hiddenCourseCodes || []);
                } catch (e) {}
            }
            this._applySettings();
        },
        _saveSettings() {
            this.state.userSettings.hiddenCourseCodes = Array.from(this.state.hiddenCourseCodes);
            localStorage.setItem(this.constants.STORAGE_KEYS.SETTINGS, JSON.stringify(this.state.userSettings));
        },
        _buildSettingsModal() {
            const modal = this.dom.settingsModal;
            let courseColorsHTML = Object.values(this.state.groupedCourses).sort((a, b) => a.code.localeCompare(b.code)).map(group => `<div class="settings-item"><div class="settings-item-label"><span style="color: ${group.color}; font-weight: 600;">${group.name} (${group.code})</span></div><label class="color-picker-label" style="background-color: ${group.color};"><input type="color" class="color-picker-input" data-course-code="${group.code}" value="${group.color}"></label></div>`).join('');
            if (!courseColorsHTML)
                courseColorsHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">لم يتم تحميل بيانات المقررات بعد.</p>';
            let courseVisibilityHTML = Object.values(this.state.groupedCourses).sort((a, b) => a.code.localeCompare(b.code)).map(group => {
                const isHidden = this.state.hiddenCourseCodes.has(group.code);
                const rgb = this._hexToRgb(group.color);
                return `<button class="course-visibility-btn ${isHidden ? 'hidden' : 'visible'}" data-course-code="${group.code}" style="--item-color: ${group.color}; --item-color-rgb: ${rgb};"><span class="color-dot"></span>${group.code}</button>`;
            }).join('');
            if (!courseVisibilityHTML)
                courseVisibilityHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">لم يتم تحميل بيانات المقررات بعد.</p>';
            modal.innerHTML = ` <div class="modal-header"><h3><i class="ri-settings-3-line"></i> الإعدادات</h3><i class="ri-close-line modal-close-btn" id="close-modal-btn"></i></div> <div class="modal-content custom-scrollbar"> <div class="settings-group"><h4 class="settings-group-title"><i class="ri-palette-line"></i>المظهر</h4><div class="settings-item"><div class="settings-item-label"><span>الوضع</span></div><div class="mode-toggle"></div></div><div class="settings-item"><div class="settings-item-label"><span>اللون الأساسي</span></div><div class="theme-picker" id="accent-color-picker"></div></div></div> <div class="settings-group"><h4 class="settings-group-title"><i class="ri-eye-off-line"></i>التحكم في ظهور المقررات</h4><div id="course-visibility-list" class="course-visibility-grid">${courseVisibilityHTML}</div></div> <div class="settings-group"><h4 class="settings-group-title"><i class="ri-paint-brush-line"></i>ألوان المقررات</h4><div id="course-colors-list">${courseColorsHTML}</div></div> <div class="settings-group"><h4 class="settings-group-title"><i class="ri-calendar-2-line"></i>عرض التقويم</h4><div class="settings-item"><div class="settings-item-label"><span>إظهار عطلة نهاية الأسبوع</span><small>لعرض يومي الجمعة والسبت</small></div><label class="toggle-switch"><input type="checkbox" id="show-weekend-toggle"><span class="slider"></span></label></div><div class="settings-item"><div class="settings-item-label"><span>نطاق الساعات</span></div><div class="time-range-selects"><div id="min-time-select-container"></div><div id="max-time-select-container"></div></div></div></div> <div class="settings-group"><h4 class="settings-group-title"><i class="ri-database-2-line"></i>إدارة البيانات والطباعة</h4><div class="data-management-zone"><button class="data-btn" id="print-btn"><i class="ri-printer-line"></i>طباعة الجدول</button><button class="data-btn" id="export-btn"><i class="ri-download-cloud-2-line"></i>تصدير الجدول الحالي</button><button class="data-btn" id="import-btn"><i class="ri-upload-cloud-2-line"></i>استيراد جدول</button><input type="file" id="import-file-input" accept=".json" style="display: none;"><button class="data-btn danger" id="reset-app-btn"><i class="ri-restart-line"></i>إعادة تعيين التطبيق</button></div></div> </div>`;
            this._attachModalEventListeners();
            this._populateTimeSelects();
            this._applySettings();
        },
        _attachModalEventListeners() {
            this.dom.settingsModal.querySelector('#close-modal-btn').addEventListener('click', () => this._toggleSettingsModal(false));
            this.dom.settingsModal.querySelector('#course-colors-list').addEventListener('change', e => this._handleCourseColorChange(e));
            this.dom.settingsModal.querySelector('#course-visibility-list').addEventListener('click', e => this._handleVisibilityToggle(e));
            this.dom.settingsModal.querySelector('#print-btn').addEventListener('click', () => window.print());
            this.dom.settingsModal.querySelector('#export-btn').addEventListener('click', () => this._handleExport());
            this.dom.settingsModal.querySelector('#import-btn').addEventListener('click', () => this.dom.settingsModal.querySelector('#import-file-input').click());
            this.dom.settingsModal.querySelector('#import-file-input').addEventListener('change', e => this._handleImport(e));
            this.dom.settingsModal.querySelector('#reset-app-btn').addEventListener('click', () => this._handleReset());
        },
        _handleCourseColorChange(event) {
            if (event.target.matches('.color-picker-input')) {
                const code = event.target.dataset.courseCode;
                const newColor = event.target.value;
                this.state.customColors[code] = newColor;
                if (this.state.groupedCourses[code])
                    this.state.groupedCourses[code].color = newColor;
                this._saveCustomColors();
                this.updateCalendarAndConflicts();
                this._renderCoursesList();
                this._buildSettingsModal();
            }
        },
        _handleVisibilityToggle(event) {
            const btn = event.target.closest('.course-visibility-btn');
            if (!btn)
                return;
            const code = btn.dataset.courseCode;
            if (this.state.hiddenCourseCodes.has(code)) {
                this.state.hiddenCourseCodes.delete(code);
                btn.classList.remove('hidden');
                btn.classList.add('visible');
            } else {
                this.state.hiddenCourseCodes.add(code);
                btn.classList.add('hidden');
                btn.classList.remove('visible');
            }
            this._saveSettings();
            this._renderCoursesList();
        },
        _handleExport() {
            if (this.state.selectedSections.size === 0) {
                Swal.fire('الجدول فارغ!', 'الرجاء اختيار بعض الشعب أولاً.', 'warning');
                return;
            }
            const dataStr = JSON.stringify({
                version: 1,
                schedule: Array.from(this.state.selectedSections)
            });
            const dataBlob = new Blob([dataStr], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `qu_schedule_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        },
        _handleImport(e) {
            const file = e.target.files[0];
            if (!file)
                return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data && data.version === 1 && Array.isArray(data.schedule)) {
                        this.state.selectedSections.clear();
                        data.schedule.forEach(id => this.state.selectedSections.add(id));
                        this._renderCoursesList();
                        this.updateCalendarAndConflicts();
                        this._toggleSettingsModal(false);
                        Swal.fire({
                            toast: true,
                            position: 'bottom',
                            icon: 'success',
                            title: 'تم استيراد الجدول بنجاح!',
                            showConfirmButton: false,
                            timer: 3000
                        });
                    } else {
                        throw new Error('Invalid file format');
                    }
                } catch (error) {
                    Swal.fire('خطأ!', 'ملف غير صالح. تأكد من أنه ملف جدول تم تصديره من هذه الأداة.', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        },
        _handleReset() {
            Swal.fire({
                title: 'هل أنت متأكد؟',
                text: "سيؤدي هذا إلى مسح جميع بيانات التطبيق المحفوظة (المقررات، الإعدادات، والألوان).",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'نعم، إعادة تعيين!',
                cancelButtonText: 'إلغاء'
            }).then((result) => {
                if (result.isConfirmed) {
                    localStorage.clear();
                    location.reload();
                }
            });
        },
        _toggleSettingsModal(show) {
            this.dom.modalOverlay.classList.toggle('open', show);
            this.dom.settingsModal.classList.toggle('open', show);
        },
        _applySettings() {
            document.body.className = this.state.userSettings.theme === 'light' ? 'light' : '';
            const primaryColor = this.state.userSettings.accentColor;
            document.documentElement.style.setProperty('--primary', primaryColor);
            document.documentElement.style.setProperty('--primary-dark', this._adjustColorBrightness(primaryColor, -10));
            document.documentElement.style.setProperty('--rgb-primary', this._hexToRgb(primaryColor));
            const primaryHue = this._hexToHue(primaryColor);
            const secondaryHue = (primaryHue + 40) % 360;
            document.documentElement.style.setProperty('--primary-hue', String(primaryHue));
            document.documentElement.style.setProperty('--secondary-hue', String(secondaryHue));

            const modeToggle = this.dom.settingsModal.querySelector('.mode-toggle');
            if (modeToggle) {
                modeToggle.innerHTML = `<button class="mode-btn ${this.state.userSettings.theme === 'dark' ? 'active' : ''}" data-theme="dark">ظلام</button><button class="mode-btn ${this.state.userSettings.theme === 'light' ? 'active' : ''}" data-theme="light">نهار</button>`;
                modeToggle.onclick = e => {
                    if (e.target.matches('.mode-btn')) {
                        this.state.userSettings.theme = e.target.dataset.theme;
                        this._saveSettings();
                        this._applySettings();
                    }
                };
            }
            this._populateAccentColorPicker();
            const showWeekendToggle = this.dom.settingsModal.querySelector('#show-weekend-toggle');
            if (showWeekendToggle) {
                showWeekendToggle.checked = this.state.userSettings.showWeekends;
                showWeekendToggle.onchange = (e) => {
                    this.state.userSettings.showWeekends = e.target.checked;
                    this._saveSettings();
                    this._initializeCalendar();
                };
            }
        },

        _populateAccentColorPicker() {
            const picker = this.dom.settingsModal.querySelector('#accent-color-picker');
            if (!picker)
                return;
            picker.innerHTML = '';
            Object.values(this.constants.PRESET_COLORS).forEach(color => {
                const dot = document.createElement('div');
                dot.className = `theme-dot ${this.state.userSettings.accentColor === color ? 'active' : ''}`;
                dot.style.backgroundColor = color;
                dot.onclick = () => {
                    this.state.userSettings.accentColor = color;
                    this._saveSettings();
                    this._applySettings();
                };
                picker.appendChild(dot);
            });
            const isCustom = !Object.values(this.constants.PRESET_COLORS).includes(this.state.userSettings.accentColor);
            const customLabel = document.createElement('label');
            customLabel.className = `color-picker-label ${isCustom ? 'active' : ''}`;
            customLabel.style.backgroundColor = isCustom ? this.state.userSettings.accentColor : 'transparent';
            customLabel.innerHTML = `<input type="color" class="color-picker-input" value="${this.state.userSettings.accentColor}">`;
            customLabel.querySelector('input').onchange = (e) => {
                this.state.userSettings.accentColor = e.target.value;
                this._saveSettings();
                this._applySettings();
            };
            picker.appendChild(customLabel);
        },

        _populateTimeSelects() {
            const minContainer = this.dom.settingsModal.querySelector('#min-time-select-container');
            const maxContainer = this.dom.settingsModal.querySelector('#max-time-select-container');
            if (!minContainer || !maxContainer)
                return;
            const timeOptions = Array.from({
                length: 24
            }, (_, i) => ({
                value: `${String(i).padStart(2, '0')}:00:00`,
                label: `${String(i).padStart(2, '0')}:00`
            }));
            this._createActionPicker(minContainer, timeOptions, this.state.userSettings.minTime, (newVal) => {
                this.state.userSettings.minTime = newVal;
                this._saveSettings();
                this._initializeCalendar();
            });
            this._createActionPicker(maxContainer, timeOptions, this.state.userSettings.maxTime, (newVal) => {
                this.state.userSettings.maxTime = newVal;
                this._saveSettings();
                this._initializeCalendar();
            });
        },

        _createActionPicker(container, options, initialValue, onChange) {
            container.innerHTML = '';
            let isOpen = false;
            const wrapper = document.createElement('div');
            wrapper.className = 'action-picker-wrapper';
            const selectedOption = options.find(opt => opt.value === initialValue) || options[0];
            const display = document.createElement('button');
            display.type = 'button';
            display.className = 'action-picker-display';
            display.textContent = selectedOption.label;
            const panel = document.createElement('div');
            panel.className = 'action-picker-panel';
            panel.style.display = 'none';
            options.forEach(option => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `action-picker-option ${initialValue === option.value ? 'selected' : ''}`;
                btn.textContent = option.label;
                btn.onclick = () => {
                    onChange(option.value);
                    display.textContent = option.label;
                    panel.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
                    btn.classList.add('selected');
                    closePanel();
                };
                panel.appendChild(btn);
            });
            const openPanel = () => {
                isOpen = true;
                panel.style.display = 'block';
            };
            const closePanel = () => {
                isOpen = false;
                panel.style.display = 'none';
            };
            display.onclick = () => isOpen ? closePanel() : openPanel();
            wrapper.appendChild(display);
            wrapper.appendChild(panel);
            container.appendChild(wrapper);
            document.addEventListener('click', (e) => {
                if (!wrapper.contains(e.target))
                    closePanel();
            });
        }
    };

    QU_ScheduleApp.init();
});
