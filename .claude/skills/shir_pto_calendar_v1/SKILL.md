---
name: shir-pto-calendar
description: >-
  Reads the weekly "Birthdays, Anniversaries and Time Off" email from Nancy
  Garza (ngarza@pghnexus.com) or Lissa Hall (lhall@pghnexus.com) and puts every
  approved SHIR Capital PTO day on Elan's Google Calendar as an all-day event
  with no reminder. Use this skill whenever the user mentions the weekly HR
  email, the birthdays/anniversaries/time-off email, checking who on the SHIR
  team is out, syncing PTO or time off to the calendar, or asks what the team's
  upcoming time off looks like -- and always when the Friday PTO routine fires,
  even if the request is phrased loosely ("any PTO this week?", "did HR send the
  list yet?", "put the team's time off on my calendar").
---

# SHIR PTO -> Calendar

Every Friday morning, HR emails a summary of the coming week's birthdays,
anniversaries, and approved time off across all the operating entities. Only the
`SHIR:` block matters here. Each person listed there gets one all-day calendar
event, with no reminder attached, so Elan can see at a glance who is out without
being pinged about it.

The whole job is: find the right email, read the right section, and write clean
events without creating duplicates.

## 1. Find the email

Search Gmail for the most recent one:

```
subject:"Birthdays, Anniversaries and Time Off" from:(ngarza@pghnexus.com OR lhall@pghnexus.com) newer_than:14d
```

Pick the newest thread, then read it with `get_thread` using `messageFormat: PLAIN_TEXT`.

Two things to be careful about when choosing which *message* in the thread to parse:

- **Take the original, not a reply.** Colleagues reply to these threads with
  birthday wishes ("Happy Anniversary, Nancy!"). Those replies quote the whole
  original, so parsing one still works, but the sender must be Nancy or Lissa
  and the subject should not start with `Re:`.
- **Watch the date.** If the newest matching email is more than ~8 days old, HR
  probably has not sent this week's yet. Say so and stop rather than re-adding
  last week's dates.

Note the message's send date — the parser needs it to resolve bare ordinals like
`21st` into a real calendar date.

## 2. Parse the SHIR section

Save the plaintext body to a file and run the bundled parser:

```bash
python3 scripts/shir_pto_calendar_parser_v1.py \
    --received 2026-08-28 \
    --body-file /tmp/body.txt
```

It prints JSON:

```json
{
  "section": "SHIR",
  "found_section": true,
  "entries": [
    {"name": "Denzel M.", "start": "2026-08-20", "end": "2026-08-20",
     "all_day_end_exclusive": "2026-08-21", "days": 1, "raw": "Denzel M.- 20th"}
  ]
}
```

Use the parser rather than reading the dates yourself. The two senders format
dates differently and inconsistently — bare ordinals (`21st`), slash dates
(`9/2`), ranges with assorted dash characters, month boundaries that have to be
inferred — and a misread date silently books the wrong day. `--self-test` runs
the regression cases if you ever change it.

Interpreting the result:

| Result | Meaning | Do |
|---|---|---|
| `found_section: true`, entries present | Normal week with PTO | Create events |
| `found_section: true`, no entries | Section said `None` | Nothing to do — report that |
| `found_section: false` | No `SHIR:` heading at all | Read the body yourself; the format may have changed. Report it. |

If `found_section` is false, do not guess. Show the user the `APPROVED Time Off`
block verbatim and ask.

For unusual formats and the reasoning behind the date rules, see
`references/shir_pto_calendar_formats_v1.md`.

## 3. Skip anything already on the calendar

This routine can run more than once for the same week, and a person's time off
often appears in two consecutive weekly emails. Before creating anything, search
the calendar for existing events:

```
search_events(query: "<person's name> PTO")
```

Skip an entry when an all-day event already covers the same person and the same
dates. Creating a duplicate is worse than skipping — a doubled-up calendar is
the thing that makes people stop trusting an automation.

## 4. Create the events

One event per person per PTO block (a 3-day range is one event spanning 3 days,
not 3 events).

- **Title:** `<Name> - PTO` — e.g. `Denzel M. - PTO`, `Parth V. - PTO`.
  Use the name exactly as HR wrote it, abbreviations included. Do not expand
  `Denzel M.` into a full name by guessing; if you want the full name, the
  Contact List sheet linked at the bottom of every email is the source, and even
  then only use it if the match is unambiguous.
- **All-day:** set `start.date` and `end.date` (dates, not date-times).
  Google treats `end.date` as **exclusive**, which is why the parser hands you
  `all_day_end_exclusive` already computed — use that field verbatim for
  `end.date` and the event will cover the right span.
- **No reminder:** this is an explicit requirement. Set
  `reminders: {"useDefault": false, "overrides": []}`. Without `useDefault:
  false` the calendar's default popup gets attached and Elan gets alerted about
  other people's days off, which defeats the point.
- **Description:** include the raw email line and the email's date, so the event
  can be traced back to its source.

If `create_event` is not available in the session (the Google Calendar connector
is sometimes present read-only, exposing only `search_events`), do not fail
silently — see *Fallback* below.

## 5. Report

Keep the summary short and factual:

```
SHIR PTO for the week of Aug 29 – Sep 4 (email from Lissa Hall, Aug 28):
  Added   Denzel M. - PTO     Thu Aug 20        (all day, no reminder)
  Added   Parth V. - PTO      Fri Aug 21        (all day, no reminder)
  Skipped Jordan K. - PTO     Aug 24–26         (already on calendar)
```

When the section says `None`, one line is enough: "No SHIR time off listed for
the week of Aug 29 – Sep 4." Do not create anything, and do not pad the report.

## Fallback: no calendar write access

If the session can read the calendar but not write to it, the work is still
worth delivering — just through a different door. Send Elan a short email
(`Gmail:send_message` to egordon@shircapital.com) listing each person, their
dates, and a Google Calendar "add event" link per entry:

```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=Denzel+M.+-+PTO&dates=20260820/20260821
```

The `dates` parameter uses `YYYYMMDD/YYYYMMDD` with the same exclusive end date,
so it maps directly onto the parser's `all_day_end_exclusive`. Say plainly in
the email that the events were not created automatically and why, so a quiet
failure never looks like a quiet success.

## Scope

Only the `SHIR:` section under `APPROVED Time Off`. Birthdays and anniversaries
are not calendared, and neither are the other entities (AVA'S, DORCHESTER,
NEXUS) — those are other people's teams. If the user asks for one of those, the
parser takes `--section NEXUS` and the rest of the workflow is identical.
