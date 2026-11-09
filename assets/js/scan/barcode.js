/* barcode.js
 * UPC-A barcodes: the 12-digit codes on almost every product in North America.
 * A UPC-A code is 95 thin "modules", each black or white:
 *   start guard (101) + 6 left digits (7 modules each) + middle guard (01010)
 *   + 6 right digits (7 modules each) + end guard (101)
 */

const LEFT = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const RIGHT = LEFT.map((code) => [...code].map((bit) => (bit === "0" ? "1" : "0")).join(""));

/** The 12th digit, which lets a scanner catch misreads. */
export function checkDigit(eleven) {
  const d = [...eleven].map(Number);
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += d[i] * (i % 2 === 0 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

/**
 * Build a UPC-A barcode from 11 digits (the check digit is added) or 12 digits.
 * Returns { digits: "012345678905", modules: [1,0,1,...] (95 entries),
 *           digitSpans: [[startModule, endModule], ...] for each of the 12 digits }
 */
export function upc(code) {
  let digits = String(code).replace(/\D/g, "");
  if (digits.length === 11) digits += checkDigit(digits);
  if (digits.length !== 12) throw new Error(`A UPC-A barcode needs 11 or 12 digits, got "${code}"`);

  let bits = "101";
  const digitSpans = [];
  for (let i = 0; i < 12; i++) {
    if (i === 6) bits += "01010";
    digitSpans.push([bits.length, bits.length + 7]);
    bits += (i < 6 ? LEFT : RIGHT)[Number(digits[i])];
  }
  bits += "101";
  return { digits, modules: [...bits].map(Number), digitSpans };
}

/** Split the barcode into runs of the same color: [{ start, length, black }]. */
export function runs(modules) {
  const out = [];
  for (let i = 0; i < modules.length; i++) {
    const last = out[out.length - 1];
    if (last && last.black === Boolean(modules[i])) last.length++;
    else out.push({ start: i, length: 1, black: Boolean(modules[i]) });
  }
  return out;
}
