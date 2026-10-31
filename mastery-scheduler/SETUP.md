# Student Meeting Scheduler: Setup (about 5 minutes, one time)

One booking page for two kinds of 10-minute, in-person meetings:
- **Mastery Meeting**: the student shows mastery of missing or past-due work so the grade can be replaced. The student must confirm they worked with a tutor first.
- **Office Hours (Support)**: help with current material. Students don't need to be behind to book.

Your Google Sheet **"Mastery Meeting Scheduler – Dr. Minaya"** has two tabs:
- **Courses**: your availability. There is one row per course and time block.
- **Bookings**: each booking is added here automatically, with the meeting type and topic. Students never see this tab.

## 1. Add the code
1. Open the Sheet → **Extensions → Apps Script**.
2. Delete everything in `Code.gs` and paste in the contents of **Code.gs**.
3. Click **+** next to *Files* → **HTML** → name it exactly `Index` → paste in the contents of **Index.html**.
4. Click **Save** (disk icon).

## 2. Authorize (one time)
1. In the function dropdown at the top, choose **setup** → click **Run**.
2. Click **Review permissions** → pick your account → **Advanced** → **Go to (project name)** → **Allow**.
   Google shows a warning because this is your own unpublished script. That's expected.

## 3. Deploy and get your links
1. Click **Deploy → New deployment** → gear icon → **Web app**.
2. **Execute as:** *Me*. **Who has access:** *Anyone*. Students won't need a Google account.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. Add each course code to the end of the URL. Post each link in that course's Blackboard:

| Course | Link |
|---|---|
| MATH 1010 (CCC) | `…/exec?course=MATH1010050` |
| MATH 110-03 (USJ) | `…/exec?course=MATH110-03` |
| MATH 110-05 (USJ) | `…/exec?course=MATH110-05` |

## How it works
- **One schedule for you:** a time booked in any course shows as *Unavailable* in every course. If 110-03 and 110-05 share office hours, they can't double-book you.
- **Limit:** each student can book up to **2 ten-minute slots per day**, for example 2 in a row for a 20-minute session. There is no limit for the semester.
- **Fair use:** every student must check *"I will book only the time I need and cancel promptly…"* before booking. You can edit the wording in `FAIR_USE` at the top of `Code.gs`.
- **Cancel or free up a slot:** in **Bookings**, change the row's **Status** to `Cancelled`. The slot reopens right away.
- **Emails:** each booking sends a confirmation to the student and a notice to you, including the meeting type and topic.

## The Courses tab
| Column | Example | Notes |
|---|---|---|
| Days | `Mon, Wed, Fri` | |
| Start / End Time | `4:10 PM` / `5:20 PM` | Slots are created from Start until End. |
| First / Last Date | `2026-11-01` / `2026-12-15` | Booking window. You can also write `11/1/2026`. |
| Excluded Dates | `2026-11-25, 2026-11-27` | Holidays and days off |
| Session / Buffer (min) | `10` / `5` | |
| Max Slots per Student per Day | `2` | |
| Active | `TRUE` / `FALSE` | `FALSE` turns the link off. |
| Meeting Types | `Mastery, Office Hours` | Leave blank for both, or list just one. |

- **Different hours on different days:** add another row with the same Course Code.
- **Spring 2027:** update the dates and times, add new course rows, and set old rows to `FALSE`. The deployment and link base stay the same.
- **If you edit Code.gs or Index.html later:** go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The link stays the same.
