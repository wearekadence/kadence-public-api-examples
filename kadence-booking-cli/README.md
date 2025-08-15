# Kadence Booking CLI

Create space bookings in Kadence from a CSV file, using the Kadence Public API.

## Prerequisites

- Node.js 18+
- Kadence Public API credentials
  - Client Credentials OAuth (recommended): `KADENCE_API_KEY_IDENTIFIER` and `KADENCE_API_KEY_SECRET`
  - Or a pre-issued Bearer: `KADENCE_API_TOKEN`

## Install

```bash
npm install
```

## Configuration

Environment variables (create `.env` or export them):

- OAuth (recommended):
  - `KADENCE_API_KEY_IDENTIFIER="<your_key_id>"`
  - `KADENCE_API_KEY_SECRET="<your_key_secret>"`
- Or Bearer token:
  - `KADENCE_API_TOKEN="<your_bearer_token>"`
- Optional overrides:
  - `KADENCE_API_BASE_URL` (default: `https://api.onkadence.co/v1/public`)
  - `KADENCE_LOGIN_BASE_URL` (default: `https://login.onkadence.co`)

See `.env.example`.

## CSV format

Headers (capitalisation required):
- `Email Address`
- `Building Name`
- `Floor Name`
- `Space Name`
- `Space Type` (e.g., `desk`)
- `Date` (YYYY-MM-DD)
- `Start Time` (e.g., `9:00`) — defaults to `09:00` if empty
- `End Time` (e.g., `17:00`) — defaults to `17:00` if empty

Example: see `example.csv`.

## Usage

Dry-run (no booking created):
```bash
node index.js --file ./example.csv --dry-run
```

Create bookings and log failures to a file:
```bash
node index.js --file ./example.csv --log ./failures.csv
```

Options:
- `-f, --file <path>`: path to CSV file (required)
- `--dry-run`: resolve lookups and times but do not create bookings
- `--concurrency <n>`: rows processed in parallel (default: 1)
- `--base-url <url>`: override API base URL
- `--log <path>`: path to CSV log of failures (default: `./kadence-booker-failures.log`)

## How it works

For each CSV row, the CLI:
1. Fetches an OAuth token using client credentials (unless a static bearer is provided).
2. Looks up the user by email.
3. Finds the building, floor, and space by name (optionally matching `Space Type`).
4. Resolves the building's timezone (fallback to fetching building details if needed).
5. Creates a booking from the specified start/end times (defaulting to 09:00–17:00) on the given date.

Failures are appended to the specified `--log` file with row number, input data and error message.