/**
 * Safely convert any numeric string (including floats like "100000.0") to BigInt.
 * Floors the value if it has decimals.
 */
export function toBigInt(value: string | number | bigint): bigint {
  if (typeof value === 'bigint') return value;
  const str = String(value).trim();
  // If it contains a decimal point, floor it first
  if (str.includes('.')) {
    return BigInt(Math.floor(parseFloat(str)));
  }
  return BigInt(str);
}

/**
 * Sanitize an amount string to a clean integer string.
 * "100000.0" → "100000", "100000" → "100000"
 */
export function sanitizeAmount(value: string | number): string {
  return toBigInt(value).toString();
}
