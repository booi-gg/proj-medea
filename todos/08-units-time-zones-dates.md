# Units, time zones and dates

**Effort:** small to medium

## What

Building on the calculator and currency conversion:

- Units: `5 km in miles`, `72 f to c`, `2 GB in MB`
- Time zones: `3pm PST in Tokyo`, `time in London`
- Dates: `days until dec 25`, `today + 90 days`

## How

- Units: a small table of factors, plus temperature as a special case.
- Time zones: `Intl.DateTimeFormat` handles zones with no extra library. Map city names to zones.
- Dates: a small parser for common phrases. Avoid a big library to keep start-up fast.
