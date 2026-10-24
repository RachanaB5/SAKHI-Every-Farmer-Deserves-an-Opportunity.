// Lucide icon per role (kept out of lib/roles.ts so server code stays icon-free).
import { Bike, ChefHat, ShieldCheck, ShoppingBasket, Sprout, type LucideIcon } from "lucide-react";
import type { Role } from "@/lib/auth/token";

export const ROLE_ICON: Record<Role, LucideIcon> = {
  FARMER: Sprout,
  CONSUMER: ShoppingBasket,
  BULK_BUYER: ChefHat,
  ADMIN: ShieldCheck,
  DELIVERY: Bike,
};
