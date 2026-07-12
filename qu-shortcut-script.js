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
      return days + ': ' + timeStr;
    }).filter(Boolean);
    return { timeText: timeParts.length > 0 ? timeParts.join('<br>') : 'غير محدد', location: loc };
  }
  return { timeText: 'غير محدد', location: loc };
}

function extractCourses(rows) {
  const coursesData = [];
  let lastTheoreticalCourse = null;
  const getVal = (row, th) => {
    const cell = row.querySelector('td[data-th=" ' + th + ' "]') || row.querySelector('td[data-th="' + th + '"]') || row.querySelector('td[data-th*="' + th + '"]');
    return cell ? cell.textContent.trim() : '';
  };
  rows.forEach(row => {
    const code = getVal(row, 'رمز المقرر');
    const name = getVal(row, 'اسم المقرر');
    const section = getVal(row, 'الشعبة');
    if (!name || !code || !section) return;
    if (lastTheoreticalCourse && code !== lastTheoreticalCourse.code) lastTheoreticalCourse = null;
    let hours = getVal(row, 'الساعات');
    const type = getVal(row, 'النشاط');
    const status = getVal(row, 'الحالة');
    const campus = getVal(row, 'المقر');
    const instructorEl = row.querySelector('input[type="hidden"][id$=":instructor"]');
    const detailsEl = row.querySelector('input[type="hidden"][id$=":section"]');
    const examEl = row.querySelector('input[type="hidden"][id$=":examPeriod"]');
    const instructor = instructorEl ? instructorEl.value.trim() : '';
    const detailsRaw = detailsEl ? detailsEl.value.trim() : '';
    let examPeriodId = examEl ? examEl.value.trim() : '';
    const isPractical = type && (type.includes('عملي') || type.includes('تدريب') || type.includes('تمارين'));
    if (isPractical && (!hours || hours.trim() === '0' || hours.trim() === '') && lastTheoreticalCourse && lastTheoreticalCourse.code === code) {
      hours = lastTheoreticalCourse.hours;
      examPeriodId = lastTheoreticalCourse.examPeriodId;
    }
    const t = parseTimeDetails(detailsRaw);
    const courseInfo = { code, name, section, time: t.timeText, location: t.location, instructor: instructor || 'غير محدد', examPeriodId: examPeriodId || null, hours: hours || '0', type: type || 'نظري', status: status || 'غير معروف', campus: campus || 'غير معروف' };
    coursesData.push(courseInfo);
    if (!isPractical) lastTheoreticalCourse = { code: courseInfo.code, hours: courseInfo.hours, examPeriodId: examPeriodId };
  });
  return coursesData;
}

const rows = document.querySelectorAll('tr.ROW1, tr.ROW2');
if (rows.length === 0) {
  completion('ERROR_NO_ROWS');
} else {
  const courses = extractCourses(rows);
  if (!courses.length) completion('ERROR_NO_DATA');
  else completion(JSON.stringify(courses));
}
