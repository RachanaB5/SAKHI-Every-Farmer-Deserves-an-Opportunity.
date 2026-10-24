# Sakhi: voice and privacy

Sakhi is the voice helper in the farmer app and on seller sign-up (EN / ಕನ್ನಡ / हिंदी). This
page explains what happens to a farmer's voice and words, in plain terms.

## The microphone

- In the farmer app the mic turns on **when the farmer taps it**, and turns off when they tap stop,
  when speech ends, or when the panel is closed or minimised.
- **Hands-free mode.** In the sign-up guide (after the farmer taps **Guide me by voice**), and in the
  farmer app when "Open the mic after my questions" is on, the mic opens by itself right after Farmer's
  Friend asks something, so the farmer can simply answer. It closes as soon as they finish. The red mic
  button and "Listening…" show whenever it is on. Hands-free is on in the sign-up guide and during the
  first-harvest walk-through that follows it, off otherwise, and can be switched off in settings at any
  time. Closing the panel or guide stops the mic.
- The browser asks for microphone permission the **first time** the mic is used, after the farmer has
  tapped the mic or **Guide me by voice**, never on page load. Next to both, the screen explains why the
  mic is needed.
- If permission is refused, the panel says so and the farmer can type instead. Everything that works
  by voice also works by typing.

## Where speech becomes text

- Speech recognition is done by the **browser's own speech service** (the Web Speech API). FoodFlow's
  servers **never receive, store or forward audio**.
- Depending on the browser, that service may run on the device or in the browser vendor's cloud
  (Chrome and Edge use their vendor's online speech service; Safari may process on the device). That
  is governed by the browser's privacy policy, not FoodFlow's.
- Firefox has no speech recognition; the panel says voice isn't supported and offers typing.
- A server-side Indic speech model is **not implemented**. `ServerSttProvider` in
  `lib/assistant/stt.ts` is a stub that reports itself unavailable, so setting
  `NEXT_PUBLIC_STT_PROVIDER=server` today still uses the browser.

## What FoodFlow receives and keeps

| What | Sent to FoodFlow? | Kept? |
| --- | --- | --- |
| Audio | No | No |
| The text of a request (typed, or recognised by the browser and shown for editing first) | Yes, to `/api/assistant/interpret` | Only when it creates a harvest draft: the sentence is saved on that draft as `voiceTranscript`, so the admin reviewing the listing can see what the farmer said. Other requests are not stored. |
| Confirmed actions (publish, price, stock, offer, delivery) | Yes | A row in `AssistantAction` (action id, farmer, intent, result) so the same confirmation can never run twice, plus the platform's normal audit log |
| Language and voice settings | Yes | `FarmerProfile.assistantWelcomeSeen` and `assistantAutoVoice` |

## During seller sign-up

- The sign-up guide on `/join/seller` runs entirely in the browser. It turns each answer into a value in
  the form on screen, where the farmer can see and change it. Nothing is sent to FoodFlow until the account
  is created, exactly as with typing.
- The guide never asks for the PIN out loud. It asks the farmer to type it, and only then asks "Shall I
  create your seller account now?". The account is created on that spoken "yes" (or a tap on **Create my
  seller account**); any other answer leaves it to the button.
- After a voice sign-up, a short note (first name and language) is kept in this browser tab for up to 15
  minutes so Sakhi can carry on in the farmer app; it is removed as soon as it is used.

## Language models

- Requests are understood by a **rule-based parser first** (numbers, units and crop names in English,
  Kannada and Hindi).
- Only when the rules are unsure, and only if the deployment sets `GEMINI_API_KEY`, the **text** of the
  request is sent to the model together with a language hint and today's date (never audio, never
  account data). The model may only return a structured intent from a fixed list plus the values the
  farmer said (crop, quantity, price, date), validated against a schema.
- The model never reads or writes the database and never writes a reply. Every reply is a fixed
  template; amounts in it come from FoodFlow's records, or are the farmer's own values shown on a card
  to check before anything changes.
- With no key, or when the model is slow or down, the rule parser answers on its own.

## Speaking back

- Replies are spoken with the device's built-in voices (`speechSynthesis`); FoodFlow sends no text
  anywhere to be spoken. (Some browsers' "online" voices are themselves provided by the browser vendor's
  service.)
- The voice is chosen automatically: Indian English first for English (so names, places and crops are
  pronounced the way farmers say them), then the most natural voice on the device. The farmer can pick a
  female or male voice, a specific voice and a speed; that choice is saved in this browser only.
- A Kannada or Hindi reply is **never read with an English voice**. Many computers (desktop Chrome, for
  one) have no Kannada voice; there, Kannada is spelled out in Devanagari letters, with numbers as Kannada
  words, and read by the Hindi voice, and the panel says so ("a Hindi voice is reading the Kannada").
  Microsoft Edge, and Chrome on Android, have real Kannada voices. If a device has no voice for the
  language at all, the reply is shown as text with "Voice unavailable on this device", and the farmer can
  choose to hear replies in English instead.
- Auto voice can be turned off in the panel's settings.

## Nothing changes without a tap

Reading earnings, stock, orders or prices happens straight away. Anything that changes data (sending a
harvest for review, changing a price or stock, making an offer, booking a delivery) is shown on a card
first and runs only after the farmer confirms. Confirmations are signed, belong to that farmer, expire
after five minutes and work once.
