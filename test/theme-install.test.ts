import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installShared } from "../client/components/shared-install";

// The page-level styles (fonts, blur, glow, find) install through this count.
describe("installShared", () => {
  test("installs once and removes on the last release", () => {
    let installs = 0;
    let disposals = 0;
    const install = () => {
      installs += 1;
      return () => {
        disposals += 1;
      };
    };
    const first = installShared("test-count", install);
    const second = installShared("test-count", install);
    assert.equal(installs, 1);

    first();
    assert.equal(disposals, 0, "the other holder still needs it");
    second();
    assert.equal(disposals, 1);

    const third = installShared("test-count", install);
    assert.equal(installs, 2, "a later install starts fresh");
    third();
  });

  test("a repeated release counts once", () => {
    let disposals = 0;
    const install = () => () => {
      disposals += 1;
    };
    const first = installShared("test-repeat", install);
    const second = installShared("test-repeat", install);
    first();
    first();
    assert.equal(disposals, 0);
    second();
    assert.equal(disposals, 1);
  });

  test("keys are independent, and the count survives a second copy of the module", async () => {
    let disposals = 0;
    const install = () => () => {
      disposals += 1;
    };
    const copy = (await import(
      `../client/components/shared-install.ts?copy=${Date.now()}`
    )) as typeof import("../client/components/shared-install");
    const fromFirst = installShared("test-copy", install);
    const fromCopy = copy.installShared("test-copy", install);
    const other = installShared("test-other", install);
    fromFirst();
    assert.equal(disposals, 0);
    fromCopy();
    assert.equal(disposals, 1);
    other();
    assert.equal(disposals, 2);
  });
});
