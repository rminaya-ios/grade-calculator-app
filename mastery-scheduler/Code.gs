/**
 * Mastery Meeting Scheduler — Dr. Ralph Minaya
 * ------------------------------------------------------------
 * A private booking page for 1:1 mastery-verification meetings.
 *
 *  • Students see open slots and slots marked "Unavailable" — never names.
 *  • Bookings are stored only in this (private) Google Sheet.
 *  • One link per course:  <web-app-url>?course=MATH1010050
 *
 * Sheet tabs (created by running setup() once):
 *  - Courses  : one row per availability block. Add rows for other classes.
 *  - Bookings : every booking. To cancel one, change its Status to "Cancelled"
 *               and the slot re-opens automatically.
 */

// ===== Settings you may edit =====
var TZ = 'America/New_York';
var INSTRUCTOR_NAME = 'Dr. Minaya';
var SEND_CONFIRMATION_EMAILS = true;   // email the student + you on each booking
var PREP_MESSAGE =
  'These meetings are for <b>demonstrating mastery</b>, not for learning the material for the first time. ' +
  'Before you book, please work with a <b>tutor</b> (Tutoring Center, office hours, or study group) and review ' +
  'your missing assignments until you can solve the problems and explain your reasoning on your own. ' +
  'Come ready to show what you know.';
// =================================

var COURSE_HEADERS = ['Course Code', 'Course Title', 'Room', 'Days', 'Start Time', 'End Time',
  'First Date', 'Last Date', 'Excluded Dates', 'Session (min)', 'Buffer (min)',
  'Max Slots per Student', 'Active'];
var BOOKING_HEADERS = ['Timestamp', 'Course Code', 'Date', 'Start', 'End', 'Room',
  'Student Name', 'Student Email', 'Status'];

/* ---------------- Web app entry ---------------- */

function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.courseCode = (e && e.parameter && e.parameter.course) ? String(e.parameter.course) : '';
  return t.evaluate()
    .setTitle('Schedule a Mastery Meeting')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Called by the page. Returns ONLY slot times + availability (no names). */
function getCourseView(courseCode) {
  var blocks = getBlocks_(courseCode);
  if (!blocks.length) return { ok: false, error: 'This scheduling link is not active. Please contact ' + INSTRUCTOR_NAME + '.' };

  var taken = takenSlotIds_(blocks[0].code);
  var now = nowKey_();
  var byDate = {};
  generateSlots_(blocks).forEach(function (s) {
    if (s.date + ' ' + s.start24 <= now) return;            // hide past slots
    (byDate[s.date] = byDate[s.date] || { date: s.date, label: s.dateLabel, slots: [] })
      .slots.push({ id: s.id, label: s.label, room: s.room, available: !taken[s.id] });
  });
  var days = Object.keys(byDate).sort().map(function (k) { return byDate[k]; });

  return {
    ok: true,
    code: blocks[0].code,
    title: blocks[0].title,
    maxPerStudent: blocks[0].maxPerStudent,
    prepMessage: PREP_MESSAGE,
    instructor: INSTRUCTOR_NAME,
    days: days
  };
}

/** Called by the page to book a slot. */
function bookSlot(courseCode, slotId, name, email) {
  name = String(name || '').trim().replace(/\s+/g, ' ');
  email = String(email || '').trim().toLowerCase();
  if (name.length < 2) return { ok: false, error: 'Please enter your full name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Please enter a valid email address.' };

  var blocks = getBlocks_(courseCode);
  if (!blocks.length) return { ok: false, error: 'This scheduling link is not active.' };
  var code = blocks[0].code;
  var slot = generateSlots_(blocks).filter(function (s) { return s.id === slotId; })[0];
  if (!slot) return { ok: false, error: 'That time is no longer offered. Please pick another.' };
  if (slot.date + ' ' + slot.start24 <= nowKey_()) return { ok: false, error: 'That time has already passed.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var rows = activeBookings_(code);
    if (rows.some(function (r) { return r.id === slotId; })) {
      return { ok: false, taken: true, error: 'Sorry — someone just booked that time. Please choose another.' };
    }
    var mine = rows.filter(function (r) { return r.email === email; });
    if (mine.length >= blocks[0].maxPerStudent) {
      return { ok: false, error: 'You already have ' + mine.length + ' meeting(s) booked, which is the maximum (' +
        blocks[0].maxPerStudent + '). To change a time, email ' + INSTRUCTOR_NAME + '.' };
    }
    bookingsSheet_().appendRow([
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'),
      code, slot.date, slot.start24, slot.end24, slot.room, name, email, 'Booked'
    ]);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }

  var when = slot.dateLabel + ', ' + slot.label;
  if (SEND_CONFIRMATION_EMAILS) {
    try {
      MailApp.sendEmail({
        to: email,
        subject: 'Confirmed: Mastery Meeting with ' + INSTRUCTOR_NAME + ' — ' + when,
        htmlBody: 'Hello ' + esc_(name) + ',<br><br>Your 10-minute mastery meeting is confirmed.<br><br>' +
          '<b>Course:</b> ' + esc_(blocks[0].title) + '<br><b>When:</b> ' + esc_(when) + '<br><b>Where:</b> ' + esc_(slot.room) +
          '<br><br>Please arrive on time and be ready to work through problems from your missing assignments ' +
          'and explain your reasoning. If you need to cancel or change your time, reply to this email.<br><br>' +
          'See you then!<br>' + INSTRUCTOR_NAME
      });
      MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        'New mastery meeting: ' + name + ' — ' + code + ' — ' + when,
        name + ' (' + email + ') booked ' + when + ' in ' + slot.room + '.');
    } catch (err) { /* booking is saved even if email fails */ }
  }
  return { ok: true, when: when, room: slot.room };
}

/* ---------------- One-time setup ---------------- */

/** Run once from the Apps Script editor: creates the tabs and a starter row. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var c = ss.getSheetByName('Courses') || ss.insertSheet('Courses');
  if (c.getLastRow() === 0) {
    c.getRange(1, 1, 1, COURSE_HEADERS.length).setValues([COURSE_HEADERS]).setFontWeight('bold');
    c.getRange('A:M').setNumberFormat('@');   // keep dates/times as plain text
    c.appendRow(['MATH1010050', 'MATH 1010 – Intermediate Algebra', 'Room 621', 'Tue, Thu',
      '4:10 PM', '5:20 PM', '2026-11-01', '2026-11-14', '2026-11-03', '10', '5', '2', 'TRUE']);
    c.setFrozenRows(1);
  }
  var b = ss.getSheetByName('Bookings') || ss.insertSheet('Bookings');
  if (b.getLastRow() === 0) {
    b.getRange(1, 1, 1, BOOKING_HEADERS.length).setValues([BOOKING_HEADERS]).setFontWeight('bold');
    b.getRange('A:I').setNumberFormat('@');
    b.setFrozenRows(1);
  }
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && ss.getSheets().length > 2 && s1.getLastRow() === 0) ss.deleteSheet(s1);
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
    active: /^(true|yes|y|1|x)$/i.test(String(r[12] || 'TRUE').trim())
  };
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

function activeBookings_(code) {
  var sh = bookingsSheet_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, BOOKING_HEADERS.length).getDisplayValues()
    .filter(function (r) {
      return normCode_(r[1]) === normCode_(code) && !/cancel/i.test(r[8]);
    })
    .map(function (r) {
      return { id: (parseDate_(r[2]) || r[2]) + ' ' + hhmm_(parseTime_(r[3])), email: String(r[7]).trim().toLowerCase() };
    });
}

function takenSlotIds_(code) {
  var m = {};
  activeBookings_(code).forEach(function (r) { m[r.id] = 1; });
  return m;
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
