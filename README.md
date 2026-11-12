# gato-tools

The Gato tools service gives agents retail tools through MCP. [`SPECS.md`](SPECS.md) gives the required behavior. [`AGENTS.md`](AGENTS.md) gives the contributor rules.

## Setup

1. Install Bun `1.4.4-canary.1`. `package.json` sets this version in `packageManager`.
2. Install the dependencies:

   ```sh
   bun install --frozen-lockfile
   ```

## Configuration

The service reads its configuration from environment variables. It does not start when `GATO_TOOLS_MARKET`, `MCP_BEARER_TOKEN`, `GOOGLE_GEOCODING_API_KEY`, or `S3_BUCKET` is missing, or when a value is not valid.

| Variable                   | Required | Value                                                                                           |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `GATO_TOOLS_MARKET`        | Yes      | `MY` or `PH`.                                                                                   |
| `GATO_TOOLS_TIMEZONE`      | No       | An IANA timezone for dates, for example `Asia/Kuala_Lumpur`. The default is `UTC`.              |
| `MCP_BEARER_TOKEN`         | Yes      | The static bearer token that each MCP request must send.                                        |
| `GOOGLE_GEOCODING_API_KEY` | Yes      | The key for the Google Geocoding API.                                                           |
| `GOOGLE_GEOCODING_URL`     | No       | The Geocoding API endpoint. The default is `https://maps.googleapis.com/maps/api/geocode/json`. |
| `S3_BUCKET`                | Yes      | The bucket with the source files.                                                               |
| `S3_ACCESS_KEY_ID`         | Yes      | The access key of the bucket.                                                                   |
| `S3_SECRET_ACCESS_KEY`     | Yes      | The secret key of the bucket.                                                                   |
| `S3_REGION`                | No       | The region of the bucket.                                                                       |
| `S3_ENDPOINT`              | No       | The endpoint of an S3-compatible store, for example Cloudflare R2.                              |
| `PORT`                     | No       | The HTTP port. The default is `3000`.                                                           |

Bun reads the `S3_*` variables (or the `AWS_*` equivalents) for its built-in S3 client. The service only reads the bucket, so the credentials need only the read permission (`s3:GetObject`).

## Run

```sh
bun start
```

The service has these HTTP endpoints:

- `POST /mcp`: MCP over Streamable HTTP, with `Authorization: Bearer <MCP_BEARER_TOKEN>`. The service keeps no session.
- `GET /live`: the liveness check. It does not depend on the sources.
- `GET /health`: the health check. It gives `200` when each source of the deployment has a loaded version and its most recent load succeeded. Otherwise it gives `503` and names the failed sources in `failed_sources`.

The service checks the revision (ETag) of each source file in the bucket every 5 seconds, and loads a changed file. A stop signal (`SIGTERM` or `SIGINT`) stops new requests, lets running requests finish, and then stops the service.

Fixed limits:

- Request text, for example a device description or a location, has a maximum of 200 characters.
- A request body has a maximum of 64 KiB.
- A wait for the Google Geocoding API stops after 5 seconds.
- A wait for the bucket stops after 30 seconds.

## Checks

Run `bun check` before you report work done and before each commit. It runs these steps in order, and stops at the first failure:

1. `bun fmt --check` checks the format.
2. `bun lint` checks the lint rules in `bunfig.toml` and the types. Warnings also fail the check.
3. `bun test` runs the unit tests and the end-to-end tests.

Run `bun fmt` to format the files. The Zed settings in `.zed/settings.json` format with `bun fmt`.

## Tests

- Unit tests are next to the code as `*.test.ts`.
- End-to-end tests are in the top-level `e2e/` folder, in one subfolder for each section of `SPECS.md`. Each test name starts with the `SPECS.md` section that it checks. The tests start the service with `bun src/main.ts`, as it runs in production, with isolated configuration, and use only its HTTP interface.
- Fakes that the test controls replace the external services: `e2e/harness.ts` has a fake S3 bucket and a fake Google Geocoding API. Each fake records the calls it receives.
- The reload tests wait for the 5-second check of the bucket, so the full run takes about 35 seconds.
