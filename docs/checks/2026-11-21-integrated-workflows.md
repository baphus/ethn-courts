# ETHN integrated workflows check

- `npx --no-install tsc --noEmit`: exit 0.
- `node C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-integrated/verify.mjs`: exit 0; PostgreSQL 18.2 fresh chain 0001–0026, restricted `ethn_checkout`, one integration test passed, zero skipped. Cluster stopped and verified. Evidence: `C:/Users/JKsars/AppData/Local/Temp/opencode/ethn-integrated/run-1795217263453/{result.json,test.log}`.
- Exercises actual DB flows across availability/calendar, private block reason filtering, Open Play block and release guard, hours change rejection with allocations, extension hold and completion gate, due booking completion, sale correction, expense correction, finance aggregation, restricted grants.
- Migration 0027 excluded pending writer completion. Prior 0027 run surfaced accepted extension payment/proof-shape mismatch; parent notified. Hosted DB, mail, storage, and browser remain untested.
- Fixture uses requested boundary-aligned all-week schedule. Extension parent must have started while final allocation remains future; extension starts contiguously.
