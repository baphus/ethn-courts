import { test } from "node:test";
import { strict as assert } from "node:assert";
import { checkoutConfig } from "../src/db/checkout-config";

const local = { NODE_ENV: "test", ETHN_ALLOW_LOCAL_DATABASE: "1", ETHN_DATABASE_URL: "postgres://ethn_checkout:secret@127.0.0.1:5432/test" };
test("checkout database configuration fails closed", () => {
  assert.equal(checkoutConfig(local).ssl, false);
  for (const env of [ {}, { ...local, NODE_ENV: "production" }, { ...local, NODE_ENV: "" }, { ...local, ETHN_DATABASE_URL: local.ETHN_DATABASE_URL + "?sslmode=disable" }, { ...local, ETHN_DATABASE_URL: local.ETHN_DATABASE_URL.replace("ethn_checkout", "postgres") }, { ...local, ETHN_DATABASE_URL: local.ETHN_DATABASE_URL.replace("127.0.0.1", "example.com") } ]) {
    assert.throws(() => checkoutConfig(env), /NOT_CONFIGURED/);
  }
});
