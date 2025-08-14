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
            schedules: {},
            activeScheduleId: null,
            hiddenCourseCodes: new Set(),
            customColors: {},
            userSettings: {
                theme: 'dark',
                accentColor: '#8b5cf6',
                showWeekends: false,
                minTime: '08:00:00',
                maxTime: '22:00:00',
                hideClosedSections: false,
                hiddenCourseCodes: []
            }
        },
        constants: {
            // ... (no changes here)
        },
        dom: {},

        init() {
            this._populateDOMElements();
            this._setupEventListeners();
            this._loadSettings();
            this._loadSchedules();
            this._loadCustomColors();
            this._initializeCalendar();
            this._loadDataFromStorage();
            this._listenForDataFromOpener();
            this._updateBookmarkletCode();
        },
        
        // --- Schedule Management ---

        _loadSchedules() {
            const stored = localStorage.getItem('quScheduleSets_v1'); // New key for schedules
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    this.state.schedules = {};
                    // Re-hydrate the sets
                    for (const id in parsed.schedules) {
                        this.state.schedules[id] = {
                            name: parsed.schedules[id].name,
                            sections: new Set(parsed.schedules[id].sections)
                        };
                    }
                    this.state.activeScheduleId = parsed.activeScheduleId;
                } catch (e) {
                    this._initializeDefaultSchedule();
                }
            } else {
                this._initializeDefaultSchedule();
            }

            if (!this.state.schedules[this.state.activeScheduleId]) {
                this._initializeDefaultSchedule();
            }
        },

        _saveSchedules() {
            // Convert sets to arrays for JSON serialization
            const serializableSchedules = {};
            for (const id in this.state.schedules) {
                serializableSchedules[id] = {
                    name: this.state.schedules[id].name,
                    sections: Array.from(this.state.schedules[id].sections)
                };
            }
            const dataToStore = {
                schedules: serializableSchedules,
                activeScheduleId: this.state.activeScheduleId
            };
            localStorage.setItem('quScheduleSets_v1', JSON.stringify(dataToStore));
        },

        _initializeDefaultSchedule() {
            const defaultId = `sch_${Date.now()}`;
            this.state.schedules = {
                [defaultId]: { name: 'جدولي الأساسي', sections: new Set() }
            };
            this.state.activeScheduleId = defaultId;
            this._saveSchedules();
        },

        _getActiveScheduleSections() {
            return this.state.schedules[this.state.activeScheduleId]?.sections || new Set();
        },
        
        _renderScheduleTabs() {
            const wrapper = this.dom.scheduleTabsWrapper;
            wrapper.innerHTML = '';
            Object.keys(this.state.schedules).forEach(id => {
                const schedule = this.state.schedules[id];
                const tab = document.createElement('button');
                tab.className = `schedule-tab ${id === this.state.activeScheduleId ? 'active' : ''}`;
                tab.dataset.scheduleId = id;
                
                const tabName = document.createElement('span');
                tabName.textContent = schedule.name;
                tabName.className = 'tab-name';
                tab.appendChild(tabName);

                if (Object.keys(this.state.schedules).length > 1) {
                    const deleteBtn = document.createElement('i');
                    deleteBtn.className = 'ri-close-line delete-tab-btn';
                    deleteBtn.title = 'حذف الجدول';
                    tab.appendChild(deleteBtn);
                }

                wrapper.appendChild(tab);
            });
        },

        async _handleAddSchedule() {
            const { value: scheduleName } = await Swal.fire({
                title: 'إضافة جدول جديد',
                input: 'text',
                inputLabel: 'اسم الجدول الجديد',
                inputValue: `جدول مقترح ${Object.keys(this.state.schedules).length + 1}`,
                showCancelButton: true,
                confirmButtonText: 'إضافة',
                cancelButtonText: 'إلغاء',
                inputValidator: (value) => {
                    if (!value) {
                        return 'يجب إدخال اسم للجدول!'
                    }
                }
            });

            if (scheduleName) {
                const newId = `sch_${Date.now()}`;
                this.state.schedules[newId] = { name: scheduleName, sections: new Set() };
                this.state.activeScheduleId = newId;
                this._saveSchedules();
                this._renderScheduleTabs();
                this.updateCalendarAndConflicts();
            }
        },

        _handleScheduleTabClick(e) {
            const tab = e.target.closest('.schedule-tab');
            if (!tab) return;
            
            const scheduleId = tab.dataset.scheduleId;

            if (e.target.matches('.delete-tab-btn')) {
                this._handleDeleteSchedule(scheduleId);
                return;
            }

            if (e.target.matches('.tab-name')) {
                this._handleRenameSchedule(scheduleId);
                return;
            }

            this.state.activeScheduleId = scheduleId;
            this._saveSchedules();
            this._renderScheduleTabs();
            this.updateCalendarAndConflicts();
        },
        
        async _handleRenameSchedule(scheduleId) {
            const currentName = this.state.schedules[scheduleId].name;
            const { value: newName } = await Swal.fire({
                title: 'تعديل اسم الجدول',
                input: 'text',
                inputValue: currentName,
                showCancelButton: true,
                confirmButtonText: 'حفظ',
                cancelButtonText: 'إلغاء'
            });

            if (newName && newName !== currentName) {
                this.state.schedules[scheduleId].name = newName;
                this._saveSchedules();
                this._renderScheduleTabs();
            }
        },

        _handleDeleteSchedule(scheduleId) {
            Swal.fire({
                title: 'هل أنت متأكد؟',
                text: `سيتم حذف جدول "${this.state.schedules[scheduleId].name}" نهائياً.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'نعم، احذفه!',
                cancelButtonText: 'إلغاء'
            }).then((result) => {
                if (result.isConfirmed) {
                    delete this.state.schedules[scheduleId];
                    if (this.state.activeScheduleId === scheduleId) {
                        this.state.activeScheduleId = Object.keys(this.state.schedules)[0];
                    }
                    this._saveSchedules();
                    this._renderScheduleTabs();
                    this.updateCalendarAndConflicts();
                }
            });
        },


        _loadDataFromStorage() {
            const storedCourses = localStorage.getItem(this.constants.STORAGE_KEYS.COURSES);
            if (storedCourses) {
                try {
                    const courses = JSON.parse(storedCourses);
                    this._processAndDisplayData(courses);
                    this.updateCalendarAndConflicts();
                } catch (e) {
                    // ...
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
                    this._initializeDefaultSchedule(); // Reset schedules
                    this._processAndDisplayData(courses);
                    this.updateCalendarAndConflicts();
                }
            }, false);
            if (window.opener) {
                window.opener.postMessage('request_schedule_data', '*');
            }
        },
        
        _processAndDisplayData(courses) {
            // ... (no changes in this function)
        },

        // --- UI Rendering ---

        updateCalendarAndConflicts() {
            if (!this.state.calendar) return;

            this._renderScheduleTabs();
            this.state.calendar.removeAllEvents();
            
            const activeSections = this._getActiveScheduleSections();
            const selectedCourseDetails = Array.from(activeSections)
                .map(id => this.state.allCoursesData.find(c => c.uniqueId === id))
                .filter(Boolean);

            // ... (rest of the function is the same, just using selectedCourseDetails)
        },
        
        _renderCoursesList() {
            const coursesListContainer = this.dom.coursesList;
            coursesListContainer.innerHTML = '';
            
            const activeSections = this._getActiveScheduleSections();

            let visibleCourses = Object.values(this.state.groupedCourses)
                .filter(g => !this.state.hiddenCourseCodes.has(g.code));
            
            if (this.state.userSettings.hideClosedSections) {
                visibleCourses = visibleCourses.map(group => {
                    const openSections = group.sections.filter(s => s.status.includes('مفتوحة'));
                    if (openSections.length > 0) {
                        return { ...group, sections: openSections };
                    }
                    return null;
                }).filter(Boolean);
            }

            if (Object.keys(this.state.groupedCourses).length > 0 && visibleCourses.length === 0) {
                // ... (no changes here)
            }

            visibleCourses.sort((a, b) => a.code.localeCompare(b.code)).forEach((group, i) => {
                const courseItem = document.createElement('div');
                // ...
                const sectionsHTML = group.sections.map(section => {
                    const isNoTime = section.time === 'غير محدد';
                    return `<div class="section-btn ${activeSections.has(section.uniqueId) ? 'selected' : ''} ${isNoTime ? 'no-time' : ''}" data-unique-id="${section.uniqueId}" style="${isNoTime ? '--item-color:' + group.color : ''}"><div class="section-btn-number">${section.section}</div><div class="section-type">${section.type || ''}</div></div>`;
                }).join('');
                // ...
            });
        },

        // --- Event Handlers ---
        
        _setupEventListeners() {
            // ... (existing listeners)
            this.dom.addScheduleBtn.addEventListener('click', () => this._handleAddSchedule());
            this.dom.scheduleTabsWrapper.addEventListener('click', (e) => this._handleScheduleTabClick(e));
        },

        _handleCourseListClick(e) {
            const sectionBtn = e.target.closest('.section-btn');
            const header = e.target.closest('.course-item-header');
            if (sectionBtn) {
                const uniqueId = sectionBtn.dataset.uniqueId;
                const activeSections = this._getActiveScheduleSections();

                sectionBtn.classList.toggle('selected');
                if (activeSections.has(uniqueId)) {
                    activeSections.delete(uniqueId);
                } else {
                    activeSections.add(uniqueId);
                }
                this._saveSchedules();
                this.updateCalendarAndConflicts();
            } else if (header) {
                header.parentElement.classList.toggle('open');
            }
        },

        _handleClearCalendar() {
             const activeScheduleName = this.state.schedules[this.state.activeScheduleId].name;
            Swal.fire({
                title: 'هل أنت متأكد؟',
                text: `سيتم مسح جميع المواد المختارة من جدول "${activeScheduleName}".`,
                // ...
            }).then((result) => {
                if (result.isConfirmed) {
                    this._getActiveScheduleSections().clear();
                    this._saveSchedules();
                    this.updateCalendarAndConflicts();
                    // ...
                }
            });
        },
        
        // --- Settings Modal ---

        _buildSettingsModal() {
            // ... (no changes in most of the HTML string)
            // ADD the new setting item for filtering
            modal.innerHTML = `...
            <div class="settings-group">
                <h4 class="settings-group-title"><i class="ri-filter-3-line"></i>فلاتر العرض</h4>
                <div class="settings-item">
                    <div class="settings-item-label">
                        <span>إخفاء الشعب المغلقة</span>
                        <small>يخفي الشعب غير المتاحة للتسجيل من القائمة.</small>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="hide-closed-toggle">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            ...`
        },

        _attachModalEventListeners() {
            // ... (existing listeners)
            this.dom.settingsModal.querySelector('#hide-closed-toggle').addEventListener('change', e => {
                this.state.userSettings.hideClosedSections = e.target.checked;
                this._saveSettings();
                this._renderCoursesList();
            });
        },

        _applySettings() {
            // ... (existing code)
            const hideClosedToggle = this.dom.settingsModal.querySelector('#hide-closed-toggle');
            if (hideClosedToggle) {
                hideClosedToggle.checked = this.state.userSettings.hideClosedSections;
            }
            // ...
        }

        // --- All other functions remain the same ---
        // Just make sure to fill in the blanks where `// ...` is indicated
        // by copying the corresponding functions from the previous version of the code.
    };
    
    // To make it fully working, you would need to copy the unchanged functions
    // from the previous complete code block into this structure. I've omitted them
    // here for brevity but highlighted all the key changes and additions.

    QU_ScheduleApp.init();
});
