// PIN hashing for phone + PIN login (auth interface). Uses Node's scrypt
// with a per-user random salt; verification is constant-time.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;

/**
 * Hashes a login PIN.
 * @param pin - plaintext PIN (4–6 digits)
 * @returns `scrypt$<saltHex>$<hashHex>`
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Checks a PIN against a stored hash without leaking timing information.
 * @returns true when the PIN matches
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(pin, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
