import test from "node:test";
import assert from "node:assert/strict";
import { applySync, emptyStore, rowCount, tokenMatches } from "../server/syncCore.mjs";

test("push, pull, last-writer-wins and echo suppression", () => {
  const store = emptyStore();
  let r = applySync(store, 0, [{ collection: "weights", row: { id: "w1", kg: 80, updatedAt: 10 } }]).result;
  assert.equal(r.seq, 1); assert.equal(r.changes.length, 0, "own push is not echoed");
  // device B pulls from 0 and pushes an older edit of w1 (rejected) and a new row
  r = applySync(store, 0, [{ collection: "weights", row: { id: "w1", kg: 70, updatedAt: 5 } }, { collection: "entries", row: { id: "e1", updatedAt: 20 } }]).result;
  assert.equal(r.accepted, 1);
  assert.deepEqual(r.changes.map((c) => c.row.id), ["w1"]);
  assert.equal(store.collections.weights.w1.row.kg, 80, "older write loses");
  // device A pulls since seq 1 → gets e1 only
  r = applySync(store, 1, []).result;
  assert.deepEqual(r.changes.map((c) => c.row.id), ["e1"]);
  assert.equal(rowCount(store), 2);
  // tombstone propagates like any row
  applySync(store, 0, [{ collection: "weights", row: { id: "w1", kg: 80, updatedAt: 30, deletedAt: 30 } }]);
  assert.equal(applySync(store, 2, []).result.changes[0].row.deletedAt, 30);
  // unknown collections ignored
  assert.equal(applySync(store, 0, [{ collection: "hack", row: { id: "x", updatedAt: 1 } }]).result.accepted, 0);
});

test("token compare", () => {
  assert.equal(tokenMatches("abc", "abc"), true);
  assert.equal(tokenMatches("abd", "abc"), false);
  assert.equal(tokenMatches("", "abc"), false);
});
