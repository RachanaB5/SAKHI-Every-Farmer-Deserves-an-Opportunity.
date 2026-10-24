// Shape of a user safe to send to the browser (never includes the PIN hash).
import type { User } from "@prisma/client";

/** Strips secrets from a user row. */
export function publicUser(u: User) {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    role: u.role,
    language: u.language,
    area: u.area,
    address: u.address,
    orgName: u.orgName,
    orgType: u.orgType,
    lat: u.lat,
    lng: u.lng,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
