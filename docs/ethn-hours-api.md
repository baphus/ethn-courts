# Owner hours API

`GET /api/ethn/admin/hours` returns the owner-only settings snapshot: `version`, read-only `merchant`, `intervalMinutes`, `minimumMinutes`, `anchorMinutes`, `horizonDays`, `holdMinutes`, and all `courts` with `id`, `name`, `active`, and `hours`. Each hours row has `id`, `weekday` (0–6), `opens`, `closes`, and `hourlyRate` (decimal string or null). Times from GET may include seconds.

`PUT /api/ethn/admin/hours` replaces all courts' hours and active flags, using the current snapshot version. It does not update merchant, court names, or other settings. Send JSON of at most 65536 UTF-8 bytes, with exactly these fields:

```json
{"version":"1","courts":[{"id":"1","active":true,"hours":[{"weekday":0,"opens":"07:00","closes":"20:00","hourly_rate":"150.00"}]}]}
```

Include every court, including inactive courts. Convert each GET row explicitly: remove `id`, rename `hourlyRate` to `hourly_rate`, and reduce `opens` and `closes` to `HH:mm`; omit court `name` and all read-only settings. GET's camel-case rate and PUT's snake-case rate are different. Successful PUT returns `{"version":"2"}`; reload GET for the new snapshot.

Both operations require an enabled owner. Responses use `private, no-store`. PUT rejects mismatched Origin. Errors: 400 `INVALID_INPUT` or `INVALID_SCHEDULE`; 401 `UNAUTHENTICATED`; 403 `FORBIDDEN`; 409 `STALE_VERSION` or `HOURS_CONFLICT`; 503 `Service unavailable`. A conflict means a live occupied range would no longer fit; reload before retrying a stale version. Authentication configuration or database failures return a safe 503.
