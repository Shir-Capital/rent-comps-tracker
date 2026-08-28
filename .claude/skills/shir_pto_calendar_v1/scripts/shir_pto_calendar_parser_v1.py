#!/usr/bin/env python3
"""
shir_pto_calendar_parser_v1
===========================

Parse the weekly "Birthdays, Anniversaries and Time Off" email (sent by Nancy
Garza or Lissa Hall) and emit the APPROVED Time Off entries for one entity
section -- by default SHIR -- as normalized all-day date ranges.

Why this is a script and not freehand reasoning: the date notation in these
emails is inconsistent (bare ordinals vs M/D, ranges with several dash
characters, abbreviated surnames, month and year boundaries that have to be
inferred from when the email was sent). That is deterministic work, and getting
it wrong writes a wrong date onto somebody's calendar. Doing it here means the
same input always yields the same output, and `--self-test` proves the rules
still hold against real historical emails.

Usage
-----
    python3 shir_pto_calendar_parser_v1.py \
        --received 2026-08-28 \
        --body-file /path/to/body.txt \
        [--section SHIR]

    ... --self-test        # run the built-in regression cases

Output: JSON on stdout.

    {
      "section": "SHIR",
      "anchor": "2026-08-28",
      "found_section": true,
      "entries": [
        {"name": "Denzel M.", "start": "2026-08-20", "end": "2026-08-20",
         "all_day_end_exclusive": "2026-08-21", "days": 1, "raw": "Denzel M.- 20th"}
      ]
    }

`end` is the inclusive last day off. `all_day_end_exclusive` is the same date
plus one day, which is what the Google Calendar API wants for an all-day event's
end.date -- keeping both means the caller never has to do that arithmetic (and
never has to remember that it is exclusive, which is the usual off-by-one here).
"""

import argparse
import json
import re
import sys
from datetime import date, timedelta

# --------------------------------------------------------------------------
# Date-spec grammar
# --------------------------------------------------------------------------

_ORDINAL = r"\d{1,2}(?:st|nd|rd|th)"
_MD = r"\d{1,2}/\d{1,2}"
_ONE = rf"(?:{_MD}|{_ORDINAL})"
_DASH_CHARS = "-‐‑‒–—―"
_DASH = f"[{_DASH_CHARS}]"

# A date spec sits at the end of an entry line, possibly followed by trailing
# decoration (emoji, stray punctuation) that we strip before matching.
_DATE_SPEC_RE = re.compile(rf"({_ONE}(?:\s*{_DASH}\s*{_ONE})?)\s*$")

# Section headings look like "*SHIR:*", "*NEXUS*:", "AVA'S:" -- short, shouty,
# colon-terminated. Lowercase-containing lines ("Contact List:") are not
# headings, which is what keeps the signature block out of the results.
_HEADING_RE = re.compile(r"^([A-Z][A-Z'’&.\- ]{0,24}):$")

_STOP_RE = re.compile(
    r"^(contact list|https?://|--\s*$|best regards|thank you)", re.IGNORECASE
)

_TIME_OFF_MARKER_RE = re.compile(r"approved\s+time\s+off", re.IGNORECASE)


def _clean_line(raw):
    """Normalize one body line: drop quote markers, bold asterisks, trailing junk."""
    line = raw.replace(" ", " ")
    line = re.sub(r"^\s*(?:>\s?)+", "", line)      # quoted-reply markers
    line = line.replace("*", "")                    # gmail plaintext bold
    line = line.strip()
    # Trailing emoji / decoration: strip anything non-ASCII plus loose
    # punctuation from the right, so "Craig Falk - 9/2 🥳" still parses.
    line = re.sub(r"[^\x00-\x7f]+", "", line).strip()
    return line


def _shift_month(year, month, delta):
    idx = (year * 12 + (month - 1)) + delta
    return idx // 12, (idx % 12) + 1


def _candidates(day, month, anchor):
    out = []
    if month is None:
        # Bare ordinal: the month is implied by when the email went out.
        for delta in (-1, 0, 1, 2):
            y, m = _shift_month(anchor.year, anchor.month, delta)
            try:
                out.append(date(y, m, day))
            except ValueError:
                pass
    else:
        # Explicit M/D: only the year is ambiguous (Dec -> Jan rollover).
        for y in (anchor.year - 1, anchor.year, anchor.year + 1):
            try:
                out.append(date(y, month, day))
            except ValueError:
                pass
    return out


def _resolve(day, month, anchor):
    """Pick the calendar date a token most plausibly means.

    These emails announce the *upcoming* week, so a date is almost always at or
    shortly after the send date. We allow a few days back (an email sent Friday
    can cover time off that began Thursday) and prefer the nearest forward date.
    """
    cands = _candidates(day, month, anchor)
    if not cands:
        return None
    floor = anchor - timedelta(days=4)
    return min(cands, key=lambda d: (0 if d >= floor else 1, abs((d - anchor).days)))


def _parse_token(tok):
    """'9/2' -> (2, 9); '21st' -> (21, None). Returns (day, month|None)."""
    tok = tok.strip()
    if "/" in tok:
        m, d = tok.split("/", 1)
        return int(d), int(m)
    return int(re.sub(r"(?:st|nd|rd|th)$", "", tok)), None


def _tidy_name(name):
    name = re.sub(rf"[{_DASH_CHARS}\s]+$", "", name).strip()
    # "Luis Toledo.-" -> "Luis Toledo", but keep the period in "Denzel M."
    if name.endswith("."):
        stem = name[:-1].split()[-1] if name[:-1].split() else ""
        if len(stem) > 2:
            name = name[:-1].rstrip()
    return name


def parse_entry(line, anchor):
    """Parse one 'Name - dates' line. Returns dict or None."""
    cleaned = _clean_line(line)
    if not cleaned or cleaned.lower() in {"none", "n/a"}:
        return None

    m = _DATE_SPEC_RE.search(cleaned)
    if not m:
        return None

    spec = m.group(1)
    name = _tidy_name(cleaned[: m.start(1)])
    if not name:
        return None

    parts = re.split(rf"\s*{_DASH}\s*", spec)
    parts = [p for p in parts if p]

    d0, m0 = _parse_token(parts[0])
    start = _resolve(d0, m0, anchor)
    if start is None:
        return None

    if len(parts) > 1:
        d1, m1 = _parse_token(parts[-1])
        end = _resolve(d1, m1, start)
        # A range must not run backwards; if it does, the end rolled into the
        # next month/year (e.g. "12/30-1/2").
        if end is not None and end < start:
            end = _resolve(d1, m1, start + timedelta(days=20))
        if end is None or end < start:
            end = start
    else:
        end = start

    return {
        "name": name,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "all_day_end_exclusive": (end + timedelta(days=1)).isoformat(),
        "days": (end - start).days + 1,
        "raw": cleaned,
    }


def extract_section(body, section):
    """Return the raw lines under `section` within the APPROVED Time Off block.

    Scoping to that block matters: the Birthday list also carries entity
    prefixes ("Shir- Elan Gordon- 16th"), and those are celebrations, not PTO.
    """
    lines = body.splitlines()

    start_idx = 0
    for i, raw in enumerate(lines):
        if _TIME_OFF_MARKER_RE.search(_clean_line(raw)):
            start_idx = i + 1
            break

    want = section.strip().upper().rstrip(":")
    collected, in_section = [], False

    for raw in lines[start_idx:]:
        cleaned = _clean_line(raw)
        if not cleaned:
            continue
        heading = _HEADING_RE.match(cleaned)
        if heading:
            here = heading.group(1).strip().upper()
            if in_section:
                break
            in_section = here == want
            continue
        if in_section:
            if _STOP_RE.match(cleaned):
                break
            collected.append(cleaned)

    return collected, in_section


def parse_email(body, anchor, section="SHIR"):
    lines, found = extract_section(body, section)
    entries = []
    for line in lines:
        entry = parse_entry(line, anchor)
        if entry:
            entries.append(entry)
    return {
        "section": section.upper(),
        "anchor": anchor.isoformat(),
        "found_section": found,
        "section_lines": lines,
        "entries": entries,
    }


# --------------------------------------------------------------------------
# Regression cases drawn from real emails
# --------------------------------------------------------------------------

_LISSA = """Hello,

 Upcoming Celebrations:

*Birthday:*
Maria Martinez - 9/2
Charles Breeding - 8/29
Craig Falk - 9/2 \U0001f973

*Anniversary:*
None

*APPROVED Time Off:*

*AVA'S:*
None

*DORCHESTER:*
Luis Toledo.- 9/2-9/4

*NEXUS*:
Tony Corsa - 9/3-9/4
Angel Ricardes - 8/31-9/1

*SHIR:*
None

Contact List:
https://docs.google.com/spreadsheets/d/abc/edit
"""

_NANCY = """Here are the upcoming celebrations.

*Birthday:*
Shir- Elan Gordon- 16th HAPPY BIRTHDAY!!!
Alma- Mariela Contreras- 20th

*Anniversary:*
None

*APPROVED Time Off:*

*AVA'S:*
None

*DORCHESTER:*
Mario M.- 17th

*NEXUS*:
Harold D.- 17th-21st
Nancy G.- 20th-21st

*SHIR:*
Denzel M.- 20th
Parth V. 21st

https://docs.google.com/spreadsheets/d/abc/edit

--
Best Regards,

Nancy Garza
1101 S. Capital of TX Hwy. Suite B-220/ Austin, TX 78746
C:443-747-1221
"""

_ROLLOVER = """*APPROVED Time Off:*

*SHIR:*
Jamie R.- 12/30-1/2
Alex T. - 31st
"""


def _self_test():
    failures = []

    def check(label, got, want):
        if got != want:
            failures.append(f"{label}\n     got:  {got}\n     want: {want}")

    # Lissa-style, SHIR is None -> section found, zero entries.
    r = parse_email(_LISSA, date(2026, 8, 28))
    check("lissa/found", r["found_section"], True)
    check("lissa/entries", r["entries"], [])

    # Nancy-style ordinals, including a no-dash separator ("Parth V. 21st").
    r = parse_email(_NANCY, date(2026, 8, 14))
    check("nancy/count", len(r["entries"]), 2)
    check("nancy/0", (r["entries"][0]["name"], r["entries"][0]["start"],
                      r["entries"][0]["end"]), ("Denzel M.", "2026-08-20", "2026-08-20"))
    check("nancy/1", (r["entries"][1]["name"], r["entries"][1]["start"],
                      r["entries"][1]["end"]), ("Parth V.", "2026-08-21", "2026-08-21"))
    check("nancy/exclusive-end", r["entries"][0]["all_day_end_exclusive"], "2026-08-21")

    # The Birthday section must never leak in as PTO.
    check("nancy/no-birthday-leak",
          [e["name"] for e in r["entries"] if "Elan" in e["name"]], [])

    # Year rollover across 12/30-1/2, plus a bare ordinal in the next month.
    r = parse_email(_ROLLOVER, date(2026, 12, 25))
    check("rollover/range", (r["entries"][0]["start"], r["entries"][0]["end"]),
          ("2026-12-30", "2027-01-02"))
    check("rollover/days", r["entries"][0]["days"], 4)
    check("rollover/ordinal", r["entries"][1]["start"], "2026-12-31")

    # Month boundary: email sent Aug 28 announcing Sep dates as bare ordinals.
    r = parse_email("*APPROVED Time Off:*\n\n*SHIR:*\nDana Q.- 2nd-4th\n",
                    date(2026, 8, 28))
    check("boundary/sept", (r["entries"][0]["start"], r["entries"][0]["end"]),
          ("2026-09-02", "2026-09-04"))

    # Trailing emoji and a full surname with a stray period.
    r = parse_email("*APPROVED Time Off:*\n\n*SHIR:*\nLuis Toledo.- 9/2-9/4 \U0001f973\n",
                    date(2026, 8, 28))
    check("emoji/name", r["entries"][0]["name"], "Luis Toledo")
    check("emoji/range", (r["entries"][0]["start"], r["entries"][0]["end"]),
          ("2026-09-02", "2026-09-04"))

    # A missing SHIR section is distinguishable from an empty one.
    r = parse_email("*APPROVED Time Off:*\n\n*NEXUS:*\nBob B.- 3rd\n", date(2026, 8, 28))
    check("missing/found", r["found_section"], False)
    check("missing/entries", r["entries"], [])

    # Quoted-reply bodies still parse.
    quoted = "\n".join("> " + ln for ln in _NANCY.splitlines())
    r = parse_email(quoted, date(2026, 8, 14))
    check("quoted/count", len(r["entries"]), 2)

    if failures:
        print("SELF-TEST FAILED\n")
        for f in failures:
            print("  - " + f)
        return 1
    print("self-test: all cases passed")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--body-file", help="file containing the email plaintext body")
    ap.add_argument("--received", help="date the email was sent, YYYY-MM-DD")
    ap.add_argument("--section", default="SHIR",
                    help="entity heading to read (default: SHIR)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()

    if args.self_test:
        sys.exit(_self_test())

    if not args.received:
        ap.error("--received is required")
    body = (open(args.body_file, encoding="utf-8").read()
            if args.body_file else sys.stdin.read())
    anchor = date.fromisoformat(args.received)
    json.dump(parse_email(body, anchor, args.section), sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
