// The seller sign-up conversation: what Sakhi asks on each screen,
// how each choice is said in English, Kannada and Hindi (also used to show
// the choices in the farmer's language), and how a spoken answer becomes a
// form value: keywords in three languages and scripts, "first / ಎರಡನೇ / तीसरा",
// "all / ಎಲ್ಲಾ / सब", and amounts like "200 kilo a week" or "within 10 km".
import { levenshtein } from "./fuzzy";
import type { AssistantLang } from "./intents";
import { yesNo } from "./lexicon";
import { normaliseUtterance } from "./parse";

export type L3 = Record<AssistantLang, string>;

/** The sign-up answers the guide can fill. */
export interface SellerAnswers {
  contactName: string;
  businessName: string;
  sellerType: string;
  phone: string;
  village: string;
  district: string;
  pincode: string;
  addressLine: string;
  area: string;
  ownership: string;
  crops: string[];
  categories: string[];
  source: string;
  capacity: string;
  availability: string;
  buyerTypes: string[];
  orderSizes: string;
  fulfilment: string[];
  radius: string;
  deliveryFee: string;
  packing: string;
  paymentMethods: string[];
  entityType: string;
  authorised: boolean;
  accurate: boolean;
  agreeTerms: boolean;
}
export type ChoiceField = "sellerType" | "area" | "ownership" | "source" | "capacity" | "availability" | "buyerTypes" | "orderSizes" | "fulfilment" | "radius" | "deliveryFee" | "packing" | "paymentMethods" | "entityType";
export type DisplayField = ChoiceField | "storage" | "allocation" | "vehicle" | "pricing" | "bulkPricing" | "shortage" | "payoutPreference" | "categories";

/**
 * A choice. `say` is how it is spoken; the Kannada and Hindi forms are also
 * shown on screen, while the English form is a short spoken one (the form
 * keeps its own English labels). `words` are matched in any language: Latin words as whole words
 * (a trailing * matches a prefix), Kannada and Hindi as substrings so
 * suffixes don't matter. A leading ~ marks a weak hint ("farmer" alone means
 * an individual farmer, but "farmer group" means a group).
 */
export interface Choice {
  value: string;
  say: L3;
  words?: string[];
}

const c = (value: string, en: string, kn: string, hi: string, words: string[] = []): Choice => ({ value, say: { en, kn, hi }, words });

export const CHOICES: Record<DisplayField, Choice[]> = {
  sellerType: [
    c("INDIVIDUAL", "individual farmer", "ಸ್ವತಃ ಬೆಳೆಯುವ ರೈತ", "ख़ुद उगाने वाले किसान", ["individual", "myself", "my own", "self", "~farmer", "~ರೈತ", "ನಾನೇ", "ಸ್ವತಃ", "~किसान", "ख़ुद", "खुद", "~kisan", "~raita"]),
    c("GROUP", "farmer group", "ರೈತ ಗುಂಪು / ಸಹಕಾರ ಸಂಘ", "किसान समूह / सहकारी संस्था", ["group", "cooperative", "co-operative", "fpo", "society", "ಗುಂಪು", "ಸಂಘ", "ಸಹಕಾರ", "समूह", "सहकारी", "समिति", "sangha", "samuh"]),
    c("LARGE_FARM", "large farm", "ದೊಡ್ಡ ತೋಟ", "बड़ा फ़ार्म", ["large", "big", "commercial", "estate", "ದೊಡ್ಡ", "बड़ा", "बड़े", "bada", "dodda"]),
    c("AGGREGATOR", "trader", "ವ್ಯಾಪಾರಿ", "व्यापारी", ["trader", "aggregator", "agent", "middleman", "ವ್ಯಾಪಾರಿ", "ದಲ್ಲಾಳಿ", "व्यापारी", "आढ़ती", "vyapari"]),
    c("RETAILER", "shop or wholesaler", "ಅಂಗಡಿ / ಸಗಟು ವ್ಯಾಪಾರಿ", "दुकान / थोक व्यापारी", ["shop", "retail*", "wholesale*", "distributor", "store", "ಅಂಗಡಿ", "ಸಗಟು", "दुकान", "थोक", "dukaan", "angadi"]),
    c("OTHER", "something else", "ಬೇರೆ", "कुछ और", ["other", "else", "ಬೇರೆ", "कुछ और", "dusra", "bere"]),
  ],
  area: [
    c("Yelahanka", "Yelahanka", "ಯಲಹಂಕ", "येलहंका", ["yelahanka", "yalahanka", "ಯಲಹಂಕ", "येलहंका"]),
    c("Hebbal", "Hebbal", "ಹೆಬ್ಬಾಳ", "हेब्बाल", ["hebbal", "hebbala", "ಹೆಬ್ಬಾಳ", "हेब्बाल"]),
    c("Jayanagar", "Jayanagar", "ಜಯನಗರ", "जयनगर", ["jayanagar", "jayanagara", "ಜಯನಗರ", "जयनगर"]),
  ],
  ownership: [
    c("OWN", "your own land", "ನನ್ನ ಸ್ವಂತ ಜಮೀನು", "मेरी अपनी ज़मीन", ["own", "mine", "my land", "my farm", "ಸ್ವಂತ", "ನನ್ನ ಜಮೀನು", "ನಮ್ಮ ಜಮೀನು", "ನಮ್ಮದೇ", "ನನ್ನದೇ", "अपनी", "अपना", "ख़ुद की", "खुद की", "swanta", "apni"]),
    c("LEASE", "leased land", "ಗುತ್ತಿಗೆ ಜಮೀನು", "किराये / पट्टे की ज़मीन", ["lease*", "rent*", "tenant", "ಗುತ್ತಿಗೆ", "ಬಾಡಿಗೆ", "किराय", "किराए", "पट्टे", "पट्टा", "ठेके", "guttige", "badige"]),
    c("GROUP", "a group's land", "ಗುಂಪಿನ ಪರವಾಗಿ", "समूह की ओर से", ["group", "represent", "ಗುಂಪು", "ಗುಂಪಿನ", "ಸಂಘ", "समूह"]),
    c("SOURCED", "buying from other farmers", "ಬೇರೆ ರೈತರಿಂದ ಖರೀದಿಸುತ್ತೇನೆ", "दूसरे किसानों से खरीदता हूँ", ["buy", "purchase", "source", "other farmers", "ಖರೀದಿ", "ಕೊಳ್ಳು", "खरीद", "kharid"]),
  ],
  categories: [
    c("vegetables", "Vegetables", "ತರಕಾರಿ", "सब्ज़ियाँ"),
    c("fruits", "Fruits", "ಹಣ್ಣುಗಳು", "फल"),
    c("leafy", "Leafy greens", "ಸೊಪ್ಪು", "हरी पत्तेदार सब्ज़ियाँ"),
    c("grains", "Grains and pulses", "ಧಾನ್ಯ ಮತ್ತು ಬೇಳೆ", "अनाज और दालें"),
    c("spices", "Spices", "ಮಸಾಲೆ", "मसाले"),
    c("dairy", "Dairy", "ಹಾಲಿನ ಉತ್ಪನ್ನ", "डेयरी"),
    c("eggs", "Eggs", "ಮೊಟ್ಟೆ", "अंडे"),
    c("meat", "Meat / poultry", "ಮಾಂಸ / ಕೋಳಿ", "मांस / मुर्गी"),
    c("other", "Other", "ಬೇರೆ", "अन्य"),
  ],
  source: [
    c("SELF", "you grow it yourself", "ನಾನೇ ಬೆಳೆಯುತ್ತೇನೆ", "मैं ख़ुद उगाता हूँ", ["myself", "self", "i grow", "we grow", "own", "ನಾನೇ", "ನಾವೇ", "ಸ್ವತಃ", "ಬೆಳೆಯುತ್ತೇನೆ", "ಬೆಳೆಯುತ್ತೇವೆ", "ख़ुद", "खुद", "उगाता", "उगाते", "khud"]),
    c("GROUP", "your group grows it", "ನಮ್ಮ ಗುಂಪಿನ ರೈತರು ಬೆಳೆಯುತ್ತಾರೆ", "हमारे समूह के किसान उगाते हैं", ["group", "members", "ಗುಂಪು", "ಗುಂಪಿನ", "ಸದಸ್ಯ", "समूह", "सदस्य"]),
    c("PURCHASE", "you buy it", "ರೈತರಿಂದ ಖರೀದಿಸುತ್ತೇನೆ", "किसानों से खरीदता हूँ", ["buy", "purchase", "ಖರೀದಿ", "ಕೊಂಡು", "खरीद", "kharid"]),
    c("MIX", "a mix", "ಎರಡೂ", "दोनों", ["mix", "both", "combination", "ಎರಡೂ", "ಮಿಶ್ರ", "दोनों", "मिला", "dono"]),
  ],
  capacity: [
    c("XS", "under 25 kilos a week", "ವಾರಕ್ಕೆ 25 ಕಿಲೋಗಿಂತ ಕಡಿಮೆ", "हफ़्ते में 25 किलो से कम"),
    c("S", "25 to 100 kilos a week", "ವಾರಕ್ಕೆ 25 ರಿಂದ 100 ಕಿಲೋ", "हफ़्ते में 25 से 100 किलो"),
    c("M", "100 to 500 kilos a week", "ವಾರಕ್ಕೆ 100 ರಿಂದ 500 ಕಿಲೋ", "हफ़्ते में 100 से 500 किलो"),
    c("L", "500 kilos to 2 tonnes a week", "ವಾರಕ್ಕೆ 500 ಕಿಲೋದಿಂದ 2 ಟನ್", "हफ़्ते में 500 किलो से 2 टन"),
    c("XL", "over 2 tonnes a week", "ವಾರಕ್ಕೆ 2 ಟನ್‌ಗಿಂತ ಹೆಚ್ಚು", "हफ़्ते में 2 टन से ज़्यादा"),
    c("VARIES", "it varies", "ಬದಲಾಗುತ್ತದೆ / ಗೊತ್ತಿಲ್ಲ", "बदलता रहता है / पता नहीं", ["varies", "vary", "not sure", "unsure", "don't know", "depends", "ಗೊತ್ತಿಲ್ಲ", "ಬದಲಾಗುತ್ತ", "पता नहीं", "बदलता", "नहीं पता", "pata nahi", "gottilla"]),
  ],
  availability: [
    c("DAILY", "every day", "ಪ್ರತಿದಿನ", "रोज़", ["daily", "every day", "everyday", "ಪ್ರತಿದಿನ", "ದಿನಾ", "ದಿನಾಲೂ", "रोज़", "रोज", "हर दिन", "roz", "pratidina"]),
    c("WEEKLY", "every week", "ವಾರಕ್ಕೊಮ್ಮೆ", "हर हफ़्ते", ["weekly", "week", "ವಾರ", "हफ़्त", "हफ्त", "सप्ताह", "hafte", "vaara"]),
    c("SEASONAL", "in season", "ಸೀಸನ್‌ನಲ್ಲಿ ಮಾತ್ರ", "सिर्फ़ सीज़न में", ["season*", "harvest time", "ಸೀಸನ್", "ಹಂಗಾಮು", "ಕಾಲದಲ್ಲಿ", "सीज़न", "सीजन", "मौसम"]),
    c("ON_ORDER", "only on order", "ಆರ್ಡರ್ ಬಂದಾಗ ಮಾತ್ರ", "ऑर्डर आने पर", ["order*", "on demand", "when asked", "ಆರ್ಡರ್", "ऑर्डर", "आर्डर"]),
  ],
  storage: [
    c("NONE", "No dedicated storage", "ಪ್ರತ್ಯೇಕ ಸಂಗ್ರಹ ಇಲ್ಲ", "अलग भंडारण नहीं"),
    c("SHADED", "Shaded / cool area", "ನೆರಳಿನ / ತಂಪಾದ ಜಾಗ", "छाया / ठंडी जगह"),
    c("COLD", "Refrigeration / cold storage", "ಶೀತಲ ಸಂಗ್ರಹ", "कोल्ड स्टोरेज"),
    c("WAREHOUSE", "Warehouse / bulk storage", "ಗೋದಾಮು", "गोदाम"),
  ],
  buyerTypes: [
    c("HOUSEHOLDS", "families", "ಮನೆಗಳು ಮತ್ತು ಕುಟುಂಬಗಳು", "घर-परिवार", ["famil*", "household*", "home*", "people", "individuals", "ಮನೆ", "ಕುಟುಂಬ", "ಜನರು", "घर", "परिवार", "लोग", "ghar"]),
    c("RESTAURANTS", "restaurants", "ಹೋಟೆಲ್‌ಗಳು ಮತ್ತು ಕೆಫೆಗಳು", "रेस्टोरेंट, कैफ़े और होटल", ["restaurant*", "hotel*", "cafe*", "café", "dhaba", "ಹೋಟೆಲ್", "ಹೊಟೇಲ್", "ರೆಸ್ಟೋರೆಂಟ್", "होटल", "रेस्टोरेंट", "ढाबा"]),
    c("COMMUNITIES", "apartments", "ಅಪಾರ್ಟ್‌ಮೆಂಟ್ ಸಮುದಾಯಗಳು", "अपार्टमेंट सोसाइटी", ["apartment*", "communit*", "societ*", "resident*", "ಅಪಾರ್ಟ್", "ಸೊಸೈಟಿ", "अपार्टमेंट", "सोसाइटी"]),
    c("SHOPS", "shops", "ತರಕಾರಿ ಅಂಗಡಿಗಳು", "सब्ज़ी की दुकानें", ["shop*", "retailer*", "store*", "ಅಂಗಡಿ", "दुकान"]),
    c("WHOLESALERS", "wholesalers", "ಸಗಟು ವ್ಯಾಪಾರಿಗಳು", "थोक व्यापारी", ["wholesale*", "distributor*", "ಸಗಟು", "थोक"]),
    c("INSTITUTIONS", "hostels", "ಹಾಸ್ಟೆಲ್ ಮತ್ತು ಕ್ಯಾಂಟೀನ್", "हॉस्टल और कैंटीन", ["hostel*", "canteen*", "school*", "college*", "institution*", "ಹಾಸ್ಟೆಲ್", "ಕ್ಯಾಂಟೀನ್", "ಶಾಲೆ", "हॉस्टल", "कैंटीन", "स्कूल"]),
    c("PROCESSORS", "food processors", "ಆಹಾರ ಸಂಸ್ಕರಣಾ ಘಟಕಗಳು", "फ़ूड प्रोसेसिंग कंपनियाँ", ["processor*", "processing", "factory", "factories", "manufacturer*", "ಸಂಸ್ಕರಣ", "ಕಾರ್ಖಾನೆ", "फ़ैक्टरी", "फैक्ट्री", "प्रोसेस"]),
    c("MANDIS", "mandis", "ಮಂಡಿ ಮತ್ತು ಎಪಿಎಂಸಿ", "मंडी", ["mandi*", "apmc", "market*", "ಮಂಡಿ", "ಮಾರುಕಟ್ಟೆ", "ಎಪಿಎಂಸಿ", "मंडी", "बाज़ार", "बाजार"]),
  ],
  orderSizes: [
    c("SMALL", "small orders", "ಮನೆಗಳ ಸಣ್ಣ ಆರ್ಡರ್", "घरों के छोटे ऑर्डर", ["small", "little", "ಸಣ್ಣ", "ಚಿಕ್ಕ", "छोटे", "छोटा", "chhota"]),
    c("MEDIUM", "medium orders", "ಮಧ್ಯಮ ಆರ್ಡರ್", "मध्यम ऑर्डर", ["medium", "regular", "moderate", "ಮಧ್ಯಮ", "मध्यम", "बीच", "madhyam"]),
    c("BULK", "bulk orders", "ದೊಡ್ಡ ಆರ್ಡರ್", "बड़े थोक ऑर्डर", ["bulk", "large", "big", "business*", "ದೊಡ್ಡ", "ಬಲ್ಕ್", "बड़े", "बड़ा", "थोक"]),
    c("ALL", "all order sizes", "ಎಲ್ಲಾ ಗಾತ್ರದ ಆರ್ಡರ್", "सभी तरह के ऑर्डर", ["all", "any", "every", "everything", "ಎಲ್ಲಾ", "ಎಲ್ಲ", "ಯಾವುದಾದರೂ", "सभी", "सब", "कोई भी", "sab"]),
  ],
  allocation: [
    c("SELLER", "I decide which orders to accept and how much to allocate", "ಯಾವ ಆರ್ಡರ್ ಒಪ್ಪಬೇಕು ಎಂದು ನಾನೇ ನಿರ್ಧರಿಸುತ್ತೇನೆ", "कौन से ऑर्डर लेने हैं, मैं तय करूँगा"),
    c("AI_ASSIST", "Show me AI recommendations; I'll decide", "ಸಲಹೆ ತೋರಿಸಿ, ನಿರ್ಧಾರ ನನ್ನದು", "सुझाव दिखाओ, फ़ैसला मेरा"),
  ],
  fulfilment: [
    c("PICKUP", "buyers pick it up", "ಖರೀದಿದಾರರೇ ಬಂದು ತೆಗೆದುಕೊಳ್ಳುತ್ತಾರೆ", "खरीदार ख़ुद आकर ले जाए", ["pickup", "pick up", "pick it up", "collect*", "come and take", "ಬಂದು", "ಪಿಕಪ್", "ಪಿಕ್ ಅಪ್", "ले जाए", "ले जाएं", "ले जाएँ", "आकर", "पिकअप"]),
    c("OWN_DELIVERY", "you deliver", "ನಾವೇ ತಲುಪಿಸುತ್ತೇವೆ", "मैं ख़ुद पहुँचाऊँगा", ["i deliver", "we deliver", "i can deliver", "we can deliver", "my vehicle", "my team", "ನಾವೇ", "ನಾನೇ", "ತಲುಪಿಸುತ್ತೇನೆ", "ತಲುಪಿಸುತ್ತೇವೆ", "ನಮ್ಮ ವಾಹನ", "पहुँचाऊँ", "पहुंचाऊं", "मैं ख़ुद", "मैं खुद", "अपनी गाड़ी"]),
    c("FOODFLOW_DELIVERY", "FoodFlow delivery", "FoodFlow ಡೆಲಿವರಿ ಮಾಡಲಿ", "FoodFlow डिलीवरी करे", ["foodflow", "food flow", "you arrange", "platform", "ಫುಡ್‌ಫ್ಲೋ", "ಫುಡ್ ಫ್ಲೋ", "ಫುಡ್ಫ್ಲೋ", "फ़ूडफ़्लो", "फूड फ्लो", "फूडफ्लो"]),
    c("EXTERNAL", "another delivery service", "ಬೇರೆ ಡೆಲಿವರಿ ಸೇವೆ", "कोई और डिलीवरी सर्विस", ["external", "courier", "porter", "dunzo", "other service", "third party", "ಕೊರಿಯರ್", "ಬೇರೆ ಸೇವೆ", "कूरियर", "दूसरी सर्विस"]),
  ],
  vehicle: [
    c("YES", "Yes, I have my own delivery staff / vehicle", "ಹೌದು, ನಮ್ಮದೇ ವಾಹನ ಇದೆ", "हाँ, अपनी गाड़ी है"),
    c("SOMETIMES", "I can arrange delivery occasionally", "ಕೆಲವೊಮ್ಮೆ ವ್ಯವಸ್ಥೆ ಮಾಡಬಲ್ಲೆ", "कभी-कभी इंतज़ाम कर सकता हूँ"),
    c("NO", "No, I need delivery support", "ಇಲ್ಲ, ಡೆಲಿವರಿ ಸಹಾಯ ಬೇಕು", "नहीं, डिलीवरी में मदद चाहिए"),
  ],
  radius: [
    c("5", "within 5 kilometres", "5 ಕಿಲೋಮೀಟರ್ ಒಳಗೆ", "5 किलोमीटर तक", ["nearby", "near", "close", "ಹತ್ತಿರ", "पास"]),
    c("10", "within 10 kilometres", "10 ಕಿಲೋಮೀಟರ್ ಒಳಗೆ", "10 किलोमीटर तक"),
    c("25", "within 25 kilometres", "25 ಕಿಲೋಮೀಟರ್ ಒಳಗೆ", "25 किलोमीटर तक"),
    c("50", "within 50 kilometres", "50 ಕಿಲೋಮೀಟರ್ ಒಳಗೆ", "50 किलोमीटर तक"),
    c("WIDE", "further away", "ಬೇರೆ ಊರುಗಳಿಗೂ", "दूसरे शहरों तक", ["intercity", "far", "farther", "further", "anywhere", "other cities", "wider", "ಬೇರೆ ಊರು", "ಎಲ್ಲಿಗೂ", "ಇನ್ನೂ ದೂರ", "दूसरे शहर", "कहीं भी", "और दूर"]),
  ],
  deliveryFee: [
    c("BUYER", "the buyer pays", "ಖರೀದಿದಾರರು ಕೊಡುತ್ತಾರೆ", "खरीदार देगा", ["buyer*", "customer*", "they pay", "ಖರೀದಿದಾರ", "ಗ್ರಾಹಕ", "खरीदार", "ग्राहक", "kharidar", "grahak"]),
    c("SELLER", "you pay", "ನಾನೇ ಕೊಡುತ್ತೇನೆ", "मैं दूँगा", ["i pay", "i will pay", "i'll pay", "i cover", "me", "myself", "ನಾನೇ", "ನಾನು", "मैं"]),
    c("SHARED", "half and half", "ಹಂಚಿಕೊಳ್ಳೋಣ", "आधा-आधा", ["share*", "half", "split", "both", "ಹಂಚಿ", "ಅರ್ಧ", "ಇಬ್ಬರೂ", "आधा", "बाँट", "बांट", "दोनों"]),
    c("DEPENDS", "it depends", "ಆರ್ಡರ್ ಮೇಲೆ ಅವಲಂಬಿತ", "ऑर्डर पर निर्भर", ["depend*", "ಅವಲಂಬಿ", "ಆರ್ಡರ್ ಮೇಲೆ", "निर्भर"]),
  ],
  packing: [
    c("SELLER", "you pack it", "ನಾನೇ ಪ್ಯಾಕ್ ಮಾಡುತ್ತೇನೆ", "मैं पैक करूँगा", ["i pack", "i will pack", "i'll pack", "we pack", "me", "myself", "ನಾನೇ", "ನಾವೇ", "ನಾನು", "मैं", "हम", "ख़ुद", "खुद"]),
    c("BUYER", "the buyer brings bags", "ಖರೀದಿದಾರರು ಚೀಲ ತರುತ್ತಾರೆ", "खरीदार अपना थैला लाए", ["buyer*", "bag*", "container*", "loose", "ಖರೀದಿದಾರ", "ಚೀಲ", "खरीदार", "थैला", "थैले"]),
    c("PARTNER", "the delivery partner", "ಡೆಲಿವರಿ ಪಾಲುದಾರರು", "डिलीवरी पार्टनर", ["partner", "delivery", "rider", "ಡೆಲಿವರಿ", "ರೈಡರ್", "ಪಾಲುದಾರ", "डिलीवरी", "राइडर"]),
  ],
  pricing: [
    c("OWN", "I set my own prices", "ಬೆಲೆಯನ್ನು ನಾನೇ ನಿರ್ಧರಿಸುತ್ತೇನೆ", "दाम मैं ख़ुद तय करूँगा"),
    c("AI", "Suggest prices for me", "ಬೆಲೆ ಸೂಚಿಸಿ", "दाम सुझाइए"),
    c("BOTH", "Both, suggest, then I decide", "ಸೂಚಿಸಿ, ನಿರ್ಧಾರ ನನ್ನದು", "सुझाइए, फ़ैसला मेरा"),
  ],
  bulkPricing: [
    c("FIXED", "Fixed prices", "ನಿಗದಿತ ಬೆಲೆ", "तय दाम"),
    c("NEGOTIABLE", "Negotiable for bulk orders", "ದೊಡ್ಡ ಆರ್ಡರ್‌ಗೆ ಚೌಕಾಸಿ ಸಾಧ್ಯ", "थोक ऑर्डर पर मोलभाव"),
  ],
  shortage: [
    c("PARTIAL", "Offer a smaller quantity", "ಕಡಿಮೆ ಪ್ರಮಾಣ ಕೊಡಿ", "कम मात्रा दें"),
    c("LATER", "Suggest a later date", "ನಂತರದ ದಿನಾಂಕ ಸೂಚಿಸಿ", "बाद की तारीख़ सुझाएँ"),
    c("DECLINE", "Decline the order", "ಆರ್ಡರ್ ನಿರಾಕರಿಸಿ", "ऑर्डर मना करें"),
  ],
  paymentMethods: [
    c("UPI", "UPI", "ಯುಪಿಐ", "यूपीआई", ["upi", "phonepe", "phone pe", "gpay", "google pay", "paytm", "ಯುಪಿಐ", "ಫೋನ್ ಪೇ", "ಗೂಗಲ್ ಪೇ", "यूपीआई", "फ़ोनपे", "फोनपे", "गूगल पे", "पेटीएम"]),
    c("ONLINE", "online through FoodFlow", "FoodFlow ಮೂಲಕ ಆನ್‌ಲೈನ್", "FoodFlow से ऑनलाइन", ["online", "card", "ಆನ್‌ಲೈನ್", "ಆನ್ಲೈನ್", "ऑनलाइन"]),
    c("CASH", "cash", "ನಗದು", "नक़द", ["cash", "ನಗದು", "ಕ್ಯಾಶ್", "नक़द", "नकद", "कैश", "nagadu", "nakad"]),
    c("BANK", "bank transfer", "ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ", "बैंक ट्रांसफ़र", ["bank", "neft", "imps", "transfer", "ಬ್ಯಾಂಕ್", "बैंक"]),
    c("TERMS", "credit terms for businesses", "ವ್ಯಾಪಾರಿಗಳಿಗೆ ಒಪ್ಪಿದ ಸಾಲದ ಅವಧಿ", "व्यापारियों के लिए उधार की शर्तें", ["terms", "credit", "later payment", "ಸಾಲ", "ಉದ್ರಿ", "उधार", "क्रेडिट"]),
  ],
  payoutPreference: [
    c("BANK", "Payout to my verified bank account", "ನನ್ನ ಬ್ಯಾಂಕ್ ಖಾತೆಗೆ", "मेरे बैंक खाते में"),
    c("UPI", "Payout through a supported UPI option", "ಯುಪಿಐ ಮೂಲಕ", "यूपीआई से"),
    c("LATER", "I'll set up my payout method later", "ನಂತರ ಹೊಂದಿಸುತ್ತೇನೆ", "बाद में तय करूँगा"),
  ],
  entityType: [
    c("INDIVIDUAL", "individual", "ವೈಯಕ್ತಿಕ", "व्यक्तिगत", ["individual", "myself", "personal", "single", "just me", "alone", "ವೈಯಕ್ತಿಕ", "ನಾನೊಬ್ಬನೇ", "ನಾನೇ", "व्यक्तिगत", "अकेले", "ख़ुद", "खुद"]),
    c("PARTNERSHIP", "partnership", "ಪಾಲುದಾರಿಕೆ", "साझेदारी", ["partner*", "ಪಾಲುದಾರ", "साझेदार", "पार्टनर"]),
    c("COOPERATIVE", "cooperative", "ಸಹಕಾರ ಸಂಘ / ಎಫ್‌ಪಿಒ", "सहकारी संस्था / एफ़पीओ", ["cooperative", "co-operative", "fpo", "society", "ಸಹಕಾರ", "ಸಂಘ", "सहकारी", "समिति"]),
    c("COMPANY", "company", "ಕಂಪನಿ", "कंपनी", ["company", "private limited", "pvt", "llp", "ಕಂಪನಿ", "कंपनी"]),
  ],
};

/** Every choice of a field as said in `lang`, for reading the options aloud. */
export const choicesSaid = (field: DisplayField, lang: AssistantLang) => CHOICES[field].map((o) => o.say[lang]);

/** A choice's label in `lang` (falls back to the value). */
export function choiceLabel(field: DisplayField, value: string, lang: AssistantLang): string {
  return CHOICES[field].find((o) => o.value === value)?.say[lang] ?? value;
}

// ── Matching ───────────────────────────────────────────────────────────
const isLatin = (s: string) => /^[a-z0-9 '*~&.-]+$/.test(s);
const norm = (s: string) => ` ${s.toLowerCase().normalize("NFC").replace(/[,.!?।;:"“”()]/g, " ").replace(/\s+/g, " ").trim()} `;

function hit(text: string, word: string): boolean {
  const w = word.replace(/^~/, "").toLowerCase();
  if (!isLatin(w)) return text.includes(w.normalize("NFC"));
  if (w.endsWith("*")) return text.includes(` ${w.slice(0, -1)}`);
  return text.includes(` ${w} `);
}

/** Words too common to tell options apart. */
const STOP = new Set([
  "and", "or", "the", "a", "an", "of", "to", "for", "with", "from", "only", "your", "you", "it", "is", "are", "my", "me", "we", "our", "they", "them", "their", "there", "this", "that", "these",
  "will", "have", "has", "some", "just", "like", "want", "would", "about", "please", "yeah", "okay", "think", "what", "which", "when", "then", "than", "more", "also", "kilos", "kilometres", "week", "size", "sizes", "order", "orders", "ones", "kind", "type", "types",
  "ಮತ್ತು", "ಅಥವಾ", "ಮಾತ್ರ", "ಒಳಗೆ", "ಕಿಲೋಮೀಟರ್", "ವಾರಕ್ಕೆ", "ಕಿಲೋ", "ಆರ್ಡರ್",
  "और", "या", "की", "के", "का", "में", "से", "पर", "है", "हैं", "तक", "सिर्फ़", "किलो", "किलोमीटर", "हफ़्ते", "ऑर्डर",
]);

/**
 * Words from each option's spoken labels (all three languages) that belong
 * to that option alone, so "ಸಣ್ಣ" or "wholesalers" pick their option even
 * when they aren't in the keyword list, while shared words pick nothing.
 */
const labelHintCache = new Map<DisplayField, string[][]>();
function labelHints(field: DisplayField): string[][] {
  let hints = labelHintCache.get(field);
  if (!hints) {
    const per = CHOICES[field].map(
      (o) =>
        new Set(
          Object.values(o.say)
            .flatMap((label) => label.toLowerCase().normalize("NFC").split(/[\s/,()]+/))
            .filter((w) => w.length >= 3 && !STOP.has(w) && !/\d/.test(w)),
        ),
    );
    hints = per.map((set, i) => [...set].filter((w) => per.every((other, j) => j === i || !other.has(w))));
    labelHintCache.set(field, hints);
  }
  return hints;
}

/** A Latin word said differently or cut short ("rest", "resturant", "aparments"), as weak evidence. */
function nearMiss(tokens: string[], words: string[]): boolean {
  const latin = words.map((w) => w.replace(/^~/, "").replace(/\*$/, "")).filter((w) => /^[a-z]{4,}$/.test(w));
  return tokens.some((tok) => latin.some((w) => w.startsWith(tok) || levenshtein(tok, w) <= (Math.min(tok.length, w.length) < 7 ? 1 : 2)));
}

/** How strongly the answer names each option (keywords, then words of the option's labels). */
function strongScores(text: string, field: DisplayField): number[] {
  const t = norm(text);
  const hints = labelHints(field);
  return CHOICES[field].map((o, i) => (o.words ?? []).reduce((sum, w) => sum + (hit(t, w) ? (w.startsWith("~") ? 0.5 : 1) : 0), 0) + hints[i].reduce((sum, w) => sum + (hit(t, w) ? 0.5 : 0), 0));
}

/** Options named only by a near miss ("apartmnts", "resturant"). */
function nearScores(text: string, field: DisplayField): number[] {
  const hints = labelHints(field);
  const tokens = norm(text)
    .trim()
    .split(" ")
    .filter((w) => /^[a-z]{4,}$/.test(w) && !STOP.has(w));
  return CHOICES[field].map((o, i) => (nearMiss(tokens, [...(o.words ?? []), ...hints[i]]) ? 0.25 : 0));
}

/** Strong matches, or near misses when nothing is named outright. */
function scores(text: string, field: DisplayField): number[] {
  const strong = strongScores(text, field);
  return strong.some((s) => s > 0) ? strong : nearScores(text, field);
}

/** Position words, checked before plain numbers so "the second one" means the second. */
const ORDINALS: [number, string[]][] = [
  [0, ["first", "1st", "ಮೊದಲ", "ಮೊದಲನೆ", "ಒಂದನೇ", "पहला", "पहले", "पहली", "pehla", "pahla", "modalu", "modalane"]],
  [1, ["second", "2nd", "ಎರಡನೇ", "दूसरा", "दूसरे", "दूसरी", "doosra", "dusra", "eradane"]],
  [2, ["third", "3rd", "ಮೂರನೇ", "तीसरा", "तीसरे", "तीसरी", "teesra", "tisra", "moorane"]],
  [3, ["fourth", "4th", "ನಾಲ್ಕನೇ", "चौथा", "चौथे", "चौथी", "chautha", "naalkane"]],
  [-1, ["last", "ಕೊನೆಯ", "ಕೊನೆಯದು", "आख़िरी", "आखिरी"]],
];
const CARDINALS: [number, string[]][] = [
  [0, ["one", "1", "ಒಂದು", "एक"]],
  [1, ["two", "2", "ಎರಡು", "दो"]],
  [2, ["three", "3", "ಮೂರು", "तीन"]],
  [3, ["four", "4", "ನಾಲ್ಕು", "चार"]],
];
const ALL_WORDS = ["all", "all of them", "everything", "every one", "ಎಲ್ಲಾ", "ಎಲ್ಲ", "ಎಲ್ಲವೂ", "ಎಲ್ಲರೂ", "सब", "सभी", "सबको", "sab", "sabhi"];

function ordinal(text: string, count: number): number | null {
  const t = norm(text);
  if (t.trim().split(" ").length > 3) return null;
  for (const list of [ORDINALS, CARDINALS]) {
    for (const [i, words] of list) if (words.some((w) => hit(t, w))) return i < 0 ? count - 1 : i < count ? i : null;
  }
  return null;
}

/** First number and unit said ("200 kilo", "ಎರಡು ಟನ್", "दस किलोमीटर"), or null. */
function amountSaid(text: string): { n: number; unit: string | null } | null {
  const { tokens } = normaliseUtterance(text);
  const i = tokens.findIndex((t) => /^\d+(\.\d+)?$/.test(t));
  if (i < 0) return null;
  return { n: Number(tokens[i]), unit: tokens[i + 1] ?? null };
}

const TONNE = /^(ton|tons|tonne|tonnes|ಟನ್|टन)/;
const QUINTAL = /^(quintal|quintals|ಕ್ವಿಂಟಲ್|क्विंटल)/;

/** Weekly supply bucket from "about 200 kilo" / "2 tonnes" / "ಐವತ್ತು ಕಿಲೋ". */
function capacityFromAmount(text: string): string | null {
  const a = amountSaid(text);
  if (!a) return null;
  const kg = a.n * (a.unit && TONNE.test(a.unit) ? 1000 : a.unit && QUINTAL.test(a.unit) ? 100 : 1);
  return kg < 25 ? "XS" : kg <= 100 ? "S" : kg <= 500 ? "M" : kg <= 2000 ? "L" : "XL";
}

/** Delivery radius bucket from "within 10 km" / "ಇಪ್ಪತ್ತು ಕಿಲೋಮೀಟರ್". */
function radiusFromAmount(text: string): string | null {
  const a = amountSaid(text);
  if (!a) return null;
  return a.n <= 5 ? "5" : a.n <= 10 ? "10" : a.n <= 25 ? "25" : a.n <= 50 ? "50" : "WIDE";
}

/** The one choice a spoken answer picks, or null when it's unclear. */
export function matchOne(field: ChoiceField, text: string): string | null {
  const options = CHOICES[field];
  const s = scores(text, field);
  const best = Math.max(...s);
  if (best > 0) {
    const winners = options.filter((_, i) => s[i] === best);
    if (winners.length === 1) return winners[0].value;
  }
  if (field === "capacity") return capacityFromAmount(text);
  if (field === "radius") return radiusFromAmount(text);
  const i = ordinal(text, options.length);
  return i === null ? null : options[i].value;
}

/** Every choice a spoken answer names ("restaurants and shops", "ಎಲ್ಲಾ"), or an empty list. */
export function matchMany(field: ChoiceField, text: string): string[] {
  const options = CHOICES[field];
  const t = norm(text);
  if (ALL_WORDS.some((w) => hit(t, w))) return options.map((o) => o.value);
  // A misspelling only counts when nothing is named outright: in "FoodFlow delivers",
  // "delivers" belongs to FoodFlow, not to "you deliver".
  const s = scores(text, field);
  return options.filter((_, i) => s[i] > 0).map((o) => o.value);
}

/** Yes or no in any of the three languages. */
export const matchYesNo = (text: string) => yesNo(text);

const SAME_AS_NAME = ["same", "same as my name", "my name", "use my name", "ಅದೇ", "ನನ್ನ ಹೆಸರು", "ನನ್ನ ಹೆಸರೇ", "वही", "मेरा नाम", "मेरे नाम", "मेरा नाम ही"];
/** "Same" / "ನನ್ನ ಹೆಸರೇ" / "मेरा नाम" in answer to the farm-name question. */
export const sameAsName = (text: string) => SAME_AS_NAME.includes(norm(text).trim());

// ── The conversation ───────────────────────────────────────────────────
export type Question =
  | { kind: "text"; field: "contactName" | "businessName" | "district" | "addressLine"; ask: L3 }
  | { kind: "phone"; field: "phone"; ask: L3 }
  | { kind: "pincode"; field: "pincode"; ask: L3 }
  | { kind: "village"; field: "village"; ask: L3 }
  | { kind: "crops"; field: "crops"; ask: L3 }
  | { kind: "one"; field: ChoiceField; ask: L3 }
  | { kind: "many"; field: ChoiceField; ask: L3 }
  | { kind: "yesno"; field: "authorised" | "accurate" | "agreeTerms"; ask: L3 };

const q = <Q extends Question>(question: Q) => question;

/** The questions on each of the six screens, in the order they're asked. */
export const SCRIPT: Question[][] = [
  [
    q({ kind: "text", field: "contactName", ask: { en: "First, what's your name?", kn: "ಮೊದಲು, ನಿಮ್ಮ ಹೆಸರೇನು?", hi: "पहले, आपका नाम क्या है?" } }),
    q({ kind: "text", field: "businessName", ask: { en: "What's your farm called? If it has no name, just say: my name.", kn: "ನಿಮ್ಮ ತೋಟದ ಹೆಸರೇನು? ಹೆಸರು ಇಲ್ಲದಿದ್ದರೆ, ನನ್ನ ಹೆಸರೇ ಎಂದು ಹೇಳಿ.", hi: "आपके खेत का नाम क्या है? कोई नाम नहीं है, तो बस बोलिए: मेरा नाम।" } }),
    q({ kind: "one", field: "sellerType", ask: { en: "Are you a farmer who grows it yourself, a farmer group, a large farm, a trader, or a shop?", kn: "ನೀವು ಸ್ವತಃ ಬೆಳೆಯುವ ರೈತರೇ, ರೈತ ಗುಂಪೇ, ದೊಡ್ಡ ತೋಟವೇ, ವ್ಯಾಪಾರಿಯೇ, ಅಥವಾ ಅಂಗಡಿಯೇ?", hi: "आप ख़ुद उगाने वाले किसान हैं, किसान समूह, बड़ा फ़ार्म, व्यापारी, या दुकान?" } }),
    q({ kind: "phone", field: "phone", ask: { en: "What's your 10-digit mobile number?", kn: "ನಿಮ್ಮ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ನಂಬರ್ ಹೇಳಿ.", hi: "अपना 10 अंकों का मोबाइल नंबर बताइए।" } }),
    q({ kind: "village", field: "village", ask: { en: "Which town or village is your farm in?", kn: "ನಿಮ್ಮ ತೋಟ ಯಾವ ಊರಿನಲ್ಲಿದೆ?", hi: "आपका खेत किस गाँव या कस्बे में है?" } }),
    q({ kind: "text", field: "district", ask: { en: "Which district is that in?", kn: "ಅದು ಯಾವ ಜಿಲ್ಲೆಯಲ್ಲಿದೆ?", hi: "वह किस ज़िले में है?" } }),
    q({ kind: "pincode", field: "pincode", ask: { en: "What's the 6-digit PIN code there?", kn: "ಅಲ್ಲಿಯ 6 ಅಂಕಿಯ ಪಿನ್ ಕೋಡ್ ಏನು?", hi: "वहाँ का 6 अंकों का पिन कोड क्या है?" } }),
    q({ kind: "text", field: "addressLine", ask: { en: "Tell me the farm address, or a landmark where buyers can collect.", kn: "ತೋಟದ ವಿಳಾಸ ಹೇಳಿ, ಅಥವಾ ಖರೀದಿದಾರರು ಬಂದು ತೆಗೆದುಕೊಳ್ಳಬಹುದಾದ ಗುರುತಿನ ಸ್ಥಳ ಹೇಳಿ.", hi: "खेत का पता बताइए, या कोई पहचान की जगह जहाँ से खरीदार सामान ले सकें।" } }),
    q({ kind: "one", field: "area", ask: { en: "Which FoodFlow area is nearest to you: Yelahanka, Hebbal or Jayanagar?", kn: "ನಿಮಗೆ ಹತ್ತಿರದ FoodFlow ಪ್ರದೇಶ ಯಾವುದು: ಯಲಹಂಕ, ಹೆಬ್ಬಾಳ, ಅಥವಾ ಜಯನಗರ?", hi: "आपके सबसे पास कौन सा FoodFlow इलाक़ा है: येलहंका, हेब्बाल या जयनगर?" } }),
    q({ kind: "one", field: "ownership", ask: { en: "Is it your own land, leased land, or do you buy from other farmers?", kn: "ಇದು ನಿಮ್ಮ ಸ್ವಂತ ಜಮೀನೇ, ಗುತ್ತಿಗೆ ಜಮೀನೇ, ಅಥವಾ ಬೇರೆ ರೈತರಿಂದ ಖರೀದಿಸುತ್ತೀರಾ?", hi: "यह आपकी अपनी ज़मीन है, किराये की, या आप दूसरे किसानों से खरीदते हैं?" } }),
  ],
  [
    q({ kind: "crops", field: "crops", ask: { en: "Which crops do you grow? You can say several, like tomato, onion and potato.", kn: "ನೀವು ಯಾವ ಬೆಳೆಗಳನ್ನು ಬೆಳೆಯುತ್ತೀರಿ? ಹಲವು ಹೇಳಬಹುದು, ಉದಾಹರಣೆಗೆ ಟೊಮೇಟೊ, ಈರುಳ್ಳಿ ಮತ್ತು ಆಲೂಗಡ್ಡೆ.", hi: "आप कौन सी फ़सलें उगाते हैं? कई बोल सकते हैं, जैसे टमाटर, प्याज़ और आलू।" } }),
    q({ kind: "one", field: "source", ask: { en: "Do you grow it yourself, does your group grow it, do you buy it, or is it a mix?", kn: "ನೀವೇ ಬೆಳೆಯುತ್ತೀರಾ, ನಿಮ್ಮ ಗುಂಪಿನ ರೈತರು ಬೆಳೆಯುತ್ತಾರಾ, ಖರೀದಿಸುತ್ತೀರಾ, ಅಥವಾ ಎರಡೂ?", hi: "आप ख़ुद उगाते हैं, आपके समूह के किसान उगाते हैं, आप खरीदते हैं, या दोनों?" } }),
    q({ kind: "one", field: "capacity", ask: { en: "About how much can you supply in a week? For example 50 kilo, 200 kilo, or 1 tonne.", kn: "ವಾರಕ್ಕೆ ಸುಮಾರು ಎಷ್ಟು ಕೊಡಬಲ್ಲಿರಿ? ಉದಾಹರಣೆಗೆ 50 ಕಿಲೋ, 200 ಕಿಲೋ, ಅಥವಾ 1 ಟನ್.", hi: "हफ़्ते में लगभग कितना दे सकते हैं? जैसे 50 किलो, 200 किलो, या 1 टन।" } }),
    q({ kind: "one", field: "availability", ask: { en: "How often do you have produce: every day, every week, only in season, or only when there's an order?", kn: "ನಿಮ್ಮ ಬಳಿ ಬೆಳೆ ಎಷ್ಟು ಬಾರಿ ಇರುತ್ತದೆ: ಪ್ರತಿದಿನ, ವಾರಕ್ಕೊಮ್ಮೆ, ಸೀಸನ್‌ನಲ್ಲಿ ಮಾತ್ರ, ಅಥವಾ ಆರ್ಡರ್ ಬಂದಾಗ ಮಾತ್ರ?", hi: "आपके पास उपज कितनी बार होती है: रोज़, हर हफ़्ते, सिर्फ़ सीज़न में, या ऑर्डर आने पर?" } }),
  ],
  [
    q({ kind: "many", field: "buyerTypes", ask: { en: "Who would you like to sell to? Families, restaurants, apartments, shops, wholesalers, hostels or mandis? Say as many as you like, or say all.", kn: "ಯಾರಿಗೆ ಮಾರಲು ಇಷ್ಟ? ಮನೆಗಳು, ಹೋಟೆಲ್‌ಗಳು, ಅಪಾರ್ಟ್‌ಮೆಂಟ್‌ಗಳು, ಅಂಗಡಿಗಳು, ಸಗಟು ವ್ಯಾಪಾರಿಗಳು, ಹಾಸ್ಟೆಲ್‌ಗಳು, ಅಥವಾ ಮಂಡಿ? ಎಷ್ಟಾದರೂ ಹೇಳಿ, ಅಥವಾ ಎಲ್ಲಾ ಎನ್ನಿ.", hi: "आप किसे बेचना चाहेंगे? घर-परिवार, रेस्टोरेंट, अपार्टमेंट, दुकानें, थोक व्यापारी, हॉस्टल, या मंडी? जितने चाहें बोलें, या सब कहें।" } }),
    q({ kind: "one", field: "orderSizes", ask: { en: "What order sizes suit you: small orders from homes, medium orders, bulk orders, or all sizes?", kn: "ಯಾವ ಆರ್ಡರ್ ನಿಮಗೆ ಸರಿ: ಮನೆಗಳ ಸಣ್ಣ ಆರ್ಡರ್, ಮಧ್ಯಮ, ದೊಡ್ಡ ಆರ್ಡರ್, ಅಥವಾ ಎಲ್ಲಾ?", hi: "कैसे ऑर्डर ठीक लगते हैं: घरों के छोटे, मध्यम, बड़े थोक ऑर्डर, या सभी?" } }),
  ],
  [
    q({ kind: "many", field: "fulfilment", ask: { en: "How can buyers get your produce? They pick it up, you deliver, FoodFlow arranges delivery, or another delivery service? You can say more than one.", kn: "ಖರೀದಿದಾರರು ಬೆಳೆಯನ್ನು ಹೇಗೆ ಪಡೆಯುತ್ತಾರೆ? ಅವರೇ ಬಂದು ತೆಗೆದುಕೊಳ್ಳುತ್ತಾರೆ, ನೀವೇ ತಲುಪಿಸುತ್ತೀರಿ, FoodFlow ಡೆಲಿವರಿ ಮಾಡುತ್ತದೆ, ಅಥವಾ ಬೇರೆ ಡೆಲಿವರಿ ಸೇವೆ? ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಹೇಳಬಹುದು.", hi: "खरीदार उपज कैसे लेंगे? ख़ुद आकर ले जाएँ, आप पहुँचाएँ, FoodFlow डिलीवरी करे, या कोई और डिलीवरी सर्विस? एक से ज़्यादा बोल सकते हैं।" } }),
    q({ kind: "one", field: "radius", ask: { en: "How far can you serve? 5, 10, 25 or 50 kilometres, or further?", kn: "ಎಷ್ಟು ದೂರದವರೆಗೆ ಕೊಡಬಲ್ಲಿರಿ? 5, 10, 25, ಅಥವಾ 50 ಕಿಲೋಮೀಟರ್, ಅಥವಾ ಇನ್ನೂ ದೂರ?", hi: "आप कितनी दूर तक दे सकते हैं? 5, 10, 25 या 50 किलोमीटर, या और दूर?" } }),
    q({ kind: "one", field: "deliveryFee", ask: { en: "Who should pay for delivery: the buyer, you, half and half, or does it depend?", kn: "ಡೆಲಿವರಿ ಶುಲ್ಕ ಯಾರು ಕೊಡಬೇಕು: ಖರೀದಿದಾರರು, ನೀವು, ಅರ್ಧ ಅರ್ಧ, ಅಥವಾ ಆರ್ಡರ್ ಮೇಲೆ ಅವಲಂಬಿತ?", hi: "डिलीवरी का पैसा कौन देगा: खरीदार, आप, आधा-आधा, या ऑर्डर पर निर्भर?" } }),
    q({ kind: "one", field: "packing", ask: { en: "Who packs the order: you, the buyer with their own bags, or the delivery partner?", kn: "ಆರ್ಡರ್ ಅನ್ನು ಯಾರು ಪ್ಯಾಕ್ ಮಾಡುತ್ತಾರೆ: ನೀವು, ಚೀಲ ತರುವ ಖರೀದಿದಾರರು, ಅಥವಾ ಡೆಲಿವರಿ ಪಾಲುದಾರರು?", hi: "ऑर्डर कौन पैक करेगा: आप, अपना थैला लाने वाला खरीदार, या डिलीवरी पार्टनर?" } }),
  ],
  [q({ kind: "many", field: "paymentMethods", ask: { en: "How will you take payment: UPI, online through FoodFlow, cash, or bank transfer? Say all that work for you.", kn: "ಹಣ ಹೇಗೆ ಪಡೆಯುತ್ತೀರಿ: ಯುಪಿಐ, FoodFlow ಮೂಲಕ ಆನ್‌ಲೈನ್, ನಗದು, ಅಥವಾ ಬ್ಯಾಂಕ್ ವರ್ಗಾವಣೆ? ಸರಿಹೊಂದುವ ಎಲ್ಲವನ್ನೂ ಹೇಳಿ.", hi: "भुगतान कैसे लेंगे: यूपीआई, FoodFlow से ऑनलाइन, नक़द, या बैंक ट्रांसफ़र? जो भी ठीक हों, सब बोलें।" } })],
  [
    q({ kind: "one", field: "entityType", ask: { en: "How are you registered: as an individual, a partnership, a cooperative, or a company?", kn: "ನೀವು ಹೇಗೆ ನೋಂದಾಯಿಸಿಕೊಂಡಿದ್ದೀರಿ: ವೈಯಕ್ತಿಕ, ಪಾಲುದಾರಿಕೆ, ಸಹಕಾರ ಸಂಘ, ಅಥವಾ ಕಂಪನಿ?", hi: "आप किस रूप में रजिस्टर्ड हैं: व्यक्तिगत, साझेदारी, सहकारी संस्था, या कंपनी?" } }),
    q({ kind: "yesno", field: "authorised", ask: { en: "Are you allowed to sell this produce for this farm? Say yes to confirm.", kn: "ಈ ತೋಟದ ಬೆಳೆಯನ್ನು ಮಾರಲು ನಿಮಗೆ ಅಧಿಕಾರ ಇದೆಯೇ? ಖಚಿತಪಡಿಸಲು ಹೌದು ಎನ್ನಿ.", hi: "क्या आपको इस खेत की उपज बेचने का अधिकार है? पक्का करने के लिए हाँ बोलें।" } }),
    q({ kind: "yesno", field: "accurate", ask: { en: "Will you keep your quantities and availability up to date?", kn: "ನಿಮ್ಮ ಪ್ರಮಾಣ ಮತ್ತು ಲಭ್ಯತೆಯನ್ನು ಸರಿಯಾಗಿ ಇಡುತ್ತೀರಾ?", hi: "क्या आप मात्रा और उपलब्धता सही रखेंगे?" } }),
    q({ kind: "yesno", field: "agreeTerms", ask: { en: "Do you agree to the seller terms and privacy policy? They're linked on the screen.", kn: "ಮಾರಾಟಗಾರರ ನಿಯಮಗಳು ಮತ್ತು ಗೌಪ್ಯತಾ ನೀತಿಗೆ ಒಪ್ಪುತ್ತೀರಾ? ಅವುಗಳ ಲಿಂಕ್ ಪರದೆಯ ಮೇಲಿದೆ.", hi: "क्या आप विक्रेता शर्तों और निजता नीति से सहमत हैं? उनका लिंक स्क्रीन पर है।" } }),
  ],
];

/** What the guide says, outside the questions. */
export const LINES = {
  intro: { en: "Namaskara! I'm Sakhi. I'll set up your seller account with you, one question at a time. Just answer out loud, or type if you prefer.", kn: "ನಮಸ್ಕಾರ! ನಾನು ಸಖಿ. ನಿಮ್ಮ ಮಾರಾಟಗಾರರ ಖಾತೆಯನ್ನು ನಿಮ್ಮ ಜೊತೆ, ಒಂದೊಂದೇ ಪ್ರಶ್ನೆ ಕೇಳಿ ತೆರೆಯುತ್ತೇನೆ. ಉತ್ತರವನ್ನು ಜೋರಾಗಿ ಹೇಳಿ, ಬೇಕಿದ್ದರೆ ಟೈಪ್ ಮಾಡಿ.", hi: "नमस्ते! मैं सखी हूँ। आपका विक्रेता खाता आपके साथ, एक-एक सवाल पूछकर बनाऊँगी। बस बोलकर जवाब दीजिए, या चाहें तो लिखिए।" },
  step: [
    { en: "", kn: "", hi: "" },
    { en: "Step 2 of 6, your produce.", kn: "ಎರಡನೇ ಹಂತ, ನಿಮ್ಮ ಬೆಳೆ.", hi: "दूसरा कदम, आपकी उपज।" },
    { en: "Step 3, your buyers.", kn: "ಮೂರನೇ ಹಂತ, ನಿಮ್ಮ ಖರೀದಿದಾರರು.", hi: "तीसरा कदम, आपके खरीदार।" },
    { en: "Step 4, delivery.", kn: "ನಾಲ್ಕನೇ ಹಂತ, ಡೆಲಿವರಿ.", hi: "चौथा कदम, डिलीवरी।" },
    { en: "Step 5, payment. You always set your own price, and we never ask for bank details here.", kn: "ಐದನೇ ಹಂತ, ಪಾವತಿ. ಬೆಲೆಯನ್ನು ಯಾವಾಗಲೂ ನೀವೇ ನಿರ್ಧರಿಸುತ್ತೀರಿ, ಇಲ್ಲಿ ಬ್ಯಾಂಕ್ ವಿವರ ಕೇಳುವುದಿಲ್ಲ.", hi: "पाँचवाँ कदम, भुगतान। दाम हमेशा आप तय करते हैं, और यहाँ बैंक की जानकारी नहीं माँगी जाती।" },
    { en: "Last step.", kn: "ಕೊನೆಯ ಹಂತ.", hi: "आख़िरी कदम।" },
  ] as L3[],
  got: { en: "Got it, {value}.", kn: "ಸರಿ, {value}.", hi: "ठीक है, {value}।" },
  ok: { en: "Okay.", kn: "ಸರಿ.", hi: "ठीक है।" },
  /** Taken in turn after a choice, so the guide doesn't sound like a form. */
  picked: [
    { en: "Okay, {value}.", kn: "ಸರಿ, {value}.", hi: "ठीक है, {value}।" },
    { en: "Got it, {value}.", kn: "{value}, ಗುರುತು ಮಾಡಿದೆ.", hi: "अच्छा, {value}।" },
    { en: "Noted, {value}.", kn: "ಆಯ್ತು, {value}.", hi: "{value}, नोट कर लिया।" },
  ] as L3[],
  farmSame: { en: "Okay, the farm is {value} too.", kn: "ಸರಿ, ತೋಟದ ಹೆಸರೂ {value}.", hi: "ठीक है, खेत का नाम भी {value}।" },
  village: { en: "{village}, in {district} district. Your nearest FoodFlow area is {area}.", kn: "{village}, {district} ಜಿಲ್ಲೆ. ನಿಮಗೆ ಹತ್ತಿರದ FoodFlow ಪ್ರದೇಶ {area}.", hi: "{village}, {district} ज़िला। आपके सबसे पास का FoodFlow इलाक़ा {area} है।" },
  villageArea: { en: "{village}. Your nearest FoodFlow area is {area}.", kn: "{village}. ನಿಮಗೆ ಹತ್ತಿರದ FoodFlow ಪ್ರದೇಶ {area}.", hi: "{village}। आपके सबसे पास का FoodFlow इलाक़ा {area} है।" },
  pinCheck: { en: "Is the PIN code {pin}?", kn: "ಪಿನ್ ಕೋಡ್ {pin}, ಸರಿಯೇ?", hi: "पिन कोड {pin} है, सही?" },
  badPhone: { en: "I heard {n} digits. Please say all 10 digits of your mobile number again.", kn: "ನಾನು {n} ಅಂಕಿಗಳನ್ನು ಕೇಳಿದೆ. ದಯವಿಟ್ಟು ಮೊಬೈಲ್ ನಂಬರ್‌ನ ಎಲ್ಲಾ 10 ಅಂಕಿಗಳನ್ನು ಮತ್ತೆ ಹೇಳಿ.", hi: "मैंने {n} अंक सुने। कृपया मोबाइल नंबर के सभी 10 अंक फिर से बोलें।" },
  badPin: { en: "A PIN code has 6 digits, and I heard {n}. Please say it again.", kn: "ಪಿನ್ ಕೋಡ್‌ನಲ್ಲಿ 6 ಅಂಕಿಗಳಿರುತ್ತವೆ, ನಾನು {n} ಕೇಳಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಹೇಳಿ.", hi: "पिन कोड में 6 अंक होते हैं, मैंने {n} सुने। कृपया फिर से बोलें।" },
  unclear: { en: "Sorry, I didn't catch that. You can also tap your answer on the screen.", kn: "ಕ್ಷಮಿಸಿ, ಅರ್ಥವಾಗಲಿಲ್ಲ. ಪರದೆಯ ಮೇಲೆ ಉತ್ತರವನ್ನು ಟ್ಯಾಪ್ ಕೂಡ ಮಾಡಬಹುದು.", hi: "माफ़ कीजिए, समझ नहीं पाई। आप स्क्रीन पर जवाब टैप भी कर सकते हैं।" },
  options: { en: "You can say {options}.", kn: "ನೀವು {options} ಎಂದು ಹೇಳಬಹುದು.", hi: "आप {options} बोल सकते हैं।" },
  unclearOptions: { en: "Sorry, I didn't catch that. You can say {options}, or tap it on the screen.", kn: "ಕ್ಷಮಿಸಿ, ಅರ್ಥವಾಗಲಿಲ್ಲ. ನೀವು {options} ಎಂದು ಹೇಳಬಹುದು, ಅಥವಾ ಪರದೆಯ ಮೇಲೆ ಒತ್ತಬಹುದು.", hi: "माफ़ कीजिए, समझ नहीं पाई। आप {options} बोल सकते हैं, या स्क्रीन पर दबा सकते हैं।" },
  yesOrNo: { en: "Just say yes or no.", kn: "ಹೌದು ಅಥವಾ ಇಲ್ಲ ಎಂದು ಹೇಳಿ.", hi: "बस हाँ या नहीं बोलिए।" },
  noCrop: { en: "I didn't catch a crop name. Try saying: tomato, onion.", kn: "ಬೆಳೆಯ ಹೆಸರು ಅರ್ಥವಾಗಲಿಲ್ಲ. ಹೀಗೆ ಹೇಳಿ: ಟೊಮೇಟೊ, ಈರುಳ್ಳಿ.", hi: "फ़सल का नाम समझ नहीं आया। ऐसे बोलें: टमाटर, प्याज़।" },
  crops: { en: "Added {crops}.", kn: "{crops} ಸೇರಿಸಿದ್ದೇನೆ.", hi: "{crops} जोड़ दिए।" },
  declined: { en: "No problem. You'll need to tick that box before the account can be created.", kn: "ಪರವಾಗಿಲ್ಲ. ಖಾತೆ ತೆರೆಯುವ ಮೊದಲು ಆ ಬಾಕ್ಸ್ ಟಿಕ್ ಮಾಡಬೇಕಾಗುತ್ತದೆ.", hi: "कोई बात नहीं। खाता बनाने से पहले वह बॉक्स टिक करना होगा।" },
  pin: { en: "Now type a 4 to 6 digit PIN in the PIN box. Please type it, don't say it out loud. I'll wait.", kn: "ಈಗ ಪಿನ್ ಬಾಕ್ಸ್‌ನಲ್ಲಿ 4 ರಿಂದ 6 ಅಂಕಿಯ ಪಿನ್ ಟೈಪ್ ಮಾಡಿ. ಅದನ್ನು ಜೋರಾಗಿ ಹೇಳಬೇಡಿ. ನಾನು ಕಾಯುತ್ತೇನೆ.", hi: "अब पिन बॉक्स में 4 से 6 अंकों का पिन टाइप करें। उसे बोलें नहीं। मैं इंतज़ार करती हूँ।" },
  create: { en: "All set, {name}. Shall I create your seller account now?", kn: "{name}, ಎಲ್ಲಾ ಸಿದ್ಧ. ಈಗ ನಿಮ್ಮ ಮಾರಾಟಗಾರರ ಖಾತೆ ತೆರೆಯಲೇ?", hi: "{name} जी, सब तैयार है। अब आपका विक्रेता खाता बना दूँ?" },
  creating: { en: "Creating your account…", kn: "ನಿಮ್ಮ ಖಾತೆ ತೆರೆಯುತ್ತಿದ್ದೇನೆ…", hi: "आपका खाता बना रही हूँ…" },
  notNow: { en: "Okay. Tap Create my seller account whenever you're ready.", kn: "ಸರಿ. ಸಿದ್ಧವಾದಾಗ Create my seller account ಒತ್ತಿ.", hi: "ठीक है। जब तैयार हों, Create my seller account दबाएँ।" },
  notYet: { en: "Something on this screen still needs an answer. Look for the red note above the Next button.", kn: "ಈ ಪರದೆಯಲ್ಲಿ ಇನ್ನೂ ಏನೋ ತುಂಬಬೇಕಿದೆ. Next ಬಟನ್ ಮೇಲಿನ ಕೆಂಪು ಸೂಚನೆ ನೋಡಿ.", hi: "इस स्क्रीन पर अभी कुछ भरना बाक़ी है। Next बटन के ऊपर लाल संदेश देखें।" },
  failed: { en: "The account couldn't be created: {reason}", kn: "ಖಾತೆ ತೆರೆಯಲು ಆಗಲಿಲ್ಲ: {reason}", hi: "खाता नहीं बन पाया: {reason}" },
} satisfies Record<string, L3 | L3[]>;

/** Fills `{name}` placeholders in a line. */
export const fill = (line: string, vars: Record<string, string | number> = {}) => line.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
