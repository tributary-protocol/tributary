import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const umdPath = join(__dirname, "dist", "tributary-sdk.umd.js");

function createScope() {
  const scope = {
    TextEncoder: globalThis.TextEncoder,
    TextDecoder: globalThis.TextDecoder,
  };
  scope.globalThis = scope;
  return scope;
}

test("UMD bundle exposes Tributary global with expected exports", () => {
  const code = readFileSync(umdPath, "utf8");

  const scope = createScope();
  // esbuild with --global-name=Tributary produces `var Tributary = ...`
  // We can capture it by appending `return Tributary;`
  const fn = new Function("self", "window", "globalThis", code + "\nreturn Tributary;");
  const Tributary = fn(scope, scope, scope);

  assert.ok(Tributary, "Tributary global should be defined");

  const expected = [
    "Client",
    "networks",
    "Errors",
    "validateShares",
    "sharesFromWeights",
    "InvalidSharesError",
    "TOTAL_BASIS_POINTS",
    "waitForConfirmation",
  ];

  for (const name of expected) {
    assert.ok(
      name in Tributary,
      `Tributary.${name} should be exported`,
    );
  }
});

test("UMD bundle Client is a constructor", () => {
  const code = readFileSync(umdPath, "utf8");
  const scope = createScope();
  const fn = new Function("self", "window", "globalThis", code + "\nreturn Tributary;");
  const Tributary = fn(scope, scope, scope);

  assert.equal(typeof Tributary.Client, "function");
});
