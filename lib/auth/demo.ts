// Demo personas for judges: one tap logs in as a seeded user per role.
// Enabled unless DEMO_MODE is explicitly "false".

import type { Role } from "./token";

/**
 * One-tap sign-in as a seeded account (API only, the site no longer offers it). On by default in
 * development and tests; in production it stays off unless DEMO_MODE is explicitly "true",
 * because it lets anyone sign in as any seeded account, admin included.
 */
export const DEMO_ENABLED = process.env.NODE_ENV === "production" ? process.env.DEMO_MODE === "true" : process.env.DEMO_MODE !== "false";

/** Seeded phone numbers used by the one-tap role switcher. */
export const DEMO_PHONE_BY_ROLE: Record<Role, string> = {
  FARMER: "9000000101",
  CONSUMER: "9000000201",
  BULK_BUYER: "9000000301",
  ADMIN: "9000000001",
  DELIVERY: "9000000401",
};

/** Every seeded account starts with this prefix; persona switching is limited to them. */
export const DEMO_PHONE_PREFIX = "90000";
