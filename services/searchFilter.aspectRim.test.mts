/**
 * Tests for the ADDITIVE aspect+rim (width-omitted) size fallback.
 * These are NEW tests and do not touch any existing behavior.
 *
 * Run: node --test services/searchFilter.aspectRim.test.mts
 * (Node ≥22.18 strips TS types automatically; searchFilter.ts has no imports.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { queryProducts, parseAspectRim } from "./searchFilter.ts";

const FIELDS = ["name", "brand", "size", "plain_size", "sku"];
const opts = { searchableFields: FIELDS, sortableFields: ["size"], defaultSortField: "size" as const };

const data = [
  { sku: "A", name: "Michelin 205/55 R16", brand: "Michelin", size: "205/55 R16", plain_size: "2055516" },
  { sku: "B", name: "Pirelli 195/55 R16", brand: "Pirelli", size: "195/55 R16", plain_size: "1955516" },
  { sku: "C", name: "Nexen 215/55 R16", brand: "Nexen", size: "215/55 R16", plain_size: "2155516" },
  { sku: "D", name: "Dunlop 205/55 R17", brand: "Dunlop", size: "205/55 R17", plain_size: "2055517" }, // rim 17
  { sku: "E", name: "Goodyear 195/65 R15", brand: "Goodyear", size: "195/65 R15", plain_size: "1956515" },
  { sku: "F", name: "Kumho 205/60 R16", brand: "Kumho", size: "205/60 R16", plain_size: "2056016" }, // aspect 60
];
const skus = (r: { items: { sku: string }[] }) => r.items.map((i) => i.sku).sort();

test("parseAspectRim parses width-omitted queries only", () => {
  assert.deepEqual(parseAspectRim("55R16"), { aspect: "55", rim: "16" });
  assert.deepEqual(parseAspectRim("55 R16"), { aspect: "55", rim: "16" });
  assert.deepEqual(parseAspectRim("55ZR16"), { aspect: "55", rim: "16" });
  assert.equal(parseAspectRim("205/55R16"), null); // full size → not a fallback
  assert.equal(parseAspectRim("michelin"), null);
  assert.equal(parseAspectRim("195"), null);
});

test("Case 1 — full size 205/55R16 uses EXACT matching, unchanged", () => {
  const r = queryProducts(data, { search: "205/55R16", ...opts });
  assert.deepEqual(skus(r), ["A"]); // only the exact size, NOT broader 55R16
  assert.equal(r.isPartialSizeMatch, false);
  assert.equal(r.matchedPattern, "205/55R16");
});

test("Case 2 — width-omitted 55R16 falls back to aspect+rim", () => {
  const r = queryProducts(data, { search: "55R16", ...opts });
  assert.deepEqual(skus(r), ["A", "B", "C"]); // all X/55 R16, excludes R17 (D) and aspect 60 (F)
  assert.equal(r.isPartialSizeMatch, true);
  assert.equal(r.matchedPattern, "55R16");
  assert.equal(r.total, 3);
});

test("Case 3 — 65R15 falls back to aspect 65 + rim 15", () => {
  const r = queryProducts(data, { search: "65R15", ...opts });
  assert.deepEqual(skus(r), ["E"]);
  assert.equal(r.isPartialSizeMatch, true);
  assert.equal(r.matchedPattern, "65R15");
});

test("fallback NEVER triggers when exact matching has results", () => {
  const r = queryProducts(data, { search: "195/65R15", ...opts });
  assert.deepEqual(skus(r), ["E"]);
  assert.equal(r.isPartialSizeMatch, false); // exact owns it, no broadening
});

test("exact width search still works and stays non-partial", () => {
  const r = queryProducts(data, { search: "195", ...opts });
  assert.deepEqual(skus(r), ["B", "E"]); // width 195
  assert.equal(r.isPartialSizeMatch, false);
});

test("brand search unaffected by the fallback", () => {
  const r = queryProducts(data, { search: "michelin", ...opts });
  assert.deepEqual(skus(r), ["A"]);
  assert.equal(r.isPartialSizeMatch, false);
});
