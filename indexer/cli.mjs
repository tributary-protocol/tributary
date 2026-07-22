export function parseArgs(args = process.argv.slice(2)) {
  let fromLedger;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    let value;

    if (argument === "--from-ledger") {
      value = args[index + 1];
      index += 1;
    } else if (argument.startsWith("--from-ledger=")) {
      value = argument.slice("--from-ledger=".length);
    } else {
      return { ok: false, error: `Unknown argument: ${argument}` };
    }

    if (fromLedger !== undefined) {
      return { ok: false, error: "--from-ledger may only be specified once" };
    }
    if (!/^[1-9]\d*$/.test(value ?? "")) {
      return {
        ok: false,
        error: "--from-ledger must be a positive integer",
      };
    }

    fromLedger = Number(value);
    if (!Number.isSafeInteger(fromLedger)) {
      return {
        ok: false,
        error: "--from-ledger must be a safe integer",
      };
    }
  }

  return { ok: true, value: { fromLedger } };
}

export function initialScanPosition(fromLedger, savedCursor) {
  if (fromLedger !== undefined) {
    return { startLedger: fromLedger };
  }
  if (savedCursor) {
    return { cursor: savedCursor };
  }
  return {};
}
