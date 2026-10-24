// What Sakhi can answer besides the task at hand: what FoodFlow is, who
// Sakhi is, fees, getting paid, why a detail is asked, privacy, delivery,
// how selling works, and small talk. Used by the sign-up guide (answer,
// then repeat the pending question) and by Sakhi in the farmer app (when
// a request isn't an action). Every answer describes what the app really
// does; amounts and areas match lib/fees.ts and the pilot service areas.
import type { AssistantLang } from "./intents";

type L3 = Record<AssistantLang, string>;

export type FaqTopic =
  | "about"
  | "sakhi"
  | "cost"
  | "payout"
  | "privacy"
  | "delivery"
  | "howSell"
  | "review"
  | "price"
  | "language"
  | "buyers"
  | "areas"
  | "contact"
  | "documents"
  | "help"
  | "options"
  | "why"
  | "greet"
  | "thanks";

/** Why the guide asks for a detail, by the kind of question. */
export type WhyKind = "phone" | "place" | "identity" | "produce" | "buyers" | "payment" | "consent";

interface Entry {
  topic: FaqTopic;
  /** Latin words match whole words (a trailing * matches a prefix); Kannada and Hindi match as substrings. */
  words: string[];
  answer: L3;
}

const ENTRIES: Entry[] = [
  {
    topic: "sakhi",
    words: ["who are you", "your name", "sakhi", "are you a robot", "are you human", "ಸಖಿ", "ನೀನು ಯಾರು", "ನೀವು ಯಾರು", "ನಿನ್ನ ಹೆಸರು", "ನಿಮ್ಮ ಹೆಸರೇನು", "सखी", "तुम कौन", "आप कौन", "तुम्हारा नाम", "आपका नाम क्या", "tum kaun", "aap kaun", "neenu yaaru", "neevu yaaru"],
    answer: {
      en: "I'm Sakhi, FoodFlow's voice helper for farmers. I help you sign up, list your harvest, and check your orders, stock and payments, in Kannada, Hindi or English.",
      kn: "ನಾನು ಸಖಿ, ರೈತರಿಗಾಗಿ FoodFlow ನ ಧ್ವನಿ ಸಹಾಯಕಿ. ನೋಂದಣಿ ಮಾಡಲು, ಬೆಳೆ ಪಟ್ಟಿ ಮಾಡಲು, ಮತ್ತು ಆರ್ಡರ್, ದಾಸ್ತಾನು, ಹಣದ ವಿವರ ನೋಡಲು ಕನ್ನಡ, ಹಿಂದಿ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ.",
      hi: "मैं सखी हूँ, किसानों के लिए FoodFlow की आवाज़ सहायक। मैं साइन-अप करने, फ़सल लिस्ट करने, और ऑर्डर, स्टॉक और भुगतान देखने में कन्नड़, हिंदी या अंग्रेज़ी में मदद करती हूँ।",
    },
  },
  {
    topic: "about",
    words: ["foodflow", "food flow", "this app", "this site", "this website", "this platform", "the app", "what is this", "what's this", "about foodflow", "about this", "ಫುಡ್ ಫ್ಲೋ", "ಫುಡ್‌ಫ್ಲೋ", "ಈ ಆಪ್", "ಈ ಆ್ಯಪ್", "ಈ ಅಪ್ಲಿಕೇಶನ್", "ಈ ವೆಬ್‌ಸೈಟ್", "ಇದು ಏನು", "ಇದೇನು", "ಏನಿದು", "ಯಾವುದಕ್ಕೆ", "ಫುಡ್ಫ್ಲೋ", "फूडफ्लो", "फ़ूड फ़्लो", "फूड फ्लो", "यह ऐप", "ये ऐप", "इस ऐप", "यह क्या है", "ये क्या है", "वेबसाइट", "ye app", "yeh app", "ee app", "idu enu"],
    answer: {
      en: "FoodFlow connects farmers directly with families, restaurants, hostels and community kitchens around Bengaluru. You list your harvest and set your own price, buyers order online, and you are paid after the delivery is confirmed. No middlemen.",
      kn: "FoodFlow ರೈತರನ್ನು ಬೆಂಗಳೂರಿನ ಮನೆಗಳು, ಹೋಟೆಲ್‌ಗಳು, ಹಾಸ್ಟೆಲ್‌ಗಳು ಮತ್ತು ಸಮುದಾಯ ಅಡುಗೆಮನೆಗಳ ಜೊತೆ ನೇರವಾಗಿ ಸೇರಿಸುತ್ತದೆ. ನೀವು ಬೆಳೆಯನ್ನು ಪಟ್ಟಿ ಮಾಡಿ ಬೆಲೆಯನ್ನು ನೀವೇ ನಿರ್ಧರಿಸುತ್ತೀರಿ. ಖರೀದಿದಾರರು ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಆರ್ಡರ್ ಮಾಡುತ್ತಾರೆ, ಡೆಲಿವರಿ ಖಚಿತವಾದ ಮೇಲೆ ನಿಮಗೆ ಹಣ ಬರುತ್ತದೆ. ಮಧ್ಯವರ್ತಿಗಳಿಲ್ಲ.",
      hi: "FoodFlow किसानों को बेंगलुरु के घरों, रेस्टोरेंट, हॉस्टल और सामुदायिक रसोइयों से सीधे जोड़ता है। आप अपनी फ़सल लिस्ट करते हैं और दाम ख़ुद तय करते हैं, खरीदार ऑनलाइन ऑर्डर करते हैं, और डिलीवरी पक्की होने के बाद आपको पैसा मिलता है। कोई बिचौलिया नहीं।",
    },
  },
  {
    topic: "cost",
    words: ["free", "cost*", "charge*", "fee", "fees", "commission", "pay to join", "money to join", "how much do you take", "ಉಚಿತ", "ಫ್ರೀ", "ಶುಲ್ಕ", "ಕಮಿಷನ್", "ಎಷ್ಟು ತೆಗೆದುಕೊಳ್ಳುತ್ತೀರ", "ಹಣ ಕೊಡಬೇಕಾ", "ದುಡ್ಡು ಕೊಡಬೇಕಾ", "मुफ़्त", "मुफ्त", "फ्री", "शुल्क", "फ़ीस", "फीस", "कमीशन", "पैसे लगेंगे", "पैसा लगेगा", "कितना लगेगा", "चार्ज", "kitna lagega", "paisa lagega"],
    answer: {
      en: "Joining FoodFlow is free. A small commission, 5 percent by default, is kept only from what you actually sell, and you always set your own price.",
      kn: "FoodFlow ಗೆ ಸೇರುವುದು ಉಚಿತ. ನೀವು ನಿಜವಾಗಿ ಮಾರಿದ್ದರ ಮೇಲೆ ಮಾತ್ರ ಸಣ್ಣ ಕಮಿಷನ್, ಸಾಮಾನ್ಯವಾಗಿ ಶೇಕಡಾ ಐದು, ತೆಗೆದುಕೊಳ್ಳಲಾಗುತ್ತದೆ. ಬೆಲೆಯನ್ನು ಯಾವಾಗಲೂ ನೀವೇ ನಿರ್ಧರಿಸುತ್ತೀರಿ.",
      hi: "FoodFlow से जुड़ना मुफ़्त है। जो आप सच में बेचते हैं, सिर्फ़ उसी पर छोटा कमीशन लगता है, आम तौर पर 5 प्रतिशत, और दाम हमेशा आप ख़ुद तय करते हैं।",
    },
  },
  {
    topic: "payout",
    words: ["get paid", "get my money", "get money", "when will i get", "payout*", "settle*", "my money", "ಹಣ ಯಾವಾಗ", "ಹಣ ಹೇಗೆ", "ದುಡ್ಡು ಯಾವಾಗ", "ದುಡ್ಡು ಹೇಗೆ", "ಹಣ ಬರುತ್ತ", "ದುಡ್ಡು ಬರುತ್ತ", "ಪಾವತಿ ಹೇಗೆ", "पैसा कब", "पैसे कब", "पैसा कैसे", "पैसे कैसे", "भुगतान कब", "भुगतान कैसे", "पेमेंट कब", "paisa kab", "paise kab", "hana yavaga"],
    answer: {
      en: "Buyers pay online when they order. Once the buyer confirms the handover with their OTP, your share is set aside and paid out in the next settlement. You can see every rupee under Payments.",
      kn: "ಖರೀದಿದಾರರು ಆರ್ಡರ್ ಮಾಡುವಾಗಲೇ ಆನ್‌ಲೈನ್‌ನಲ್ಲಿ ಹಣ ಕಟ್ಟುತ್ತಾರೆ. ಖರೀದಿದಾರರು ಒಟಿಪಿ ಹೇಳಿ ಸರಕು ಸಿಕ್ಕಿದ್ದನ್ನು ಖಚಿತಪಡಿಸಿದ ಮೇಲೆ, ನಿಮ್ಮ ಪಾಲು ಮುಂದಿನ ಪಾವತಿಯಲ್ಲಿ ನಿಮಗೆ ಬರುತ್ತದೆ. ಪ್ರತಿ ರೂಪಾಯಿಯನ್ನೂ ಪಾವತಿಗಳು ವಿಭಾಗದಲ್ಲಿ ನೋಡಬಹುದು.",
      hi: "खरीदार ऑर्डर करते समय ही ऑनलाइन पैसे देते हैं। जब खरीदार OTP देकर सामान मिलना पक्का कर देते हैं, तो आपका हिस्सा अगले भुगतान में आपको मिल जाता है। हर रुपये का हिसाब पेमेंट्स में दिखता है।",
    },
  },
  {
    topic: "privacy",
    words: ["safe", "secure", "privacy", "private", "my data", "my details", "share my", "trust", "fraud", "scam", "ಸುರಕ್ಷಿತ", "ಗೌಪ್ಯ", "ನನ್ನ ಮಾಹಿತಿ", "ನಂಬಬಹುದ", "ಮೋಸ", "सुरक्षित", "डेटा", "मेरी जानकारी", "भरोसा", "धोखा", "गोपनीय"],
    answer: {
      en: "Your details are used only for your account, your orders and your payments. FoodFlow will never ask for your bank password, UPI PIN or an OTP for payouts.",
      kn: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನಿಮ್ಮ ಖಾತೆ, ಆರ್ಡರ್ ಮತ್ತು ಪಾವತಿಗೆ ಮಾತ್ರ ಬಳಸುತ್ತೇವೆ. FoodFlow ಎಂದಿಗೂ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಪಾಸ್‌ವರ್ಡ್, ಯುಪಿಐ ಪಿನ್ ಅಥವಾ ಹಣ ಪಡೆಯಲು ಒಟಿಪಿ ಕೇಳುವುದಿಲ್ಲ.",
      hi: "आपकी जानकारी सिर्फ़ आपके खाते, ऑर्डर और भुगतान के लिए इस्तेमाल होती है। FoodFlow कभी आपका बैंक पासवर्ड, UPI पिन या पैसे पाने के लिए OTP नहीं माँगेगा।",
    },
  },
  {
    topic: "delivery",
    words: ["delivery", "deliver", "pickup", "pick up", "rider", "transport", "how will it reach", "ಡೆಲಿವರಿ", "ಸಾಗಣೆ", "ತಲುಪಿಸ", "ಹೇಗೆ ತಲುಪ", "ಪಿಕಪ್", "डिलीवरी", "पहुँचा", "पहुंचा", "कैसे पहुँच", "कैसे पहुंच", "पिकअप"],
    answer: {
      en: "Buyers can collect from you, you can deliver yourself, or FoodFlow books a rider. Every handover is confirmed with the buyer's OTP, so payment is safe for both sides.",
      kn: "ಖರೀದಿದಾರರು ನಿಮ್ಮ ಬಳಿ ಬಂದು ತೆಗೆದುಕೊಳ್ಳಬಹುದು, ನೀವೇ ತಲುಪಿಸಬಹುದು, ಅಥವಾ FoodFlow ಡೆಲಿವರಿ ವ್ಯಕ್ತಿಯನ್ನು ಕಳುಹಿಸುತ್ತದೆ. ಪ್ರತಿ ಹಸ್ತಾಂತರವನ್ನು ಖರೀದಿದಾರರ ಒಟಿಪಿಯಿಂದ ಖಚಿತಪಡಿಸಲಾಗುತ್ತದೆ, ಹಾಗಾಗಿ ಇಬ್ಬರಿಗೂ ಹಣ ಸುರಕ್ಷಿತ.",
      hi: "खरीदार आपके पास से ले जा सकते हैं, आप ख़ुद पहुँचा सकते हैं, या FoodFlow राइडर भेजता है। हर सौंपने को खरीदार के OTP से पक्का किया जाता है, इसलिए दोनों के लिए भुगतान सुरक्षित है।",
    },
  },
  {
    topic: "howSell",
    words: ["how to sell", "how do i sell", "how can i sell", "how to list", "add my harvest", "add harvest", "list my", "upload", "ಮಾರುವುದು ಹೇಗೆ", "ಹೇಗೆ ಮಾರ", "ಮಾರಾಟ ಹೇಗೆ", "ಬೆಳೆ ಸೇರಿಸ", "ಪಟ್ಟಿ ಮಾಡುವುದು", "कैसे बेच", "बेचूँ कैसे", "बेचूं कैसे", "कैसे लिस्ट", "फ़सल कैसे डाल", "फसल कैसे डाल", "kaise bechu", "kaise bechein"],
    answer: {
      en: "After you sign up, tap the plus button or just tell me, for example: fifty kilo tomato, twenty five rupees a kilo. Add a photo, and once our team checks it, buyers can order it.",
      kn: "ನೋಂದಣಿ ಆದ ಮೇಲೆ, ಪ್ಲಸ್ ಬಟನ್ ಒತ್ತಿ ಅಥವಾ ನನಗೆ ಹೇಳಿ, ಉದಾಹರಣೆಗೆ: ಐವತ್ತು ಕಿಲೋ ಟೊಮೇಟೊ, ಕಿಲೋಗೆ ಇಪ್ಪತ್ತೈದು ರೂಪಾಯಿ. ಒಂದು ಫೋಟೋ ಸೇರಿಸಿ, ನಮ್ಮ ತಂಡ ಪರಿಶೀಲಿಸಿದ ಮೇಲೆ ಖರೀದಿದಾರರು ಆರ್ಡರ್ ಮಾಡಬಹುದು.",
      hi: "साइन-अप के बाद प्लस बटन दबाइए या मुझे बताइए, जैसे: पचास किलो टमाटर, पच्चीस रुपये किलो। एक फ़ोटो जोड़िए, हमारी टीम जाँच कर ले तो खरीदार ऑर्डर कर सकते हैं।",
    },
  },
  {
    topic: "review",
    words: ["review", "verif*", "approv*", "quality check", "who checks", "ಪರಿಶೀಲನೆ", "ಪರಿಶೀಲಿಸ", "ಅನುಮೋದ", "ಗುಣಮಟ್ಟ", "जाँच", "जांच", "मंज़ूरी", "मंजूरी", "क्वालिटी", "गुणवत्ता"],
    answer: {
      en: "Every harvest is checked by a person on our team before buyers can see it. The photo check only helps them; it never decides on its own.",
      kn: "ಪ್ರತಿ ಬೆಳೆಯನ್ನೂ ಖರೀದಿದಾರರಿಗೆ ತೋರಿಸುವ ಮೊದಲು ನಮ್ಮ ತಂಡದ ಒಬ್ಬರು ಪರಿಶೀಲಿಸುತ್ತಾರೆ. ಫೋಟೋ ಪರಿಶೀಲನೆ ಅವರಿಗೆ ಸಹಾಯ ಮಾತ್ರ, ತಾನೇ ನಿರ್ಧಾರ ಮಾಡುವುದಿಲ್ಲ.",
      hi: "हर फ़सल खरीदारों को दिखने से पहले हमारी टीम का कोई व्यक्ति जाँचता है। फ़ोटो जाँच सिर्फ़ मदद करती है, ख़ुद फ़ैसला नहीं करती।",
    },
  },
  {
    topic: "price",
    words: ["what price", "which price", "how much should i", "price should", "mandi rate", "market rate", "ಯಾವ ಬೆಲೆ", "ಎಷ್ಟು ಬೆಲೆ", "ಬೆಲೆ ಎಷ್ಟು ಇಡ", "ಮಂಡಿ ದರ", "ಮಾರುಕಟ್ಟೆ ದರ", "क्या दाम", "कितना दाम", "दाम कितना रख", "मंडी भाव", "मंडी रेट", "बाज़ार भाव"],
    answer: {
      en: "You set your own price. I can show the mandi rate for your crop as a guide, but the final price is always yours.",
      kn: "ಬೆಲೆಯನ್ನು ನೀವೇ ನಿರ್ಧರಿಸುತ್ತೀರಿ. ಮಾರ್ಗದರ್ಶನಕ್ಕೆ ನಿಮ್ಮ ಬೆಳೆಯ ಮಂಡಿ ದರ ತೋರಿಸುತ್ತೇನೆ, ಆದರೆ ಕೊನೆಯ ಬೆಲೆ ಯಾವಾಗಲೂ ನಿಮ್ಮದೇ.",
      hi: "दाम आप ख़ुद तय करते हैं। अंदाज़े के लिए मैं आपकी फ़सल का मंडी भाव दिखा सकती हूँ, पर आख़िरी दाम हमेशा आपका।",
    },
  },
  {
    topic: "language",
    words: ["language", "which languages", "speak kannada", "speak hindi", "speak english", "ಭಾಷೆ", "ಯಾವ ಭಾಷೆ", "भाषा", "कौन सी भाषा", "bhasha"],
    answer: {
      en: "You can talk to me in Kannada, Hindi or English. Change the language with the language button at the top.",
      kn: "ನನ್ನ ಜೊತೆ ಕನ್ನಡ, ಹಿಂದಿ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಮಾತನಾಡಬಹುದು. ಮೇಲಿನ ಭಾಷೆ ಬಟನ್‌ನಿಂದ ಭಾಷೆ ಬದಲಿಸಿ.",
      hi: "आप मुझसे कन्नड़, हिंदी या अंग्रेज़ी में बात कर सकते हैं। ऊपर के भाषा बटन से भाषा बदलिए।",
    },
  },
  {
    topic: "buyers",
    words: ["who buys", "who will buy", "who are the buyers", "customers", "ಯಾರು ಖರೀದಿಸ", "ಯಾರು ಕೊಳ್ಳ", "ಗ್ರಾಹಕರು ಯಾರು", "ಖರೀದಿದಾರರು ಯಾರು", "कौन खरीद", "खरीदार कौन", "ग्राहक कौन"],
    answer: {
      en: "Families, restaurants, hostels, apartments and community kitchens near you buy on FoodFlow. Restaurants also post bulk orders that you can make an offer on.",
      kn: "ನಿಮ್ಮ ಹತ್ತಿರದ ಮನೆಗಳು, ಹೋಟೆಲ್‌ಗಳು, ಹಾಸ್ಟೆಲ್‌ಗಳು, ಅಪಾರ್ಟ್‌ಮೆಂಟ್‌ಗಳು ಮತ್ತು ಸಮುದಾಯ ಅಡುಗೆಮನೆಗಳು FoodFlow ನಲ್ಲಿ ಖರೀದಿಸುತ್ತವೆ. ಹೋಟೆಲ್‌ಗಳು ದೊಡ್ಡ ಆರ್ಡರ್‌ಗಳನ್ನೂ ಹಾಕುತ್ತವೆ, ಅವಕ್ಕೆ ನೀವು ಆಫರ್ ಕೊಡಬಹುದು.",
      hi: "आपके पास के घर, रेस्टोरेंट, हॉस्टल, अपार्टमेंट और सामुदायिक रसोइयाँ FoodFlow पर खरीदते हैं। रेस्टोरेंट थोक ऑर्डर भी डालते हैं, जिन पर आप ऑफ़र दे सकते हैं।",
    },
  },
  {
    topic: "areas",
    words: ["which area", "which areas", "which city", "where do you", "where does", "where is foodflow", "available in", "work in my", "ಯಾವ ಪ್ರದೇಶ", "ಎಲ್ಲೆಲ್ಲಿ", "ಯಾವ ಊರು", "ಯಾವ ನಗರ", "ಎಲ್ಲಿ ಸಿಗುತ್ತ", "कौन से इलाक", "किस शहर", "कहाँ मिलता", "कहाँ चलता", "कहां चलता"],
    answer: {
      en: "Right now FoodFlow works around Bengaluru, delivering in Yelahanka, Hebbal and Jayanagar. More areas are coming.",
      kn: "ಸದ್ಯಕ್ಕೆ FoodFlow ಬೆಂಗಳೂರಿನಲ್ಲಿ, ಯಲಹಂಕ, ಹೆಬ್ಬಾಳ ಮತ್ತು ಜಯನಗರದಲ್ಲಿ ಡೆಲಿವರಿ ಮಾಡುತ್ತದೆ. ಇನ್ನಷ್ಟು ಪ್ರದೇಶಗಳು ಬರಲಿವೆ.",
      hi: "अभी FoodFlow बेंगलुरु में चलता है, येलहंका, हेब्बाल और जयनगर में डिलीवरी होती है। और इलाक़े जल्द जुड़ेंगे।",
    },
  },
  {
    topic: "contact",
    words: ["contact", "support", "customer care", "helpline", "complain*", "talk to a person", "talk to someone", "ಸಂಪರ್ಕ", "ದೂರು", "ಸಹಾಯವಾಣಿ", "ಯಾರ ಜೊತೆ ಮಾತನಾಡ", "संपर्क", "शिकायत", "हेल्पलाइन", "किसी से बात"],
    answer: {
      en: "Use the contact form on the FoodFlow home page, and our team will get back to you.",
      kn: "FoodFlow ಮುಖಪುಟದ ಸಂಪರ್ಕ ಫಾರ್ಮ್ ಬಳಸಿ, ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
      hi: "FoodFlow के होम पेज पर संपर्क फ़ॉर्म भरिए, हमारी टीम आपसे संपर्क करेगी।",
    },
  },
  {
    topic: "documents",
    words: ["document*", "aadhaar", "aadhar", "kyc", "papers", "certificate", "how long", "how much time", "ದಾಖಲೆ", "ಆಧಾರ್", "ಪ್ರಮಾಣಪತ್ರ", "ಎಷ್ಟು ಸಮಯ", "ಎಷ್ಟು ಹೊತ್ತು", "दस्तावेज़", "दस्तावेज", "आधार", "कागज़", "कागज", "कितना समय", "कितनी देर"],
    answer: {
      en: "No documents are needed to sign up. It takes about five minutes, and payout details are set up later through a secure payment provider.",
      kn: "ನೋಂದಣಿಗೆ ಯಾವುದೇ ದಾಖಲೆ ಬೇಡ. ಸುಮಾರು ಐದು ನಿಮಿಷ ಸಾಕು. ಹಣ ಪಡೆಯುವ ವಿವರಗಳನ್ನು ನಂತರ ಸುರಕ್ಷಿತ ಪಾವತಿ ಸೇವೆಯ ಮೂಲಕ ಹೊಂದಿಸಬಹುದು.",
      hi: "साइन-अप के लिए कोई दस्तावेज़ नहीं चाहिए। लगभग पाँच मिनट लगते हैं, और पैसे पाने की जानकारी बाद में सुरक्षित भुगतान सेवा से जोड़ी जाती है।",
    },
  },
  {
    topic: "options",
    words: ["options", "option", "choices", "what can i choose", "what can i say", "which ones", "ಆಯ್ಕೆಗಳು", "ಆಯ್ಕೆ ಏನು", "ಏನೇನು ಇದೆ", "ವಿಕಲ್ಪ", "विकल्प", "ऑप्शन", "क्या क्या है", "क्या-क्या है"],
    answer: { en: "", kn: "", hi: "" },
  },
  {
    topic: "help",
    words: ["help", "what should i say", "what do i say", "what to say", "how does this work", "i don't understand", "i dont understand", "didn't understand", "confused", "ಸಹಾಯ", "ಏನು ಹೇಳಬೇಕು", "ಅರ್ಥ ಆಗಲಿಲ್ಲ", "ಅರ್ಥವಾಗಲಿಲ್ಲ", "ಗೊತ್ತಾಗಲಿಲ್ಲ", "मदद", "क्या बोलूँ", "क्या बोलूं", "क्या बोलना", "समझ नहीं आया", "समझ नहीं आ रहा", "madad"],
    answer: {
      en: "Just answer the question in a few words, out loud or by typing, or tap your answer on the screen. You can also say: repeat, go back, skip, or next.",
      kn: "ಪ್ರಶ್ನೆಗೆ ಕೆಲವು ಪದಗಳಲ್ಲಿ ಉತ್ತರಿಸಿ, ಮಾತನಾಡಿ ಅಥವಾ ಟೈಪ್ ಮಾಡಿ, ಅಥವಾ ಪರದೆಯ ಮೇಲೆ ಉತ್ತರ ಒತ್ತಿ. ಮತ್ತೆ, ಹಿಂದೆ, ಬಿಟ್ಟುಬಿಡಿ, ಅಥವಾ ಮುಂದೆ ಎಂದೂ ಹೇಳಬಹುದು.",
      hi: "सवाल का जवाब कुछ शब्दों में दीजिए, बोलकर या लिखकर, या स्क्रीन पर जवाब दबाइए। आप फिर से, पीछे, छोड़ो या आगे भी बोल सकते हैं।",
    },
  },
];

const GREET = ["hi", "hello", "hey", "hai", "namaste", "namaskar", "namaskara", "good morning", "good evening", "ನಮಸ್ಕಾರ", "ನಮಸ್ತೆ", "ಹಲೋ", "ಹಾಯ್", "नमस्ते", "नमस्कार", "हेलो", "हैलो", "राम राम"];
const THANKS = ["thanks", "thank you", "thank you so much", "thx", "dhanyavad", "dhanyavaad", "shukriya", "ಧನ್ಯವಾದ", "ಧನ್ಯವಾದಗಳು", "ಥ್ಯಾಂಕ್ಸ್", "ಥ್ಯಾಂಕ್ ಯು", "धन्यवाद", "शुक्रिया", "थैंक यू", "थैंक्स"];

export const GREET_REPLY: L3 = { en: "Namaskara!", kn: "ನಮಸ್ಕಾರ!", hi: "नमस्ते!" };
export const THANKS_REPLY: L3 = { en: "You're welcome!", kn: "ಪರವಾಗಿಲ್ಲ, ಸಂತೋಷ!", hi: "कोई बात नहीं!" };

/** Words that make an utterance a question rather than an answer. */
const CUES = [
  "what", "what's", "why", "how", "who", "which", "when", "where", "is it", "is there", "are you", "can i", "can you", "do i", "do you", "will i", "should i", "tell me", "explain",
  "ಏನು", "ಏನಿದು", "ಯಾಕೆ", "ಏಕೆ", "ಹೇಗೆ", "ಯಾರು", "ಯಾವ", "ಯಾವಾಗ", "ಎಲ್ಲಿ", "ಎಷ್ಟು", "ಬಗ್ಗೆ ಹೇಳಿ", "ಹೇಳಿ ಕೊಡಿ", "ಇದೆಯಾ", "ಇದೆಯೇ", "ಬೇಕಾ", "ಬೇಕೇ", "ಸಿಗುತ್ತಾ", "ಆಗುತ್ತಾ",
  "क्या", "क्यों", "कैसे", "कौन", "कब", "कहाँ", "कहां", "कितना", "कितने", "कितनी", "बताइए", "बताओ", "के बारे में", "समझाइए",
  "kya", "kyon", "kyun", "kaise", "kaun", "kab", "kahan", "yaake", "yake", "hege", "enu", "yaaru",
];
const WHY = ["why", "why do you", "ಯಾಕೆ", "ಏಕೆ", "क्यों", "kyon", "kyun", "yaake"];

const isLatin = (s: string) => /^[a-z0-9 '*.-]+$/.test(s);
const norm = (s: string) => ` ${s.toLowerCase().normalize("NFC").replace(/[,.!?।;:"“”()]/g, " ").replace(/\s+/g, " ").trim()} `;
function hit(text: string, word: string): boolean {
  const w = word.toLowerCase();
  if (!isLatin(w)) return text.includes(w.normalize("NFC"));
  if (w.endsWith("*")) return text.includes(` ${w.slice(0, -1)}`);
  return text.includes(` ${w} `);
}

/** Every fixed answer, for preparing the voice ahead of time. */
export const allFaqAnswers = (): L3[] => [...ENTRIES.map((e) => e.answer).filter((a) => a.en), ...Object.values(WHY_ANSWERS), GREET_REPLY, THANKS_REPLY];

export interface FaqHit {
  topic: FaqTopic;
  answer: L3;
}

/**
 * What a question is about, or null when the utterance isn't one we answer.
 * @param opts.answering - true while a question is pending (the sign-up guide):
 *   then a topic only counts if the utterance is phrased as a question, so an
 *   answer like "online through FoodFlow" isn't mistaken for "what is FoodFlow?"
 */
export function matchFaq(text: string, opts: { answering?: boolean } = {}): FaqHit | null {
  const t = norm(text);
  const bare = t.trim();
  if (!bare) return null;
  if (GREET.some((g) => bare === g || bare === `${g} sakhi` || bare === `${g} ಸಖಿ` || bare === `${g} सखी`)) return { topic: "greet", answer: GREET_REPLY };
  if (THANKS.some((g) => bare === g || bare.startsWith(`${g} `) && bare.split(" ").length <= 4)) return { topic: "thanks", answer: THANKS_REPLY };

  const asked = text.trim().endsWith("?") || CUES.some((c) => hit(t, c));
  let best: { entry: Entry; score: number } | null = null;
  for (const entry of ENTRIES) {
    const score = entry.words.reduce((s, w) => s + (hit(t, w) ? (w.includes(" ") ? 2 : 1) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  if (best) {
    // Help and "what are the options" count even when they're not phrased as questions.
    const always = best.entry.topic === "help" || best.entry.topic === "options";
    if (always || !opts.answering || asked) return { topic: best.entry.topic, answer: best.entry.answer };
  }
  if (WHY.some((w) => hit(t, w))) return { topic: "why", answer: WHY_ANSWERS.general };
  return null;
}

/** Why the guide asks for each kind of detail. */
export const WHY_ANSWERS: Record<WhyKind | "general", L3> = {
  general: {
    en: "Everything I ask helps buyers trust you and helps us send you the right orders. Nothing is shared beyond what an order needs.",
    kn: "ನಾನು ಕೇಳುವ ಪ್ರತಿಯೊಂದೂ ಖರೀದಿದಾರರು ನಿಮ್ಮನ್ನು ನಂಬಲು ಮತ್ತು ನಿಮಗೆ ಸರಿಯಾದ ಆರ್ಡರ್ ಕಳುಹಿಸಲು ಸಹಾಯ ಮಾಡುತ್ತದೆ. ಆರ್ಡರ್‌ಗೆ ಬೇಕಾದಷ್ಟು ಮಾತ್ರ ಹಂಚಲಾಗುತ್ತದೆ.",
    hi: "मैं जो भी पूछती हूँ, उससे खरीदारों को आप पर भरोसा होता है और आपको सही ऑर्डर मिलते हैं। ऑर्डर के लिए जितना ज़रूरी हो, उतना ही साझा होता है।",
  },
  phone: {
    en: "Your mobile number is how you sign in, and how buyers and delivery riders reach you about an order. It's used only for your account and your orders.",
    kn: "ಮೊಬೈಲ್ ನಂಬರ್ ಮೂಲಕ ನೀವು ಲಾಗಿನ್ ಆಗುತ್ತೀರಿ, ಮತ್ತು ಆರ್ಡರ್ ಬಗ್ಗೆ ಖರೀದಿದಾರರು ಹಾಗೂ ಡೆಲಿವರಿ ವ್ಯಕ್ತಿ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತಾರೆ. ಇದನ್ನು ನಿಮ್ಮ ಖಾತೆ ಮತ್ತು ಆರ್ಡರ್‌ಗಳಿಗೆ ಮಾತ್ರ ಬಳಸುತ್ತೇವೆ.",
    hi: "मोबाइल नंबर से आप लॉग इन करते हैं, और ऑर्डर के बारे में खरीदार और डिलीवरी राइडर आपसे संपर्क करते हैं। इसका इस्तेमाल सिर्फ़ आपके खाते और ऑर्डर के लिए होता है।",
  },
  place: {
    en: "Your village, PIN code and address tell buyers where your produce comes from and where to collect it, and let us show your harvest to buyers nearby.",
    kn: "ನಿಮ್ಮ ಊರು, ಪಿನ್ ಕೋಡ್ ಮತ್ತು ವಿಳಾಸದಿಂದ ಬೆಳೆ ಎಲ್ಲಿಂದ ಬರುತ್ತದೆ, ಎಲ್ಲಿ ತೆಗೆದುಕೊಳ್ಳಬೇಕು ಎಂದು ಖರೀದಿದಾರರಿಗೆ ತಿಳಿಯುತ್ತದೆ, ಮತ್ತು ಹತ್ತಿರದ ಖರೀದಿದಾರರಿಗೆ ನಿಮ್ಮ ಬೆಳೆ ತೋರಿಸಲು ಸಾಧ್ಯವಾಗುತ್ತದೆ.",
    hi: "आपके गाँव, पिन कोड और पते से खरीदारों को पता चलता है कि उपज कहाँ से आती है और कहाँ से लेनी है, और हम आपकी फ़सल पास के खरीदारों को दिखा पाते हैं।",
  },
  identity: {
    en: "Buyers see your name and farm name on your harvest, and knowing how you farm helps our team check listings fairly.",
    kn: "ಖರೀದಿದಾರರು ನಿಮ್ಮ ಬೆಳೆಯ ಜೊತೆ ನಿಮ್ಮ ಹೆಸರು ಮತ್ತು ತೋಟದ ಹೆಸರು ನೋಡುತ್ತಾರೆ. ನೀವು ಹೇಗೆ ಕೃಷಿ ಮಾಡುತ್ತೀರಿ ಎಂದು ತಿಳಿದರೆ ನಮ್ಮ ತಂಡ ಪಟ್ಟಿಗಳನ್ನು ನ್ಯಾಯವಾಗಿ ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    hi: "खरीदार आपकी फ़सल के साथ आपका और आपके खेत का नाम देखते हैं, और आप कैसे खेती करते हैं यह जानकर हमारी टीम लिस्टिंग ठीक से जाँचती है।",
  },
  produce: {
    en: "Knowing your crops and how much you can supply lets us match you with buyers who need exactly that.",
    kn: "ನಿಮ್ಮ ಬೆಳೆಗಳು ಮತ್ತು ಎಷ್ಟು ಕೊಡಬಲ್ಲಿರಿ ಎಂದು ತಿಳಿದರೆ, ಅದನ್ನೇ ಬಯಸುವ ಖರೀದಿದಾರರ ಜೊತೆ ನಿಮ್ಮನ್ನು ಸೇರಿಸಬಹುದು.",
    hi: "आपकी फ़सलें और आप कितना दे सकते हैं, यह जानकर हम आपको उन्हीं खरीदारों से जोड़ते हैं जिन्हें वही चाहिए।",
  },
  buyers: {
    en: "This decides which orders reach you: who buys, how big the orders are, and how the produce gets to them.",
    kn: "ಇದರಿಂದ ನಿಮಗೆ ಯಾವ ಆರ್ಡರ್ ಬರಬೇಕು ಎಂದು ತೀರ್ಮಾನವಾಗುತ್ತದೆ: ಯಾರು ಖರೀದಿಸುತ್ತಾರೆ, ಎಷ್ಟು ದೊಡ್ಡ ಆರ್ಡರ್, ಮತ್ತು ಬೆಳೆ ಅವರಿಗೆ ಹೇಗೆ ತಲುಪುತ್ತದೆ.",
    hi: "इससे तय होता है कि कौन से ऑर्डर आप तक पहुँचें: कौन खरीदता है, ऑर्डर कितने बड़े हैं, और उपज उन तक कैसे पहुँचती है।",
  },
  payment: {
    en: "So buyers know how they can pay you. FoodFlow never asks for your bank password, UPI PIN or an OTP.",
    kn: "ಖರೀದಿದಾರರು ನಿಮಗೆ ಹೇಗೆ ಹಣ ಕೊಡಬಹುದು ಎಂದು ತಿಳಿಯಲು. FoodFlow ಎಂದಿಗೂ ಬ್ಯಾಂಕ್ ಪಾಸ್‌ವರ್ಡ್, ಯುಪಿಐ ಪಿನ್ ಅಥವಾ ಒಟಿಪಿ ಕೇಳುವುದಿಲ್ಲ.",
    hi: "ताकि खरीदार जानें कि वे आपको कैसे भुगतान कर सकते हैं। FoodFlow कभी बैंक पासवर्ड, UPI पिन या OTP नहीं माँगता।",
  },
  consent: {
    en: "These confirm that you're allowed to sell this produce and will keep your listings honest. That protects buyers, and it protects you.",
    kn: "ಈ ಬೆಳೆಯನ್ನು ಮಾರಲು ನಿಮಗೆ ಹಕ್ಕಿದೆ ಮತ್ತು ನಿಮ್ಮ ಪಟ್ಟಿಗಳು ಸರಿಯಾಗಿರುತ್ತವೆ ಎಂದು ಇವು ಖಚಿತಪಡಿಸುತ್ತವೆ. ಇದು ಖರೀದಿದಾರರನ್ನೂ ನಿಮ್ಮನ್ನೂ ರಕ್ಷಿಸುತ್ತದೆ.",
    hi: "इनसे पक्का होता है कि आप यह उपज बेच सकते हैं और आपकी लिस्टिंग सही रहेगी। इससे खरीदार भी सुरक्षित रहते हैं और आप भी।",
  },
};

const WHY_ABOUT: [WhyKind, string[]][] = [
  ["phone", ["number", "mobile", "phone", "ನಂಬರ್", "ಮೊಬೈಲ್", "ಫೋನ್", "नंबर", "मोबाइल", "फ़ोन", "फोन"]],
  ["place", ["address", "village", "pin code", "pincode", "location", "district", "ವಿಳಾಸ", "ಊರು", "ಪಿನ್", "ಜಿಲ್ಲೆ", "ಸ್ಥಳ", "पता", "गाँव", "गांव", "पिन", "ज़िला", "जिला", "जगह"]],
  ["identity", ["name", "farm name", "ಹೆಸರು", "नाम"]],
  ["produce", ["crop*", "how much", "supply", "ಬೆಳೆ", "ಎಷ್ಟು ಕೊಡ", "फ़सल", "फसल", "कितना दे"]],
  ["payment", ["payment", "upi", "cash", "bank", "ಪಾವತಿ", "ಹಣ", "ಬ್ಯಾಂಕ್", "भुगतान", "पैसे", "बैंक"]],
];

/** Which detail a "why do you need …" question is about, if it names one. */
export function whyAbout(text: string): WhyKind | null {
  const t = norm(text);
  return WHY_ABOUT.find(([, words]) => words.some((w) => hit(t, w)))?.[0] ?? null;
}

/** Which "why" answer fits a sign-up field. */
export function whyKind(field: string): WhyKind {
  if (field === "phone") return "phone";
  if (["village", "district", "pincode", "addressLine", "area"].includes(field)) return "place";
  if (["contactName", "businessName", "sellerType", "ownership", "entityType"].includes(field)) return "identity";
  if (["crops", "categories", "source", "capacity", "availability"].includes(field)) return "produce";
  if (["buyerTypes", "orderSizes", "fulfilment", "radius", "deliveryFee", "packing"].includes(field)) return "buyers";
  if (field === "paymentMethods") return "payment";
  return "consent";
}
