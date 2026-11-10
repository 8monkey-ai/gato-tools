# gato-tools

The Gato tools service gives agents retail tools through MCP. [`SPECS.md`](SPECS.md) gives the required behavior. [`AGENTS.md`](AGENTS.md) gives the contributor rules.

## Setup

1. Install Bun `1.4.4-canary.1`. `package.json` sets this version in `packageManager`.
2. Install the dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

## Commands

| Command     | What it does                                                        |
| ----------- | ------------------------------------------------------------------- |
| `bun start` | Starts the service. It reads environment variables.                 |
| `bun check` | Checks the format, lints, checks the types, and runs all tests.     |
| `bun fmt`   | Formats the files. The Zed settings in `.zed/settings.json` use it. |

Run `bun check` before you report work done and before each commit. It runs these steps in order, and stops at the first failure:

1. `bun fmt --check` checks the format.
2. `bun lint` checks the lint rules in `bunfig.toml` and the types. Warnings also fail the check.
3. `bun test` runs the unit tests and the end-to-end tests.

## Tests

- Unit tests are next to the code as `*.test.ts`.
- End-to-end tests are in the top-level `e2e/` folder. A test starts the service as a process with environment variables, and uses only its MCP endpoint, `/health`, its logs, and its calls to object storage and to the location service.
- Fake HTTP servers replace object storage and the Google Geocoding API (`e2e/support/`). Each fake records the calls it receives.
- Each test name starts with the `SPECS.md` section that it checks.

## Code layout

| Folder or file       | Responsibility                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| `src/main.ts`        | Assembles the system and owns startup and shutdown.                            |
| `src/config.ts`      | The settings that all tools share, and the market table.                       |
| `src/http.ts`        | The MCP endpoint with its bearer token, and `/health`.                         |
| `src/sources/`       | Loaded versions of object-storage sources, the S3 adapter, and CSV reading.    |
| `src/preparation.ts` | Feed preparation runs that repeat and never overlap.                           |
| `src/matching/`      | The device vocabulary, the query parser, and model and specification matching. |
| `src/tools/tool.ts`  | The tool abstraction.                                                          |
| `src/tools/<tool>/`  | One folder for each tool: its settings, sources, preparation, and rules.       |
| `config/`            | Stock feed mappings for each market.                                           |

To add a tool, add a folder in `src/tools/` with a `ToolFactory`, and add the factory to the list in `src/main.ts`. The tool reads its own environment variables. A factory that returns nothing makes the tool unavailable in the market of the deployment.

## Configuration

All configuration is in environment variables. Invalid values stop the startup with a message that names the variable.

### Service

| Variable                            | Default    | Meaning                                                              |
| ----------------------------------- | ---------- | -------------------------------------------------------------------- |
| `MARKET`                            | (required) | `MY` or `PH`. It sets the currency and the default country.          |
| `TIMEZONE`                          | `UTC`      | IANA timezone for today's date. The market does not change it.       |
| `HTTP_PORT`                         | `3000`     | Port of `/mcp` and `/health`.                                        |
| `MCP_BEARER_TOKEN`                  | (required) | Static bearer token that MCP clients send. At least 16 characters.   |
| `SOURCE_MAX_AGE_SECONDS`            | `300`      | Age of a loaded source version after which a query starts a refresh. |
| `FEED_PREPARATION_INTERVAL_SECONDS` | `300`      | Time from the end of one feed preparation to the start of the next.  |

### Object storage

The service reads every source from one S3-compatible bucket, with path-style addresses.

| Variable               | Default    | Meaning                    |
| ---------------------- | ---------- | -------------------------- |
| `S3_ENDPOINT`          | (required) | Endpoint URL.              |
| `S3_BUCKET`            | (required) | Bucket name.               |
| `S3_REGION`            | `auto`     | Region for the signatures. |
| `S3_ACCESS_KEY_ID`     | (required) | Access key.                |
| `S3_SECRET_ACCESS_KEY` | (required) | Secret key.                |

### Device availability (`check_availability`)

| Variable                   | Default                    | Meaning                                                                                                      |
| -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `STOCK_FEED_KEY`           | (required)                 | Object key of the prepared stock feed that the tool serves.                                                  |
| `STOCK_EXPORT_KEY`         | (none: no publication)     | Object key of the stock export. With it, the service prepares the feed and publishes it to `STOCK_FEED_KEY`. |
| `STOCK_FEED_MAPPINGS_FILE` | (required with the export) | Path of the stock feed mappings of the market, for example `config/stock-feed-mappings.MY.json`.             |

### Sale or trade-in value (`check_sale_or_trade_in_value`, MY only)

| Variable                 | Default                    | Meaning                                                                     |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------- |
| `TRADE_IN_REFERENCE_KEY` | (required in MY)           | Object key of the trade-in reference that the tool serves.                  |
| `TRADE_IN_EXPORT_KEY`    | (none: no publication)     | Object key of the trade-in export. With it, the service prepares the feed.  |
| `TRADE_IN_FEED_KEY`      | (required with the export) | Object key of the prepared trade-in feed. It must not be the reference key. |

### Promotions (`check_promotions`)

| Variable        | Default    | Meaning                          |
| --------------- | ---------- | -------------------------------- |
| `CAMPAIGNS_KEY` | (required) | Object key of the campaign file. |

### Store discovery (`find_closest_store`)

| Variable                    | Default                                             | Meaning                            |
| --------------------------- | --------------------------------------------------- | ---------------------------------- |
| `STORES_KEY`                | (required)                                          | Object key of the store reference. |
| `GOOGLE_MAPS_API_KEY`       | (required)                                          | Key for the Google Geocoding API.  |
| `GOOGLE_MAPS_GEOCODING_URL` | `https://maps.googleapis.com/maps/api/geocode/json` | Address of the Geocoding API.      |

## Source data

Operations publish these files in the bucket. Each file replaces the previous version in one write, so the service never reads a partial version. An empty file is valid and has no rows.

### Stock export and stock feed

The stock export is a CSV file. The service removes the spaces from the column names, so `Total Stock` and `TotalStock` are the same column. The export must have the columns `Category`, `Model`, `Condition`, `TotalStock`, and `RetailPrice`, and each column that the mappings name. Optional columns: `Color`, `Storage`, `Size`, `Chipset`, `Connectivity`, `CaseMaterial`, `Generation`, `Year`, `RAM`, `PromotionPrice`, `LastMonthPrice`, `CheckoutLink`, and `VideoLink` (comma-separated links, `0` for no link). The values `N/A` and `Ask Store` are blank.

The stock feed mappings file is JSON:

```json
{
  "products": {
    "U_IPHONE": { "category": "iPhone" },
    "U_IPAD_WC": {
      "category": "iPad",
      "specs": { "connectivity": "WiFi+Cellular" }
    }
  },
  "branches": [
    { "column": "LowYatPlaza", "name": "[Klang Valley] Low Yat Plaza" }
  ],
  "prices": [
    { "column": "SpaylaterPrice", "name": "spaylater_price", "monthly": true }
  ]
}
```

- `products` maps each export `Category` code to a catalogue category. Preparation skips rows with other codes. `specs` gives fixed specifications, for example the connectivity of a product code.
- `branches` gives the branch columns and their names, in the order that results show them.
- `prices` gives more price columns, for example bundle and payment-plan prices. Results show a `monthly` price with `/month`, with its supplied value.

Preparation removes the supplied specifications from the product name to get the model, and reads the specifications that the export does not supply from the name, for example the connectivity and the size of an Apple Watch. The prepared stock feed is a JSON list. It is the format that the tool reads at `STOCK_FEED_KEY`.

### Trade-in export, prepared feed, and reference

The trade-in export is a CSV file with the columns `Category`, `ModelName`, and `Price`, and optionally `ModelNumber`, `Display`, `Storage`, `Year`, `Generation`, and `Chipset`. The categories are `Macbook`, `Pad`, `PHONE`, and `SAMSUNG`. Preparation skips other categories.

The prepared feed and the reference are CSV files with the columns `Category`, `Model`, `Generation`, `ModelNumber`, `Size`, `Storage`, `Year`, `Chipset`, `Material`, `Connectivity`, and `TradeinPrice`. Only `Category` and `Model` are required in the reference. To put a prepared feed in service, copy it to `TRADE_IN_REFERENCE_KEY`.

### Campaigns

The campaign file is a YAML list:

```yaml
- name: Raya Sale
  description: RM200 off purchases above RM3000
  voucher_code: RAYA2026
  discount_type: fixed # or percentage
  discount_value: 200
  min_spend: 3000 # default 0
  start_date: 2026-03-01 # optional, inclusive
  end_date: 2026-03-31 # optional, inclusive
  stackable: false # default false: the offer cannot be combined
  priority: 1 # default 0: lower numbers come first
  eligible_models: [iPhone 17 Pro] # optional
```

`name`, `discount_type`, and `discount_value` are required. A file with a campaign that does not have them is unusable.

### Store reference

The store reference is a CSV file with the columns `Store Name`, `Address`, `Gmaps Link`, `Phone Number`, `Operating Hours`, `State`, `Latitude`, and `Longitude`. Each store must have a numeric latitude and longitude.

## Operations

- MCP clients connect to `POST /mcp` with Streamable HTTP and the header `Authorization: Bearer <MCP_BEARER_TOKEN>`. The endpoint is stateless.
- A tool gives a business result, for example "No devices match the request.", as a normal result. Missing or unusable data and location-service failures are tool errors.
- `GET /health` gives the market, the timezone, and for each source its key, serving revision, load time, age in seconds, and latest failure. It also gives the latest run of each feed preparation.
- At startup, the service runs each enabled feed preparation once, then loads each source. A failure does not stop the startup: the other tools stay usable, and each query tries to load the missing source again.
- Logs are JSON lines on standard output. Configured secrets are replaced with `[secret]`.
- On `SIGTERM`, the service waits for running preparations, and then stops.
- The container image is in `Dockerfile`. It contains `config/`.

## Platform limits and decisions

- The S3 client of Bun has no request timeout. The service signs a URL for each request and sends it with `fetch`, with a timeout of 10 seconds. Geocoding requests also have a timeout of 10 seconds.
- After a failed refresh, the service tries again when the source is older than `SOURCE_MAX_AGE_SECONDS` from the failed attempt, not at each query.
- An environment that shares production sources leaves `STOCK_EXPORT_KEY` and `TRADE_IN_EXPORT_KEY` unset, so that it publishes nothing.
- A preparation fails, and publishes nothing, when the export does not have a required or mapped column.
- The trade-in export categories are a fixed set, because only the Malaysian market offers trade-in.
- Google Geocoding status `ZERO_RESULTS` is an unrecognized location. Other statuses and HTTP errors are location-service failures. Each failure is logged as `geocoding.failed`.
- Distances use a sphere with a radius of 6371 km.
- A description that names only a category, for example "iPhone" or "Galaxy", searches the whole category. "MacBook", "iMac", and "Mac mini" stay model names.
- A request with no number in the model, for example "iPad Air" or "Galaxy Z Fold", matches the numbered models of that line and its sub-lines, for example "iPad Air 5". It does not match a sibling line, for example "Galaxy Z Flip7".
- Matching tolerates a spelling mistake when the model numbers are the same, and the two names differ by at most 15% of their length (Levenshtein distance).
- Chipsets such as A15 are read only for Apple categories, so that "Galaxy A15" stays a Samsung model.
