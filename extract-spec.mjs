import { xdr } from "@stellar/stellar-sdk";
import { readFileSync } from "fs";

const wasm = readFileSync("target/wasm32v1-none/release/tributary_splitter.wasm");

function decodeULEB128(buf, offset) {
  let result = 0, shift = 0, read = 0;
  while (true) {
    const byte = buf[offset + read];
    result |= (byte & 0x7f) << shift;
    shift += 7;
    read++;
    if (!(byte & 0x80)) break;
  }
  return [result, read];
}

let i = 8;
while (i < wasm.length) {
  const sectionType = wasm[i];
  const [secLen, sRead] = decodeULEB128(wasm, i + 1);
  if (sectionType === 0) {
    const nameStart = i + 1 + sRead;
    const [nameLen, nRead] = decodeULEB128(wasm, nameStart);
    const name = wasm.slice(nameStart + nRead, nameStart + nRead + nameLen).toString();
    if (name === "contractspecv0") {
      const dataStart = nameStart + nRead + nameLen;
      const dataLen = secLen - (dataStart - i - 1 - sRead);
      const xdrData = wasm.slice(dataStart, dataStart + dataLen);

      // Parse entries using a cursor approach
      const entries = [];
      let offset = 0;
      while (offset < xdrData.length) {
        // Re-encode trick: read until the next entry starts
        // Use the fact that entries are XDR-encoded and we can decode them
        // by trying to decode from different positions
        const entry = xdr.ScSpecEntry.fromXDR(xdrData.slice(offset), "raw");
        const encoded = entry.toXDR("raw");
        entries.push(entry.toXDR("base64"));
        offset += encoded.length;
      }
      entries.forEach((e) => console.log(e));
      console.error("---", entries.length, "entries ---");
      break;
    }
  }
  i += 1 + sRead + secLen;
}
