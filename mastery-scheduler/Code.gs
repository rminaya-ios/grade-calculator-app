/**
 * Student Meeting Scheduler — Dr. Ralph Minaya
 * ------------------------------------------------------------
 * One booking page for two kinds of 10-minute meetings:
 *   • Mastery Meeting  — show mastery of missing/past-due work (grade replacement)
 *   • Office Hours     — get support on current material
 *
 *  • Students see open slots and slots marked "Unavailable" — never names.
 *  • Bookings are stored only in this (private) Google Sheet.
 *  • One link per course:  <web-app-url>?course=MATH110-03
 *
 * Sheet tabs:
 *  - Courses  : one row per availability block. Add rows for other classes/terms.
 *  - Bookings : every booking. To cancel one, change its Status to "Cancelled"
 *               and the slot re-opens automatically.
 */

// ===== Settings you may edit =====
var TZ = 'America/New_York';
var INSTRUCTOR_NAME = 'Dr. Minaya';
var SEND_CONFIRMATION_EMAILS = true;   // email the student + you on each booking

var MEETING_TYPES = {
  mastery: {
    label: 'Mastery Meeting',
    short: 'Show mastery of missing or past-due work so the grade can be replaced.',
    prep:
      'Mastery meetings are for <b>demonstrating mastery</b>, not for learning the material for the first time. ' +
      'Before you book, please work with a <b>tutor</b> (Tutoring Center, office hours, or study group) and review ' +
      'your missing assignments until you can solve the problems and explain your reasoning on your own. ' +
      'Grades are replaced after the meeting according to the course grading policy.',
    readyText: 'I have worked with a tutor and reviewed my missing assignments, and I am ready to demonstrate mastery of the concepts.'
  },
  support: {
    label: 'Office Hours (Support)',
    short: 'Get help with a topic, assignment, or question from class.',
    prep:
      'Office hours are for <b>getting support</b> — you do not need to be behind to book. ' +
      'Bring your notes and the specific problems or questions you want to work on so we can make the most of 10 minutes.',
    readyText: ''
  }
};
// =================================

var COURSE_HEADERS = ['Course Code', 'Course Title', 'Room', 'Days', 'Start Time', 'End Time',
  'First Date', 'Last Date', 'Excluded Dates', 'Session (min)', 'Buffer (min)',
  'Max Upcoming Slots per Student', 'Active', 'Meeting Types'];
var BOOKING_HEADERS = ['Timestamp', 'Course Code', 'Date', 'Start', 'End', 'Room',
  'Student Name', 'Student Email', 'Status', 'Meeting Type', 'Topic / Notes'];

/* ---------------- Web app entry ---------------- */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.courseCode = (e && e.parameter && e.parameter.course) ? String(e.parameter.course) : '';
  return t.evaluate()
    .setTitle('Schedule a Meeting with ' + INSTRUCTOR_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Called by the page. Returns ONLY slot times + availability (no names). */
function getCourseView(courseCode) {
  var blocks = getBlocks_(courseCode);
  if (!blocks.length) return { ok: false, error: 'This scheduling link is not active. Please contact ' + INSTRUCTOR_NAME + '.' };

  // You are one person: a time booked in ANY course is unavailable in every course.
  var taken = {};
  activeBookings_().forEach(function (r) { taken[r.id] = 1; });
  var now = nowKey_();
  var byDate = {};
  generateSlots_(blocks).forEach(function (s) {
    if (s.id <= now) return;                                // hide past slots
    (byDate[s.date] = byDate[s.date] || { date: s.date, label: s.dateLabel, slots: [] })
      .slots.push({ id: s.id, label: s.label, room: s.room, available: !taken[s.id] });
  });
  var days = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });

  return {
    ok: true,
    code: blocks[0].code,
    title: blocks[0].title,
    maxPerStudent: blocks[0].maxPerStudent,
    instructor: INSTRUCTOR_NAME,
    types: blocks[0].types.map(function (k) {
      var t = MEETING_TYPES[k];
      return { key: k, label: t.label, short: t.short, prep: t.prep, readyText: t.readyText };
    }),
    days: days
  };
}

/** Called by the page to book a slot. */
function bookSlot(courseCode, slotId, name, email, typeKey, topic, ready) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  email = String(email || '').trim().toLowerCase();
  topic = String(topic || '').trim().replace(/\s+/g, ' ').slice(0, 300);
  if (name.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please enter a valid email address.' };

  var blocks = getBlocks_(courseCode);
  if (!blocks.length) return { ok: false, error: 'This scheduling link is not active.' };
  var code = blocks[0].code;
  if (blocks[0].types.indexOf(typeKey) < 0) return { ok: false, error: 'Please choose a meeting type.' };
  var type = MEETING_TYPES[typeKey];
  if (type.readyText && !ready) return { ok: false, error: 'Please confirm you are ready to demonstrate mastery.' };

  var slot = generateSlots_(blocks).filter(function (s) { return s.id === slotId; })[0];
  if (!slot) return { ok: false, error: 'That time is no longer offered. Please pick another.' };
  var now = nowKey_();
  if (slot.id <= now) return { ok: false, error: 'That time has already passed.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = activeBookings_();
    if (rows.some(function (r) { return r.id === slotId; })) {
      return { ok: false, taken: true, error: 'Sorry — someone just booked that time. Please choose another.' };
    }
    var upcoming = rows.filter(function (r) { return r.code === normCode_(code) && r.email === email && r.id > now; });
    if (upcoming.length >= blocks[0].maxPerStudent) {
      return { ok: false, error: 'You already have ' + upcoming.length + ' upcoming meeting(s), which is the maximum (' +
        blocks[0].maxPerStudent + '). You can book again after your meeting, or email ' + INSTRUCTOR_NAME + ' to change a time.' };
    }
    bookingsSheet_().appendRow([
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
      code, slot.date, slot.start24, slot.end24, slot.room, name, email, 'Booked', type.label, topic
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  var when = slot.dateLabel + ', ' + slot.label;
  if (SEND_CONFIRMATION_EMAILS) {
    try {
      var bring = typeKey === 'mastery'
        ? 'Please arrive on time and be ready to work through problems from your missing assignments and explain your reasoning.'
        : 'Please arrive on time and bring your notes and the specific questions you want to work on.';
      MailApp.sendEmail({
        to: email,
        subject: 'Confirmed: ' + type.label + ' with ' + INSTRUCTOR_NAME + ' — ' + when,
        htmlBody: 'Hello ' + esc_(name) + ',<br><br>Your 10-minute <b>' + esc_(type.label) + '</b> is confirmed.<br><br>' +
          '<b>Course:</b> ' + esc_(blocks[0].title) + '<br><b>When:</b> ' + esc_(when) + '<br><b>Where:</b> ' + esc_(slot.room) +
          (topic ? '<br><b>Topic:</b> ' + esc_(topic) : '') +
          '<br><br>' + bring + ' If you need to cancel or change your time, reply to this email.<br><br>' +
          'See you then!<br>' + INSTRUCTOR_NAME
      });
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        type.label + ': ' + name + ' — ' + code + ' — ' + when,
        name + ' (' + email + ') booked a ' + type.label + ' for ' + when + ' in ' + slot.room + '.' +
        (topic ? '\nTopic: ' + topic : ''));
    } catch (err) { /* booking is saved even if email fails */ }
  }
  return { ok: true, when: when, room: slot.room, type: type.label };
}

/* ---------------- One-time setup ---------------- */

/** Run once from the Apps Script editor to authorize. Creates tabs only if missing. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  [['Courses', COURSE_HEADERS], ['Bookings', BOOKING_HEADERS]].forEach(function (p) {
    var sh = ss.getSheetByName(p[0]) || ss.insertSheet(p[0]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, p[1].length).setValues([p[1]]).setFontWeight('bold');
      sh.getRange(1, 1, sh.getMaxRows(), p[1].length).setNumberFormat('@');  // plain text
      sh.setFrozenRows(1);
    }
  });
}

/* ---------------- Helpers ---------------- */

function bookingsSheet_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Bookings');
  if (!sh) throw new Error('Run setup() first.');
  return sh;
}

function getBlocks_(courseCode) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Courses');
  if (!sh || sh.getLastRow() < 2) return [];
  var want = normCode_(courseCode);
  var rows = sh.getDataRange().getDisplayValues().slice(1);
  var blocks = rows.map(parseBlock_).filter(function (b) { return b && b.active; });
  if (!want) {
    var codes = {};
    blocks.forEach(function (b) { codes[b.code] = 1; });
    if (Object.keys(codes).length !== 1) return [];   // ambiguous: require ?course=
    return blocks;
  }
  return blocks.filter(function (b) { return normCode_(b.code) === want; });
}

function parseBlock_(r) {
  if (!r[0]) return null;
  return {
    code: String(r[0]).trim(),
    title: String(r[1] || r[0]).trim(),
    room: String(r[2] || '').trim(),
    days: parseDays_(r[3]),
    startMin: parseTime_(r[4]),
    endMin: parseTime_(r[5]),
    first: parseDate_(r[6]),
    last: parseDate_(r[7]),
    excluded: String(r[8] || '').split(/[,;\s]+/).map(parseDate_).filter(Boolean),
    duration: parseInt(r[9], 10) || 10,
    buffer: parseInt(r[10], 10) || 0,
    maxPerStudent: parseInt(r[11], 10) || 1,
    active: /^(true|yes|y|1|x)$/i.test(String(r[12] || 'TRUE').trim()),
    types: parseTypes_(r[13])
  };
}

/** "Mastery, Office Hours" -> ['mastery','support']. Blank = both. */
function parseTypes_(s) {
  s = String(s || '').toLowerCase();
  var out = [];
  if (!s.trim() || /mast/.test(s)) out.push('mastery');
  if (!s.trim() || /office|support|help/.test(s)) out.push('support');
  return out.length ? out : ['mastery', 'support'];
}

function generateSlots_(blocks) {
  var out = [], seen = {};
  blocks.forEach(function (b) {
    if (!b.first || !b.last || b.startMin == null || b.endMin == null) return;
    for (var d = b.first; d <= b.last; d = addDays_(d, 1)) {
      if (b.days.indexOf(weekday_(d)) < 0 || b.excluded.indexOf(d) >= 0) continue;
      for (var t = b.startMin; t + b.duration <= b.endMin; t += b.duration + b.buffer) {
        var id = d + ' ' + hhmm_(t);
        if (seen[id]) continue;
        seen[id] = 1;
        out.push({
          id: id, date: d, dateLabel: dateLabel_(d), room: b.room,
          start24: hhmm_(t), end24: hhmm_(t + b.duration),
          label: ampm_(t) + ' – ' + ampm_(t + b.duration)
        });
      }
    }
  });
  return out.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
}

/** All non-cancelled bookings, every course. */
function activeBookings_() {
  var sh = bookingsSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 9).getDisplayValues()
    .filter(function (r) {
      return r[1] && !/cancel/i.test(r[8]);
    })
    .map(function (r) {
      return { code: normCode_(r[1]), id: (parseDate_(r[2]) || r[2]) + ' ' + hhmm_(parseTime_(r[3])), email: String(r[7]).trim().toLowerCase() };
    });
}

function nowKey_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function normCode_(s) { return String(s || '').replace(/[\s\-_.]/g, '').toUpperCase(); }
function esc_(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

/* Pure date/time helpers (no time-zone math: dates are 'yyyy-MM-dd' strings). */
var DAY_KEYS = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseDays_(s) {
  return String(s || '').toLowerCase().split(/[^a-z]+/).map(function (w) {
    return DAY_KEYS.indexOf(w.slice(0, 2));
  }).filter(function (i) { return i >= 0; });
}
function parseTime_(s) {
  var m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?$/i);
  if (!m) return null;
  var h = parseInt(m[1], 10), min = parseInt(m[2], 10), ap = (m[3] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return h * 60 + min;
}
function parseDate_(s) {
  s = String(s || '').trim();
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return null;
  return y + '-' + pad_(mo) + '-' + pad_(d);
}
function addDays_(d, n) {
  var p = d.split('-'), t = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return t.getUTCFullYear() + '-' + pad_(t.getUTCMonth() + 1) + '-' + pad_(t.getUTCDate());
}
function weekday_(d) { var p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
function dateLabel_(d) { var p = d.split('-'); return DAY_NAMES[weekday_(d)] + ', ' + MONTHS[+p[1] - 1] + ' ' + (+p[2]); }
function hhmm_(m) { return pad_(Math.floor(m / 60)) + ':' + pad_(m % 60); }
function ampm_(m) { var h = Math.floor(m / 60), mm = m % 60; return ((h + 11) % 12 + 1) + ':' + pad_(mm) + ' ' + (h < 12 ? 'AM' : 'PM'); }
function pad_(n) { return (n < 10 ? '0' : '') + n; }
