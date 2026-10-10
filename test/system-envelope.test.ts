import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseSystemEnvelope } from "../client/system-envelope";

describe("parseSystemEnvelope", () => {
  test("a tag named after an Object.prototype key is not an envelope", () => {
    for (const tag of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      assert.equal(parseSystemEnvelope(`<${tag}>hello</${tag}>`), null, tag);
      assert.equal(parseSystemEnvelope(`<${tag}> reply text`), null, tag);
    }
  });

  test("a known tag still reads as its kind", () => {
    const notice = parseSystemEnvelope("<system-notice>\nBuild finished\n</system-notice>");
    assert.equal(notice?.kind, "notice");
    assert.equal(notice?.title, "Build finished");

    const interrupt = '<system-interrupt reason="x">Stop now</system-interrupt>';
    const reminder = parseSystemEnvelope(interrupt);
    assert.equal(reminder?.kind, "reminder");
  });

  test("an IRC relay names its sender", () => {
    const envelope = parseSystemEnvelope(
      "<irc>\nIncoming IRC message from agent `planner`:\nShip it.\n</irc>",
    );
    assert.equal(envelope?.kind, "message");
    assert.equal(envelope?.title, "Message from planner");
    assert.equal(envelope?.body, "Ship it.");
  });

  test("prose that does not open with a tag stays prose", () => {
    assert.equal(parseSystemEnvelope("Just a reply."), null);
  });
});
