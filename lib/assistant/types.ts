// Reply and card shapes shared by the Sakhi API and panel.
import type { AssistantLang, ConfirmIntent, Entities, Intent } from "./intents";

export interface DraftCard {
  id: string;
  crop: string;
  qty: number;
  unit: "kg" | "litre" | "dozen";
  price: number | null;
  harvestDate: string;
  photos: number;
  status: string;
}

export interface EarningsCard {
  period: "today" | "week" | "month" | "all";
  orders: number;
  orderValue: number;
  platformFee: number;
  estimatedNet: number;
  settled: number;
  pending: number;
  awaiting: number;
}

export type Card =
  | { type: "draft"; draft: DraftCard }
  | { type: "confirm"; intent: ConfirmIntent; title: string; rows: { label: string; value: string }[]; /** What the card was built from, so an edit can re-prepare it. */ entities: Entities; editable?: { field: "price" | "qty"; label: string; value: number; unit: string }[] }
  | { type: "earnings"; earnings: EarningsCard }
  | { type: "stock"; rows: { listingId: string; crop: string; title: string; available: number; reserved: number; sold: number; unit: string }[] }
  | { type: "prices"; rows: { listingId: string; crop: string; title: string; price: number; unit: string; market: number | null }[] }
  | { type: "status"; rows: { batchId: string; crop: string; status: string; note: string | null; createdAt: string }[] }
  | { type: "demands"; rows: { demandId: string; crop: string; buyer: string; needKg: number; targetPrice: number; deadline: string; urgent: boolean; myAvailable: number }[] }
  | { type: "deliveries"; rows: { orderId: string; code: string; status: string; rider: string | null; fulfilment: string }[] }
  | { type: "payments"; rows: { orderId: string; code: string; stage: "AWAITING" | "PENDING" | "SETTLED"; net: number; date: string | null }[] };

export interface AssistantReply {
  ok: boolean;
  intent: Intent;
  lang: AssistantLang;
  /** Read aloud (TTS) — always a filled template, never free-form model text. */
  speech: string;
  /** Shown in the chat bubble. */
  display: string;
  card?: Card;
  needsConfirmation?: boolean;
  confirmToken?: string;
  /** Set when a required field is missing; the next utterance continues this intent. */
  followUp?: { intent: Intent; entities: Entities; missing: string[] };
  /** Ids the client sends back as context (latest draft / demand). */
  context?: { lastDraftId?: string | null; lastDemandId?: string | null };
  /** Which path understood the request. */
  source?: "rules" | "ai";
}
