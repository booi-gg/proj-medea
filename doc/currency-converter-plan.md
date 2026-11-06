# Medea currency converter

## Context

Typing a conversion like `100 usd to inr` into search should show the answer as a row, and Enter should copy it, the same way the calculator row works for sums.

The calculator row is built on every keystroke and is synchronous, so search can't wait on the network. Rates have to come from a local file that is refreshed in the background.

This would be Medea's first network call. It only requests one fixed URL, so amounts and search text never leave the Mac. It needs no new dependencies, because Node has `fetch` built in.

## Decisions

1. An explicit target is required. Target codes autocomplete as they are typed, including substring matches such as `SD` → USD.
2. Codes and literal symbols work. Ambiguous `$` maps to USD and `¥` maps to JPY.
3. This work was done before `doc/logging-plan.md`.

## API

Use Frankfurter v2. It needs no API key or signup and has no daily or monthly quota, only rate limiting to prevent abuse.

```text
GET https://api.frankfurter.dev/v2/rates?base=USD
```

One call returns every rate, and any pair can be worked out from it. Each row looks like this:

```json
{ "date": "2026-11-07", "base": "USD", "quote": "INR", "rate": 94.19 }
```

Tested on 2026-11-07: 181 rows, 11 KB, 31 ms. The docs say 239 currencies, so not all of them come back for a USD base.

- **Use v2, not v1.** v1 is deprecated and only returned about 30 currencies.
- **Dates differ by currency.** `date` is per row, so the rate date shown has to come from the rows being used.
- **The list includes some crypto**, such as ADA.
- **These are daily reference rates**, not live market prices or what a bank would charge. USD to INR came back as 94.19 on v2 and 93.92 on v1 on the same day, so the row should show the rate date.

`open.er-api.com/v6/latest/USD` is the backup. It also needs no key and worked when tested, but write-ups say attribution is expected and disagree on its limits. Its terms have not been read.

## Approach

Everything lives in a new `src/medea-apps/medea-currency/` folder, with tests next to the files they cover.

### Parser

- A pure function reads `100 usd to inr`, `100 usd in inr`, and symbol forms such as `$100 to inr`.
- It returns undefined for anything else, because most search text isn't a conversion.
- Currency codes are case-insensitive, and are checked against the saved rates.

### Rates file

- Save the rates to `~/.config/medea/medea-currency-rates.json`, with its path in `paths.ts`.
- Read it synchronously, so search can use it on every keystroke.
- Pairs are worked out through the USD rates, so `eur to inr` is the INR rate divided by the EUR rate.

### Daily refresh

- When search opens, refresh in the background if the file is over a day old.
- Use a short timeout, and never hold up the search window.
- If a refresh fails, keep the old rates. The row shows their date, so old rates are visible.
- Write the file in one step, so a failed refresh can't leave it half-written.

### Search row

- Add `toConversionItems(query)` beside `toCalculationItem`, with a row like `100 USD = 9,419 INR`, the rate date and `↵ copy`. An incomplete target code offers matching currencies.
- `src/launcher/launcher.ts` calls the calculator in two places: `rankWithCalculation` and the selection handling in `runSearchRound`. Both need to check for a conversion too.
- Enter copies the number with `copyText`.

### Docs

Update `doc/how-it-works.md` and `doc/roadmap.md`.

## Edge cases

- **First run:** there are no rates until the first download finishes, so that case needs a clear message.
- **Offline:** conversions keep working from the saved rates.
- **Unknown code:** `100 usd to xyz` shows no row, so normal search results still appear.
- **Broken rates file:** it reads as no rates, and the next refresh replaces it, the same way a broken config reads as empty.

## Tests

- Parser: both phrasings, upper and lower case, and text that isn't a conversion.
- Conversion: pairs worked out through USD, and rounding.
- Rates file: a missing, broken or old file.
- Refresh: a failed download leaves the saved rates alone. Tests must not call the real API.

## Sources

- [Frankfurter docs](https://frankfurter.dev/)
- [ExchangeRate-API free docs](https://www.exchangerate-api.com/docs/free)
