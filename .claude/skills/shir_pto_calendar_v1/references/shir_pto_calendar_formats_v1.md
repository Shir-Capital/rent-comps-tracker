# Email format reference

Read this when the parser returns something surprising, when `found_section` is
false, or when you need to hand-check a date it produced.

## Contents

- [The two senders](#the-two-senders)
- [Overall shape](#overall-shape)
- [Date notations seen in the wild](#date-notations-seen-in-the-wild)
- [How a bare ordinal gets a month](#how-a-bare-ordinal-gets-a-month)
- [Name handling](#name-handling)
- [Things that must not be parsed as PTO](#things-that-must-not-be-parsed-as-pto)
- [Changing the parser](#changing-the-parser)

## The two senders

| Sender | Address | Style |
|---|---|---|
| Nancy Garza | ngarza@pghnexus.com | Bare ordinals (`20th`), heavily abbreviated surnames (`Denzel M.`) |
| Lissa Hall | lhall@pghnexus.com | Slash dates (`9/2`), fuller names (`Luis Toledo`) |

Both open with a line like "Here are the upcoming celebrations." and both link
the same Contact List spreadsheet at the bottom. Either may send in a given
week, so the parser handles both notations in the same pass rather than
branching on sender.

## Overall shape

```
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

*SHIR:*
Denzel M.- 20th
Parth V. 21st
```

Entity headings are short, uppercase, and colon-terminated. Gmail's plaintext
rendering wraps bold in asterisks, and the asterisk placement is not consistent
(`*SHIR:*` vs `*NEXUS*:`), so the parser strips all asterisks before matching.

A section with nobody out reads `None`.

## Date notations seen in the wild

| Written | Means |
|---|---|
| `20th` | single day, month inferred |
| `21st` (no dash after the name) | single day — the separator is optional |
| `17th-21st` | inclusive range |
| `9/2` | Sept 2 |
| `9/2-9/4` | Sept 2 through Sept 4 inclusive |
| `8/31-9/1` | range crossing a month boundary |
| `None` | nobody out |

Ranges are inclusive on both ends. Dashes appear as ASCII hyphen, en dash, and
em dash; the parser accepts all of them.

Trailing emoji (`Craig Falk - 9/2 🥳`) and stray periods after a surname
(`Luis Toledo.- 9/2-9/4`) both occur and are stripped.

## How a bare ordinal gets a month

`20th` alone is ambiguous. The parser resolves it against the date the email was
sent: it generates candidates in the previous, current, and next two months and
picks the nearest one that is not more than 4 days before the send date.

This works because these emails always announce the *upcoming* week. The
4-day backward tolerance covers a Friday email that mentions time off already
underway.

The case that makes this necessary: the email sent **Friday 28 August 2026**
covers "August 29th – September 4th". An entry reading `2nd` means **September**
2nd, not August 2nd. Anchoring on the send date gets this right; reading the
ordinal literally against the send month does not.

Explicit `M/D` dates only need a year, resolved the same way — which is what
makes `12/30-1/2` land on Dec 30 → Jan 2 across the new year.

If a range's end resolves earlier than its start, the parser re-resolves the end
one month forward, then falls back to a single-day event rather than emitting a
backwards range.

## Name handling

Names are taken verbatim, minus trailing separators. A trailing period is kept
when it marks an initial (`Denzel M.`) and dropped when it is just stray
punctuation after a real surname (`Luis Toledo.` → `Luis Toledo`). The rule is
whether the last token before the period is longer than two characters.

Do not expand abbreviations by guessing. `Parth V.` on the calendar is more
honest than a confidently wrong full name. The Contact List spreadsheet linked
in every email is the place to look if a full name is genuinely needed.

## Things that must not be parsed as PTO

- **The Birthday section.** It carries entity prefixes too (`Shir- Elan Gordon-
  16th`), and those look a lot like PTO lines. The parser only reads below the
  `APPROVED Time Off:` marker for this reason.
- **Other entities.** AVA'S, DORCHESTER, and NEXUS are different teams.
- **The signature block.** Phone numbers and street addresses contain digits and
  slashes (`Suite B-220/ Austin`). The parser stops at the Contact List URL,
  `--`, or "Best Regards".
- **Quoted replies.** Colleagues reply with congratulations, quoting the whole
  original with `>` prefixes. The parser strips those markers, but prefer the
  original message anyway.

## Changing the parser

`scripts/shir_pto_calendar_parser_v1.py --self-test` runs regression cases built
from real emails: both senders' styles, the None case, the month boundary, the
year rollover, emoji, quoted bodies, and a missing section. Add a case there
before changing the date logic — these rules are easy to "fix" in a way that
quietly breaks a format that was working.
