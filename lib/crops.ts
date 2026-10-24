// Crop catalogue shared by every interface: names in five languages,
// spoken aliases for voice parsing, default units, shelf life (drives the
// surplus detector) and reference prices used by the seed + price advisor.

export const CROP_SLUGS = [
  "tomato",
  "onion",
  "potato",
  "spinach",
  "carrot",
  "beans",
  "brinjal",
  "cabbage",
  "milk",
  "eggs",
  "chicken",
] as const;

export type CropSlug = (typeof CROP_SLUGS)[number];

export type CategorySlug = "vegetables" | "leafy" | "dairy" | "eggs" | "poultry";

export type Unit = "kg" | "litre" | "dozen";

export interface CropInfo {
  slug: CropSlug;
  category: CategorySlug;
  unit: Unit;
  names: { en: string; hi: string; kn: string; ta: string; te: string };
  /** Lower-cased spellings people actually say/type, across scripts. */
  aliases: string[];
  /** Days a harvest stays sellable at retail quality. */
  shelfLifeDays: number;
  /** Indicative Bengaluru modal price (₹ per unit) used to seed history. */
  basePrice: number;
  image: string;
  /** Accent colour for charts and 3D props. */
  color: string;
}

export const CROPS: Record<CropSlug, CropInfo> = {
  tomato: {
    slug: "tomato",
    category: "vegetables",
    unit: "kg",
    names: { en: "Tomato", hi: "टमाटर", kn: "ಟೊಮೇಟೊ", ta: "தக்காளி", te: "టమాటా" },
    aliases: ["tomato", "tomatoes", "tamatar", "tamater", "टमाटर", "ಟೊಮೇಟೊ", "ಟೊಮ್ಯಾಟೊ", "ಟೊಮೆಟೊ", "thakkali", "தக்காளி", "టమాటా", "tamata"],
    shelfLifeDays: 6,
    basePrice: 24,
    image: "/seed/tomato-1.jpg",
    color: "#e5482b",
  },
  onion: {
    slug: "onion",
    category: "vegetables",
    unit: "kg",
    names: { en: "Onion", hi: "प्याज़", kn: "ಈರುಳ್ಳಿ", ta: "வெங்காயம்", te: "ఉల్లిపాయ" },
    aliases: ["onion", "onions", "pyaz", "pyaaz", "pyaj", "kanda", "प्याज", "प्याज़", "ಈರುಳ್ಳಿ", "eerulli", "irulli", "vengayam", "வெங்காயம்", "ఉల్లిపాయ", "ullipaya"],
    shelfLifeDays: 30,
    basePrice: 32,
    image: "/seed/onion-1.jpg",
    color: "#a8456b",
  },
  potato: {
    slug: "potato",
    category: "vegetables",
    unit: "kg",
    names: { en: "Potato", hi: "आलू", kn: "ಆಲೂಗಡ್ಡೆ", ta: "உருளைக்கிழங்கு", te: "బంగాళాదుంప" },
    aliases: ["potato", "potatoes", "aloo", "alu", "आलू", "ಆಲೂಗಡ್ಡೆ", "aloogadde", "urulaikizhangu", "உருளைக்கிழங்கு", "బంగాళాదుంప", "bangaladumpa"],
    shelfLifeDays: 45,
    basePrice: 28,
    image: "/seed/potato-1.jpg",
    color: "#c8a165",
  },
  spinach: {
    slug: "spinach",
    category: "leafy",
    unit: "kg",
    names: { en: "Spinach", hi: "पालक", kn: "ಪಾಲಕ್ ಸೊಪ್ಪು", ta: "பசலைக் கீரை", te: "పాలకూర" },
    aliases: ["spinach", "palak", "पालक", "ಪಾಲಕ್", "ಪಾಲಕ್ ಸೊಪ್ಪು", "ಸೊಪ್ಪು", "soppu", "keerai", "கீரை", "பசலைக் கீரை", "పాలకూర", "palakura"],
    shelfLifeDays: 2,
    basePrice: 40,
    image: "/seed/spinach-1.jpg",
    color: "#2f8f4e",
  },
  carrot: {
    slug: "carrot",
    category: "vegetables",
    unit: "kg",
    names: { en: "Carrot", hi: "गाजर", kn: "ಕ್ಯಾರೆಟ್", ta: "கேரட்", te: "క్యారెట్" },
    aliases: ["carrot", "carrots", "gajar", "गाजर", "ಕ್ಯಾರೆಟ್", "கேரட்", "క్యారెట్"],
    shelfLifeDays: 14,
    basePrice: 45,
    image: "/seed/carrot-1.jpg",
    color: "#f07c22",
  },
  beans: {
    slug: "beans",
    category: "vegetables",
    unit: "kg",
    names: { en: "Beans", hi: "बीन्स", kn: "ಬೀನ್ಸ್", ta: "பீன்ஸ்", te: "బీన్స్" },
    aliases: ["beans", "green beans", "phali", "फली", "बीन्स", "ಬೀನ್ಸ್", "ಹುರುಳಿಕಾಯಿ", "hurulikai", "பீன்ஸ்", "బీన్స్"],
    shelfLifeDays: 5,
    basePrice: 55,
    image: "/seed/beans-1.jpg",
    color: "#5fa83a",
  },
  brinjal: {
    slug: "brinjal",
    category: "vegetables",
    unit: "kg",
    names: { en: "Brinjal", hi: "बैंगन", kn: "ಬದನೆಕಾಯಿ", ta: "கத்திரிக்காய்", te: "వంకాయ" },
    aliases: ["brinjal", "eggplant", "aubergine", "baingan", "baigan", "बैंगन", "ಬದನೆಕಾಯಿ", "ಬದನೆ", "badanekai", "kathirikai", "கத்திரிக்காய்", "వంకాయ", "vankaya"],
    shelfLifeDays: 6,
    basePrice: 35,
    image: "/seed/brinjal-1.jpg",
    color: "#5b2a6e",
  },
  cabbage: {
    slug: "cabbage",
    category: "vegetables",
    unit: "kg",
    names: { en: "Cabbage", hi: "पत्ता गोभी", kn: "ಎಲೆಕೋಸು", ta: "முட்டைக்கோஸ்", te: "క్యాబేజీ" },
    aliases: ["cabbage", "patta gobhi", "patta gobi", "band gobhi", "पत्ता गोभी", "पत्तागोभी", "बंद गोभी", "ಎಲೆಕೋಸು", "elekosu", "muttaikose", "முட்டைக்கோஸ்", "క్యాబేజీ"],
    shelfLifeDays: 10,
    basePrice: 20,
    image: "/seed/cabbage-1.jpg",
    color: "#8fbf5a",
  },
  milk: {
    slug: "milk",
    category: "dairy",
    unit: "litre",
    names: { en: "Milk", hi: "दूध", kn: "ಹಾಲು", ta: "பால்", te: "పాలు" },
    aliases: ["milk", "doodh", "dudh", "दूध", "ಹಾಲು", "haalu", "halu", "paal", "பால்", "పాలు", "palu"],
    shelfLifeDays: 1,
    basePrice: 52,
    image: "/seed/milk-1.jpg",
    color: "#e9e4d4",
  },
  eggs: {
    slug: "eggs",
    category: "eggs",
    unit: "dozen",
    names: { en: "Eggs", hi: "अंडे", kn: "ಮೊಟ್ಟೆ", ta: "முட்டை", te: "గుడ్లు" },
    aliases: ["egg", "eggs", "anda", "ande", "अंडा", "अंडे", "ಮೊಟ್ಟೆ", "motte", "muttai", "முட்டை", "గుడ్లు", "gudlu"],
    shelfLifeDays: 14,
    basePrice: 78,
    image: "/seed/eggs-1.jpg",
    color: "#d9a066",
  },
  chicken: {
    slug: "chicken",
    category: "poultry",
    unit: "kg",
    names: { en: "Chicken", hi: "चिकन", kn: "ಕೋಳಿ ಮಾಂಸ", ta: "கோழி", te: "చికెన్" },
    aliases: ["chicken", "murga", "murgi", "मुर्गा", "मुर्गी", "चिकन", "ಕೋಳಿ", "ಕೋಳಿ ಮಾಂಸ", "koli", "கோழி", "kozhi", "చికెన్"],
    shelfLifeDays: 1,
    basePrice: 240,
    image: "/seed/chicken-1.jpg",
    color: "#e8a598",
  },
};

export const CATEGORIES: { slug: CategorySlug; name: string; special: boolean }[] = [
  { slug: "vegetables", name: "Vegetables", special: false },
  { slug: "leafy", name: "Leafy greens", special: false },
  { slug: "dairy", name: "Milk & dairy", special: true },
  { slug: "eggs", name: "Eggs", special: true },
  { slug: "poultry", name: "Chicken", special: true },
];

/** Type guard for crop slugs coming from user input or AI output. */
export function isCropSlug(value: string): value is CropSlug {
  return (CROP_SLUGS as readonly string[]).includes(value);
}

/**
 * Resolves free text (any supported language/script) to a crop slug.
 * @param text - a word or phrase such as "tamatar" or "ಈರುಳ್ಳಿ"
 * @returns the matching slug, or null when nothing matches
 */
export function matchCrop(text: string): CropSlug | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  if (isCropSlug(t)) return t;
  // Longest alias first so "green beans" beats "beans", "ಕೋಳಿ ಮಾಂಸ" beats "ಕೋಳಿ".
  const pairs = CROP_SLUGS.flatMap((slug) => CROPS[slug].aliases.map((a) => [a, slug] as const));
  pairs.sort((a, b) => b[0].length - a[0].length);
  for (const [alias, slug] of pairs) {
    if (t.includes(alias)) return slug;
  }
  return null;
}

/** Localised crop name, falling back to English. */
export function cropName(slug: string, lang: string = "en"): string {
  if (!isCropSlug(slug)) return slug;
  const names = CROPS[slug].names as Record<string, string>;
  return names[lang] ?? names.en;
}
