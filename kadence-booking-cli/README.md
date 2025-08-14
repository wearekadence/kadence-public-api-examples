# Kadence Booking CLI

Create desk bookings in Kadence from a CSV file, using the Kadence Public API.

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

Required columns (case-insensitive aliases supported):
- `email address`
- `building name`
- `floor name`
- `desk name`
- `date` (YYYY-MM-DD, in the building's local timezone)

Example: see `example.csv`.

## Usage

Dry-run (no booking created):
```bash
node index.js --file ./example.csv --dry-run
```

Create bookings:
```bash
node index.js --file ./example.csv
```

Options:
- `-f, --file <path>`: path to CSV file (required)
- `--dry-run`: resolve lookups and times but do not create bookings
- `--concurrency <n>`: rows processed in parallel (default: 1)
- `--base-url <url>`: override API base URL

## How it works

For each CSV row, the CLI:
1. Fetches an OAuth token using client credentials (unless a static bearer is provided).
2. Looks up the user by email.
3. Finds the building, floor, and desk by name.
4. Resolves the building's timezone (fallback to fetching building details if needed).
5. Creates a booking from 09:00 to 17:00 local time on the given date.

## Notes

- Endpoints used: `/buildings`, `/floors`, `/spaces`, `/users`, `/bookings` at `https://api.onkadence.co/v1/public`.
- Time conversion uses the building timezone; sends UTC ISO timestamps.
- Error messages include HTTP status + API details for easier debugging.