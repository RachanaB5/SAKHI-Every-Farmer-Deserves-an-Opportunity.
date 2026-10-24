// The choices offered in seller / restaurant onboarding. Shared by the wizard
// UI and the validators, so what the screen offers is exactly what the server
// accepts.

export interface Option<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

const opts = <V extends string>(list: readonly Option<V>[]) => list;

export const SELLER_TYPES = opts([
  { value: "INDIVIDUAL", label: "Individual farmer", hint: "I grow produce myself" },
  { value: "GROUP", label: "Farmer group / cooperative / FPO" },
  { value: "LARGE_FARM", label: "Large farm / commercial producer" },
  { value: "AGGREGATOR", label: "Aggregator / trader", hint: "I source from farmers" },
  { value: "RETAILER", label: "Retailer / wholesaler / distributor" },
  { value: "OTHER", label: "Other" },
] as const);

export const OWNERSHIP = opts([
  { value: "OWN", label: "I own the farm" },
  { value: "LEASE", label: "I lease it" },
  { value: "GROUP", label: "I represent a group" },
  { value: "SOURCED", label: "I buy from other farmers" },
] as const);

export const PRODUCT_CATEGORIES = opts([
  { value: "vegetables", label: "Vegetables" },
  { value: "fruits", label: "Fruits" },
  { value: "leafy", label: "Leafy greens" },
  { value: "grains", label: "Grains and pulses" },
  { value: "spices", label: "Spices" },
  { value: "dairy", label: "Dairy" },
  { value: "eggs", label: "Eggs" },
  { value: "meat", label: "Meat / poultry" },
  { value: "other", label: "Other" },
] as const);

export const SUPPLY_SOURCE = opts([
  { value: "SELF", label: "I grow or produce it myself" },
  { value: "GROUP", label: "Our farmer group members grow it" },
  { value: "PURCHASE", label: "I purchase it from farmers or suppliers" },
  { value: "MIX", label: "A combination of these" },
] as const);

export const CAPACITY = opts([
  { value: "XS", label: "Under 25 kg per week" },
  { value: "S", label: "25–100 kg per week" },
  { value: "M", label: "100–500 kg per week" },
  { value: "L", label: "500 kg–2 tonnes per week" },
  { value: "XL", label: "Over 2 tonnes per week" },
  { value: "VARIES", label: "It varies / I'm unsure" },
] as const);

export const AVAILABILITY = opts([
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "SEASONAL", label: "Seasonally, during harvest periods" },
  { value: "ON_ORDER", label: "Only when an order comes in" },
] as const);

export const STORAGE = opts([
  { value: "NONE", label: "No dedicated storage" },
  { value: "SHADED", label: "Shaded / cool area" },
  { value: "COLD", label: "Refrigeration / cold storage" },
  { value: "WAREHOUSE", label: "Warehouse / bulk storage" },
] as const);

export const BUYER_TYPES = opts([
  { value: "HOUSEHOLDS", label: "Individuals and families" },
  { value: "RESTAURANTS", label: "Restaurants, cafés and hotels" },
  { value: "COMMUNITIES", label: "Apartment communities and resident groups" },
  { value: "SHOPS", label: "Vegetable shops and retailers" },
  { value: "WHOLESALERS", label: "Wholesalers and distributors" },
  { value: "INSTITUTIONS", label: "Hostels, canteens and institutions" },
  { value: "PROCESSORS", label: "Food processors and manufacturers" },
  { value: "MANDIS", label: "Mandis and other bulk markets" },
] as const);

export const ORDER_SIZES = opts([
  { value: "SMALL", label: "Small orders from households" },
  { value: "MEDIUM", label: "Medium orders from regular customers" },
  { value: "BULK", label: "Bulk orders from businesses" },
  { value: "ALL", label: "All order sizes" },
] as const);

export const ALLOCATION = opts([
  { value: "SELLER", label: "I decide which orders to accept and how much to allocate" },
  { value: "AI_ASSIST", label: "Show me AI recommendations; I'll decide" },
] as const);

export const FULFILMENT = opts([
  { value: "PICKUP", label: "Buyer picks up from my farm / shop" },
  { value: "OWN_DELIVERY", label: "I or my team can deliver" },
  { value: "FOODFLOW_DELIVERY", label: "I want FOODFLOW to arrange delivery" },
  { value: "EXTERNAL", label: "I can use an external delivery service" },
] as const);

export const VEHICLE = opts([
  { value: "YES", label: "Yes, I have my own delivery staff / vehicle" },
  { value: "SOMETIMES", label: "I can arrange delivery occasionally" },
  { value: "NO", label: "No, I need delivery support" },
] as const);

export const RADIUS = opts([
  { value: "5", label: "Within 5 km" },
  { value: "10", label: "Within 10 km" },
  { value: "25", label: "Within 25 km" },
  { value: "50", label: "Within 50 km" },
  { value: "WIDE", label: "Intercity / wider region" },
] as const);

export const DELIVERY_FEE = opts([
  { value: "BUYER", label: "Buyer pays the delivery fee" },
  { value: "SELLER", label: "I cover the delivery fee" },
  { value: "SHARED", label: "I'd like to share the cost" },
  { value: "DEPENDS", label: "Depends on order size and distance" },
] as const);

export const PACKING = opts([
  { value: "SELLER", label: "I prepare and pack it" },
  { value: "BUYER", label: "Buyer brings their own containers / collects loose produce" },
  { value: "PARTNER", label: "Delivery partner handles agreed packaging / collection" },
] as const);

export const PRICING = opts([
  { value: "OWN", label: "I set my own prices" },
  { value: "AI", label: "Suggest prices for me" },
  { value: "BOTH", label: "Both, suggest, then I decide" },
] as const);

export const BULK_PRICING = opts([
  { value: "FIXED", label: "Fixed prices" },
  { value: "NEGOTIABLE", label: "Negotiable for bulk orders" },
] as const);

export const SHORTAGE = opts([
  { value: "PARTIAL", label: "Offer a smaller quantity" },
  { value: "LATER", label: "Suggest a later date" },
  { value: "DECLINE", label: "Decline the order" },
] as const);

export const PAYMENT_METHODS = opts([
  { value: "UPI", label: "UPI" },
  { value: "ONLINE", label: "Online payment through FOODFLOW" },
  { value: "CASH", label: "Cash at pickup / delivery" },
  { value: "BANK", label: "Bank transfer" },
  { value: "TERMS", label: "Agreed payment terms for verified business buyers" },
] as const);

export const PAYOUT = opts([
  { value: "BANK", label: "Payout to my verified bank account" },
  { value: "UPI", label: "Payout through a supported UPI option" },
  { value: "LATER", label: "I'll set up my payout method later" },
] as const);

export const ENTITY_TYPES = opts([
  { value: "INDIVIDUAL", label: "Individual" },
  { value: "PARTNERSHIP", label: "Partnership" },
  { value: "COOPERATIVE", label: "Cooperative / FPO" },
  { value: "COMPANY", label: "Company" },
] as const);

export const ORG_TYPES = opts([
  { value: "RESTAURANT", label: "Restaurant / café / hotel" },
  { value: "HOSTEL", label: "Hostel / canteen" },
  { value: "COMMUNITY_KITCHEN", label: "Community kitchen" },
] as const);

export const WEEKLY_NEED = opts([
  { value: "S", label: "Under 50 kg a week" },
  { value: "M", label: "50–200 kg a week" },
  { value: "L", label: "200–1000 kg a week" },
  { value: "XL", label: "Over 1 tonne a week" },
] as const);

// Only the languages the app is translated into.
export const LANGUAGES = opts([
  { value: "kn", label: "ಕನ್ನಡ (Kannada)" },
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी (Hindi)" },
] as const);

/** The `value`s of an option list as a Zod-friendly tuple. */
export function values<V extends string>(list: readonly Option<V>[]) {
  return list.map((o) => o.value) as [V, ...V[]];
}
