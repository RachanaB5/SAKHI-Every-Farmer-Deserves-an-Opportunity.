// Presentation metadata for the five roles: labels, taglines and demo
// persona hints used by the role switcher, landing cards and app shell.
import type { Role } from "@/lib/auth/token";

export interface RoleMeta {
  role: Role;
  label: string;
  /** Short line under the label on persona cards. */
  tagline: string;
  /** Who you become when tapping the demo card. */
  persona: string;
  home: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  FARMER: {
    role: "FARMER",
    label: "Farmer",
    tagline: "List harvests by voice, get paid fairly",
    persona: "Ramesh Gowda · Doddaballapur",
    home: "/farmer",
  },
  CONSUMER: {
    role: "CONSUMER",
    label: "Household",
    tagline: "Farm-fresh baskets, traced to the field",
    persona: "Ananya Rao · Yelahanka",
    home: "/shop",
  },
  BULK_BUYER: {
    role: "BULK_BUYER",
    label: "Restaurant & community",
    tagline: "Post demand, compare ranked offers",
    persona: "The Green Ladle · Hebbal",
    home: "/bulk",
  },
  ADMIN: {
    role: "ADMIN",
    label: "Admin",
    tagline: "Verify harvests, keep the market honest",
    persona: "Meera Krishnan · Ops",
    home: "/admin",
  },
  DELIVERY: {
    role: "DELIVERY",
    label: "Delivery",
    tagline: "Scan, hand over, verify with OTP",
    persona: "Imran Pasha · Yelahanka",
    home: "/delivery",
  },
};

export const ROLE_ORDER: Role[] = ["FARMER", "CONSUMER", "BULK_BUYER", "ADMIN", "DELIVERY"];
