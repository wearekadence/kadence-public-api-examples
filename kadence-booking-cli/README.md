# Kadence Booking CLI

Create desk bookings in Kadence from a CSV file, using the Kadence Public API.

## Prerequisites

- Node.js 18+
- Kadence Public API credentials (Bearer token or API key identifier + secret)

## Install

```bash
npm install
```

## Configuration

Set credentials via environment variables (use one of the following):

- Bearer token
  - `KADENCE_API_TOKEN="<your_bearer_token>"`
- Or Basic Auth (key identifier + secret)
  - `KADENCE_API_KEY_IDENTIFIER="<your_key_id>"`
  - `KADENCE_API_KEY_SECRET="<your_key_secret>"`

Optional:
- `KADENCE_API_BASE_URL` (defaults to `https://api.kadence.co/v1/public`)

You can create a `.env` file in this directory. See `.env.example`.

## CSV format

The CSV must contain these columns (case-insensitive aliases supported):
- `email address`
- `building name`
- `floor name`
- `desk name`

Example: see `example.csv`.

## Usage

```bash
node index.js --file ./example.csv --date 2025-08-15
```

Options:
- `-f, --file <path>`: path to CSV file (required)
- `-d, --date <YYYY-MM-DD>`: booking date in the building's timezone (default: today in building timezone)
- `--dry-run`: resolve lookups and times but do not create bookings
- `--concurrency <n>`: number of rows to process in parallel (default: 1)
- `--base-url <url>`: override API base URL

## How it works

For each CSV row, the CLI:
1. Looks up the user by email.
2. Finds the building, floor, and desk by name.
3. Reads the building timezone.
4. Creates a booking from 09:00 to 17:00 local time on the specified date.

## Notes

- Timezone calculation uses the building's timezone when available, falling back to UTC.
- The CLI tries multiple common API shapes (Hydra collections, related filters) to improve compatibility.
- If you're unsure of the correct credentials or endpoints, consult the Kadence Public API docs at https://api.kadence.co.