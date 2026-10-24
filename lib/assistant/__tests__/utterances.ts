// Sample farmer utterances (English, Hindi, Kannada and code-mixed) with
// the intent and entities the rule parser must extract. Used by
// tests/assistant-parser.test.ts to measure the parser's pass rate.
import type { Entities, Intent } from "../intents";

export interface Utterance {
  lang: "en" | "hi" | "kn";
  text: string;
  intent: Intent;
  /** Only the listed entities are checked. */
  entities?: Entities;
}

/** Harvest dates are relative to this fixed "now". */
export const FIXTURE_NOW = new Date("2026-10-23T09:00:00");
const TODAY = "2026-10-23";
const YESTERDAY = "2026-10-22";

export const UTTERANCES: Utterance[] = [
  // ── English ─────────────────────────────────────────────────────────
  { lang: "en", text: "I want to sell 50 kg tomatoes at 25 rupees per kg", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, unit: "kg", price: 25 } },
  { lang: "en", text: "List 2 quintal onions, harvested today", intent: "CREATE_LISTING_DRAFT", entities: { crop: "onion", qty: 200, unit: "kg", harvestDate: TODAY } },
  { lang: "en", text: "fifty kilo potato for twenty two rupees a kilo", intent: "CREATE_LISTING_DRAFT", entities: { crop: "potato", qty: 50, price: 22 } },
  { lang: "en", text: "I picked 30 kg of tamato yesterday", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 30, harvestDate: YESTERDAY } },
  { lang: "en", text: "How much did I earn this week?", intent: "CHECK_EARNINGS", entities: { period: "week" } },
  { lang: "en", text: "what are my total earnings", intent: "CHECK_EARNINGS", entities: { period: "all" } },
  { lang: "en", text: "Has my payment come for order FF-7K2QA?", intent: "CHECK_PAYMENT_STATUS", entities: { orderCode: "FF-7K2QA" } },
  { lang: "en", text: "How much onion stock do I have left?", intent: "CHECK_STOCK", entities: { crop: "onion" } },
  { lang: "en", text: "Set my tomato stock to 40 kg", intent: "UPDATE_STOCK", entities: { crop: "tomato", qty: 40 } },
  { lang: "en", text: "What is the price of my beans?", intent: "CHECK_LISTING_PRICE", entities: { crop: "beans" } },
  { lang: "en", text: "Change tomato price to 30", intent: "UPDATE_PRICE", entities: { crop: "tomato", price: 30 } },
  { lang: "en", text: "Is my spinach listing approved?", intent: "CHECK_LISTING_STATUS", entities: { crop: "spinach" } },
  { lang: "en", text: "Show me restaurant orders", intent: "LIST_BULK_DEMANDS" },
  { lang: "en", text: "Can I supply 50 kg onions?", intent: "CAN_FULFIL_DEMAND", entities: { crop: "onion", qty: 50 } },
  { lang: "en", text: "Offer 40 kg onion at 28 rupees", intent: "RESPOND_TO_OFFER", entities: { crop: "onion", qty: 40, price: 28 } },
  { lang: "en", text: "Where is my delivery?", intent: "DELIVERY_STATUS" },
  { lang: "en", text: "Book delivery for order FF-AB3CD", intent: "BOOK_DELIVERY", entities: { orderCode: "FF-AB3CD" } },
  { lang: "en", text: "help", intent: "HELP" },
  { lang: "en", text: "hello there", intent: "SMALLTALK" },
  { lang: "en", text: "50 kilo tomato, 25 rupaye kilo", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, price: 25 } },

  // ── Hindi (Devanagari, romanised and code-mixed) ────────────────────
  { lang: "hi", text: "पचास किलो टमाटर, पच्चीस रुपये किलो, आज तोड़े", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, unit: "kg", price: 25, harvestDate: TODAY } },
  { lang: "hi", text: "मुझे डेढ़ सौ किलो प्याज बेचना है", intent: "CREATE_LISTING_DRAFT", entities: { crop: "onion", qty: 150 } },
  { lang: "hi", text: "50 kilo tamatar, 25 rupaye kilo", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, price: 25 } },
  // English numbers in the middle of Hindi, as the Hindi recogniser writes them
  { lang: "hi", text: "फिफ्टी किलो टमाटर ट्वेंटी फाइव रुपीस किलो", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, price: 25 } },
  { lang: "hi", text: "टू हंड्रेड किलो प्याज बेचना है, थर्टी रुपये किलो", intent: "CREATE_LISTING_DRAFT", entities: { crop: "onion", qty: 200, price: 30 } },
  { lang: "hi", text: "मुझे forty किलो आलू बेचना है twenty rupees किलो", intent: "CREATE_LISTING_DRAFT", entities: { crop: "potato", qty: 40, price: 20 } },
  { lang: "hi", text: "do quintal aloo bechna hai tees rupaye kilo", intent: "CREATE_LISTING_DRAFT", entities: { crop: "potato", qty: 200, price: 30 } },
  { lang: "hi", text: "kal tode 40 kilo gajar", intent: "CREATE_LISTING_DRAFT", entities: { crop: "carrot", qty: 40, harvestDate: YESTERDAY } },
  { lang: "hi", text: "इस हफ्ते मैंने कितना कमाया?", intent: "CHECK_EARNINGS", entities: { period: "week" } },
  { lang: "hi", text: "is mahine ki kamai kitni hai", intent: "CHECK_EARNINGS", entities: { period: "month" } },
  { lang: "hi", text: "मेरा भुगतान आया क्या?", intent: "CHECK_PAYMENT_STATUS" },
  { lang: "hi", text: "प्याज का स्टॉक कितना बचा है", intent: "CHECK_STOCK", entities: { crop: "onion" } },
  { lang: "hi", text: "टमाटर का स्टॉक बीस किलो कर दो", intent: "UPDATE_STOCK", entities: { crop: "tomato", qty: 20 } },
  { lang: "hi", text: "टमाटर का भाव क्या है", intent: "CHECK_LISTING_PRICE", entities: { crop: "tomato" } },
  { lang: "hi", text: "tamatar ka daam tees rupaye kar do", intent: "UPDATE_PRICE", entities: { crop: "tomato", price: 30 } },
  { lang: "hi", text: "मेरी पालक मंज़ूर हुई क्या", intent: "CHECK_LISTING_STATUS", entities: { crop: "spinach" } },
  { lang: "hi", text: "होटल वालों की मांग दिखाओ", intent: "LIST_BULK_DEMANDS" },
  { lang: "hi", text: "kya main 50 kilo pyaaz de sakta hoon", intent: "CAN_FULFIL_DEMAND", entities: { crop: "onion", qty: 50 } },
  { lang: "hi", text: "restaurant ko 40 kilo pyaaz 28 rupaye mein offer karo", intent: "RESPOND_TO_OFFER", entities: { crop: "onion", qty: 40, price: 28 } },
  { lang: "hi", text: "मेरी डिलीवरी कहाँ है", intent: "DELIVERY_STATUS" },
  { lang: "hi", text: "डिलीवरी बुक करो", intent: "BOOK_DELIVERY" },
  { lang: "hi", text: "मदद चाहिए", intent: "HELP" },
  { lang: "hi", text: "नमस्ते", intent: "SMALLTALK" },

  // ── Kannada (script, romanised and code-mixed) ──────────────────────
  { lang: "kn", text: "ಐವತ್ತು ಕಿಲೋ ಟೊಮೇಟೊ, ಕಿಲೋಗೆ ಇಪ್ಪತ್ತೈದು ರೂಪಾಯಿ", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, unit: "kg", price: 25 } },
  { lang: "kn", text: "ನೂರು ಕೆಜಿ ಈರುಳ್ಳಿ ಮಾರಾಟ ಮಾಡಬೇಕು", intent: "CREATE_LISTING_DRAFT", entities: { crop: "onion", qty: 100 } },
  { lang: "kn", text: "ಫಿಫ್ಟಿ ಕಿಲೋ ಟೊಮೇಟೊ, ಕಿಲೋಗೆ ಟ್ವೆಂಟಿ ಫೈವ್ ರೂಪಾಯಿ", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, price: 25 } },
  { lang: "kn", text: "ಇಂದು ಕೊಯ್ದ ಮೂವತ್ತು ಕಿಲೋ ಆಲೂಗಡ್ಡೆ", intent: "CREATE_LISTING_DRAFT", entities: { crop: "potato", qty: 30, harvestDate: TODAY } },
  { lang: "kn", text: "aivattu kilo tomato ippattaidu rupayi", intent: "CREATE_LISTING_DRAFT", entities: { crop: "tomato", qty: 50, price: 25 } },
  { lang: "kn", text: "50 kg eerulli kilo ge 30 rupees", intent: "CREATE_LISTING_DRAFT", entities: { crop: "onion", qty: 50, price: 30 } },
  { lang: "kn", text: "ಈ ವಾರ ನಾನು ಎಷ್ಟು ಗಳಿಸಿದೆ", intent: "CHECK_EARNINGS", entities: { period: "week" } },
  { lang: "kn", text: "ಈ ತಿಂಗಳ ಆದಾಯ ಎಷ್ಟು", intent: "CHECK_EARNINGS", entities: { period: "month" } },
  { lang: "kn", text: "ನನ್ನ ಪಾವತಿ ಬಂದಿದೆಯಾ", intent: "CHECK_PAYMENT_STATUS" },
  { lang: "kn", text: "ಈರುಳ್ಳಿ ಸ್ಟಾಕ್ ಎಷ್ಟು ಉಳಿದಿದೆ", intent: "CHECK_STOCK", entities: { crop: "onion" } },
  { lang: "kn", text: "ಟೊಮೇಟೊ ಸ್ಟಾಕ್ ಇಪ್ಪತ್ತು ಕೆಜಿ ಮಾಡಿ", intent: "UPDATE_STOCK", entities: { crop: "tomato", qty: 20 } },
  { lang: "kn", text: "ಟೊಮೇಟೊ ಬೆಲೆ ಎಷ್ಟು", intent: "CHECK_LISTING_PRICE", entities: { crop: "tomato" } },
  { lang: "kn", text: "ಟೊಮೇಟೊ ಬೆಲೆ ಮೂವತ್ತು ರೂಪಾಯಿ ಮಾಡಿ", intent: "UPDATE_PRICE", entities: { crop: "tomato", price: 30 } },
  { lang: "kn", text: "ನನ್ನ ಪಾಲಕ್ ಅನುಮೋದನೆ ಆಯಿತಾ", intent: "CHECK_LISTING_STATUS", entities: { crop: "spinach" } },
  { lang: "kn", text: "ಹೋಟೆಲ್ ಬೇಡಿಕೆ ತೋರಿಸಿ", intent: "LIST_BULK_DEMANDS" },
  { lang: "kn", text: "ನಾನು ಐವತ್ತು ಕೆಜಿ ಈರುಳ್ಳಿ ಕೊಡಬಹುದಾ", intent: "CAN_FULFIL_DEMAND", entities: { crop: "onion", qty: 50 } },
  { lang: "kn", text: "ಹೋಟೆಲ್‌ಗೆ ನಲವತ್ತು ಕೆಜಿ ಈರುಳ್ಳಿ ಇಪ್ಪತ್ತೆಂಟು ರೂಪಾಯಿಗೆ ಆಫರ್ ಮಾಡಿ", intent: "RESPOND_TO_OFFER", entities: { crop: "onion", qty: 40, price: 28 } },
  { lang: "kn", text: "ನನ್ನ ಡೆಲಿವರಿ ಎಲ್ಲಿದೆ", intent: "DELIVERY_STATUS" },
  { lang: "kn", text: "ಡೆಲಿವರಿ ಬುಕ್ ಮಾಡಿ", intent: "BOOK_DELIVERY" },
  { lang: "kn", text: "ಸಹಾಯ ಬೇಕು", intent: "HELP" },
  { lang: "kn", text: "ನಮಸ್ಕಾರ", intent: "SMALLTALK" },
];
