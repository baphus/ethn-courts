# Local origin regression — 2026-11-20

Next 16.4.5: `node node_modules/next/dist/bin/next dev -H 127.0.0.1 -p 41983`, no hosted services. Before repair, POST decision with actual Host and Origin `127.0.0.1:41983` returned 403 `INVALID_ORIGIN`; changing only Origin to `http://localhost:41983` reached 400 `INVALID_INPUT`. Next constructed the request URL with localhost despite the 127 Host. Hosted browser log separately recorded 403 before transaction; this local reproduction identifies the guard mismatch without proving other deployment configurations.

Five guards shared the comparison. The repair uses Host only for a loopback Host when Next's request URL is HTTP localhost; otherwise the original URL comparison remains. Forwarded headers are ignored. Absent Origin remains accepted, and staff identity/authorization remains unchanged. Host must be validated by the deployment edge; no assumption about forwarded Host is made. Production proxy and canonical URL behavior still require separate review and testing.

After repair, local POST decision with matching actual 127 or localhost Host/Origin reached 503 `Service unavailable` with no Auth configured. Cross-origin with hostile forwarded headers returned 403; absent Origin reached 503. No decision transaction was bypassed or executed. Focused test: `node --test --import ./test/register-loader.mjs test/request-origin.test.ts`.
