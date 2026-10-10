import assert from "node:assert/strict";
import { test } from "node:test";
import { formatAge, formatBytes, formatDuration } from "../client/components/format";

test("durations round before they split", () => {
  assert.equal(formatDuration(820), "820ms");
  assert.equal(formatDuration(1440), "1.4s");
  assert.equal(formatDuration(9990), "10s");
  assert.equal(formatDuration(59990), "1m");
  assert.equal(formatDuration(119700), "2m");
  assert.equal(formatDuration(125000), "2m 5s");
  assert.equal(formatDuration(3780000), "1h 3m");
  assert.equal(formatDuration(-1), "");
});

test("ages are coarse", () => {
  const now = 1_000_000_000;
  assert.equal(formatAge(now - 1000, now), "just now");
  assert.equal(formatAge(now - 12_000, now), "12s ago");
  assert.equal(formatAge(now - 5 * 60_000, now), "5m ago");
  assert.equal(formatAge(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(formatAge(now - 72 * 3_600_000, now), "3d ago");
});

test("bytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(3.2 * 1024 * 1024), "3.2 MB");
});
