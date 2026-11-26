import test from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { buildCashWorkbook } from "../src/lib/admin/finance-cash-workbook.ts";

test("cash XLSX preserves signed centavos and separates summary from ledger", async () => {
  const sheets = buildCashWorkbook({
    from: "2026-11-20", to: "2026-11-21", generated: "2026-11-22",
    totals: { bookingPayments: "0.00", otherSales: "-1.05", expenses: "0.00", refunds: "0.00", net: "-1.05" },
    entries: [{ date: "2026-11-21", kind: "Sale correction", id: "entry", reference: "sale", method: null,
      category: null, amount: "-1.05", cashDelta: "-2.00", gcashDelta: "0.95" }],
  });
  assert.deepEqual(sheets.map(sheet => sheet.sheet), ["Summary", "Ledger"]);
  assert.deepEqual(sheets[0].data[8]?.[1], { value: -1.05, format: "#,##0.00" });
  assert.deepEqual(sheets[1].data[1]?.slice(6), [-1.05, -2, 0.95].map(value => ({ value, format: "#,##0.00" })));
  const data = await writeXlsxFile(sheets).toBuffer();
  assert.equal(data.toString("ascii", 0, 2), "PK");
  assert.ok(data.includes(Buffer.from("xl/worksheets/sheet2.xml")));
});
