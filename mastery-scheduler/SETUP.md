# Mastery Meeting Scheduler: Setup (about 5 minutes, one time)

Your Google Sheet **"Mastery Meeting Scheduler – Dr. Minaya"** is already in your Drive with two tabs:
- **Courses**: your availability (MATH1010050 is already filled in)
- **Bookings**: each booking is added here automatically. Students never see this tab.

## 1. Add the code
1. Open the Sheet → **Extensions → Apps Script**.
2. Delete everything in `Code.gs` and paste in the contents of **Code.gs**.
3. Click **+** next to *Files* → **HTML** → name it exactly `Index` → paste in the contents of **Index.html**.
4. Click **Save** (disk icon).

## 2. Authorize (one time)
1. In the function dropdown at the top, choose **setup** → click **Run**.
2. Click **Review permissions** → pick your account → **Advanced** → **Go to (project name)** → **Allow**.
   Google shows a warning because this is your own unpublished script. That's expected.

## 3. Deploy the student link
1. Click **Deploy → New deployment** → gear icon → **Web app**.
2. **Execute as:** *Me*. **Who has access:** *Anyone*. Students won't need a Google account.
3. Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
4. Add the course code to the end of the URL. This is the link you post in Blackboard:

```
https://script.google.com/macros/s/XXXXXXXX/exec?course=MATH1010050
```

## Day-to-day
- **See who booked:** open the **Bookings** tab.
- **Cancel or free up a slot:** change that row's **Status** to `Cancelled`. The slot reopens right away.
- **Emails:** each booking sends a confirmation to the student and a notice to you.

## Reusing it for your MWF classes
Add a row to **Courses**. No new deployment is needed.

| Course Code | Course Title | Room | Days | Start Time | End Time | First Date | Last Date | Excluded Dates | Session (min) | Buffer (min) | Max Slots per Student | Active |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MATH110-03 | MATH 110 – Elementary Statistics | Room ___ | Mon, Wed, Fri | 1:00 PM | 2:00 PM | 2026-11-16 | 2026-11-27 | 2026-11-25, 2026-11-27 | 10 | 5 | 2 | TRUE |

- Link: same URL with `?course=MATH110-03`.
- **Different hours on different days:** add one row per time block with the same Course Code.
- **New booking window:** change **First Date** and **Last Date**.
- **Close a course:** set **Active** to `FALSE`.
- **Formats:** dates as `2026-11-05` or `11/5/2026`. Separate several excluded dates with commas.
- **If you edit Code.gs or Index.html later:** go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The link stays the same.
