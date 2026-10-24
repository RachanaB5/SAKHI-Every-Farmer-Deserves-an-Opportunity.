// Structured cards in the Sakhi chat: an editable harvest draft
// (with photo upload and "send for review"), confirmation cards with
// editable values, and read-only earnings / stock / price / status /
// demand / delivery / payment summaries. All amounts come from the API.
"use client";

import { Camera, Check, ExternalLink, Loader2, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FarmerStatusBadge } from "@/components/farmer/farmer-status-badge";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import type { Entities, Intent } from "@/lib/assistant/intents";
import type { Card, DraftCard } from "@/lib/assistant/types";
import { CROP_SLUGS, cropName } from "@/lib/crops";
import { fetcher, sendForm, sendJSON } from "@/lib/fetcher";
import { formatDate, formatINR, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Msg } from "./use-farmer-friend";

interface Actions {
  confirm: (msgId: string) => void;
  cancel: (msgId: string) => void;
  reprepare: (msgId: string | null, intent: Intent, entities: Entities) => void;
  updateCard: (msgId: string, card: Card) => void;
  /** A photo was added to a draft (the conversation may carry on to "send for review?"). */
  onPhoto: (draft: DraftCard) => void;
  /** Draw the eye to "Add photo" (the first-harvest journey is waiting for one). */
  highlightPhoto?: boolean;
  busy: boolean;
}

interface ApiBatch {
  id: string;
  crop: string;
  quantity: number;
  unit: DraftCard["unit"];
  proposedPrice: number | null;
  harvestDate: string;
  status: string;
  media: { type: string }[];
}
const toDraft = (b: ApiBatch): DraftCard => ({ id: b.id, crop: b.crop, qty: b.quantity, unit: b.unit, price: b.proposedPrice, harvestDate: b.harvestDate.slice(0, 10), photos: b.media.filter((m) => m.type === "IMAGE").length, status: b.status });

const box = "mt-2 rounded-2xl border bg-background/80 p-3 text-sm";

/** Renders the card attached to an assistant message. */
export function MessageCard({ msg, actions }: { msg: Msg; actions: Actions }) {
  const card = msg.card;
  if (!card) return null;
  switch (card.type) {
    case "draft":
      return <DraftView msg={msg} draft={card.draft} actions={actions} />;
    case "confirm":
      return <ConfirmView msg={msg} card={card} actions={actions} />;
    case "earnings":
      return <EarningsView e={card.earnings} />;
    case "stock":
      return <RowsView rows={card.rows.map((r) => ({ key: r.listingId, title: r.title, right: formatQty(r.available, r.unit), sub: `${formatQty(r.reserved, r.unit)} · ${formatQty(r.sold, r.unit)}` }))} titleKey="ff.card.stock" />;
    case "prices":
      return <PricesView rows={card.rows} />;
    case "status":
      return <StatusView rows={card.rows} />;
    case "demands":
      return <DemandsView rows={card.rows} actions={actions} />;
    case "deliveries":
      return <DeliveriesView rows={card.rows} actions={actions} />;
    case "payments":
      return <PaymentsView rows={card.rows} />;
  }
}

function DraftView({ msg, draft, actions }: { msg: Msg; draft: DraftCard; actions: Actions }) {
  const { t, lang } = useI18n();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ crop: draft.crop, qty: String(draft.qty), price: draft.price ? String(draft.price) : "", date: draft.harvestDate });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editable = draft.status === "DRAFT" || draft.status === "RESUBMIT";
  const unit = draft.unit;

  async function refresh() {
    const fresh = toDraft(await fetcher<ApiBatch>(`/api/batches/${draft.id}`));
    actions.updateCard(msg.id, { type: "draft", draft: fresh });
    return fresh;
  }
  async function save() {
    setSaving(true);
    try {
      const b = await sendJSON<ApiBatch>(`/api/batches/${draft.id}`, { action: "save", crop: f.crop, quantity: Number(f.qty), unit, ...(Number(f.price) > 0 && { price: Number(f.price) }), harvestDate: f.date }, "PATCH");
      actions.updateCard(msg.id, { type: "draft", draft: toDraft(b) });
      setEdit(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const fl of Array.from(files).slice(0, 4)) {
        const form = new FormData();
        form.append("file", fl);
        form.append("kind", "media");
        await sendForm(`/api/batches/${draft.id}/media`, form);
      }
      actions.onPhoto(await refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }

  return (
    <div className={box}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t("ff.card.draft")}</p>
        <FarmerStatusBadge status={draft.status} />
      </div>
      {edit ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="col-span-2 text-xs text-muted-foreground">
            {t("ff.card.crop")}
            <select value={f.crop} onChange={(e) => setF({ ...f, crop: e.target.value })} className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-base text-foreground">
              {CROP_SLUGS.map((c) => (
                <option key={c} value={c}>
                  {cropName(c, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("ff.card.qty")} ({t(`ff.unit.${unit}`)})
            <input inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/[^\d.]/g, "") })} className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-base text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("ff.card.price")} (₹/{t(`ff.unit.${unit}`)})
            <input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, "") })} className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-base text-foreground" />
          </label>
          <label className="col-span-2 text-xs text-muted-foreground">
            {t("ff.card.harvested")}
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="mt-1 h-11 w-full rounded-xl border bg-background px-3 text-base text-foreground" />
          </label>
          <div className="col-span-2 flex gap-2">
            <Button className="min-h-11 flex-1" onClick={save} disabled={saving || !(Number(f.qty) > 0)}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />} {t("ff.save")}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setEdit(false)}>
              {t("ff.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
          <Fact k={t("ff.card.crop")} v={cropName(draft.crop, lang)} />
          <Fact k={t("ff.card.qty")} v={formatQty(draft.qty, unit, lang)} />
          <Fact k={t("ff.card.price")} v={draft.price ? `${formatINR(draft.price)}/${t(`ff.unit.${unit}`)}` : "-"} />
          <Fact k={t("ff.card.harvested")} v={formatDate(draft.harvestDate, lang)} />
          <Fact k={t("ff.card.photos")} v={String(draft.photos)} />
        </dl>
      )}
      {editable && !edit && (
        <>
          {draft.photos === 0 && <p className="mt-2 rounded-xl bg-warning/15 px-2.5 py-1.5 text-xs">{t("ff.card.needPhoto")}</p>}
          <input ref={file} type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={(e) => upload(e.target.files)} aria-label={t("ff.card.addPhoto")} />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="outline" className={cn("min-h-11", actions.highlightPhoto && draft.photos === 0 && !uploading && "animate-pulse border-lime bg-lime/25 ring-2 ring-lime/50")} onClick={() => file.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />} {uploading ? t("ff.card.uploading") : t("ff.card.addPhoto")}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setEdit(true)}>
              <Pencil /> {t("ff.edit")}
            </Button>
            <Button className="col-span-2 min-h-11" disabled={actions.busy || draft.photos === 0 || !draft.price} onClick={() => actions.reprepare(null, "PUBLISH_LISTING", { draftId: draft.id })}>
              {t("ff.card.sendReview")}
            </Button>
          </div>
          <Link href={`/farmer/batches/new?batch=${draft.id}`} className="mt-2 inline-flex min-h-9 items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
            <ExternalLink className="size-3.5" /> {t("ff.card.openWizard")}
          </Link>
        </>
      )}
      {draft.status === "PENDING_REVIEW" && <p className="mt-2 text-xs text-muted-foreground">{t("ff.card.inReview")}</p>}
    </div>
  );
}

function ConfirmView({ msg, card, actions }: { msg: Msg; card: Extract<Card, { type: "confirm" }>; actions: Actions }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries((card.editable ?? []).map((e) => [e.field, String(e.value)])));
  const open = msg.confirm === "pending";

  function resubmit() {
    const entities: Entities = { ...card.entities, ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])) };
    actions.reprepare(msg.id, card.intent, entities);
    setEdit(false);
  }

  return (
    <div className={cn(box, open && "border-lime ring-2 ring-lime/40")}>
      <p className="font-semibold">{card.title}</p>
      <dl className="mt-2 space-y-1">
        {card.rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{r.label}</dt>
            {r.value && <dd className="text-right font-medium">{r.value}</dd>}
          </div>
        ))}
        {(card.editable ?? []).map((e) => (
          <div key={e.field} className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{e.label}</dt>
            {edit ? (
              <input
                inputMode="decimal"
                aria-label={e.label}
                value={vals[e.field]}
                onChange={(ev) => setVals({ ...vals, [e.field]: ev.target.value.replace(/[^\d.]/g, "") })}
                className="h-11 w-24 rounded-xl border bg-background px-3 text-right text-base"
              />
            ) : (
              <dd className="font-semibold">
                {vals[e.field]} {e.unit}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {open ? (
        edit ? (
          <div className="mt-3 flex gap-2">
            <Button className="min-h-11 flex-1" onClick={resubmit} disabled={actions.busy || Object.values(vals).some((v) => !(Number(v) > 0))}>
              <Check /> {t("ff.save")}
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setEdit(false)}>
              {t("ff.cancel")}
            </Button>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button className="col-span-3 min-h-12 text-base sm:col-span-1" onClick={() => actions.confirm(msg.id)} disabled={actions.busy}>
              <Check /> {t("ff.confirm")}
            </Button>
            {(card.editable?.length ?? 0) > 0 && (
              <Button variant="outline" className="min-h-11 sm:col-span-1" onClick={() => setEdit(true)} disabled={actions.busy}>
                <Pencil /> {t("ff.edit")}
              </Button>
            )}
            <Button variant="ghost" className={cn("min-h-11", (card.editable?.length ?? 0) > 0 ? "col-span-2 sm:col-span-1" : "col-span-3 sm:col-span-2")} onClick={() => actions.cancel(msg.id)} disabled={actions.busy}>
              <X /> {t("ff.cancel")}
            </Button>
          </div>
        )
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">{msg.confirm === "done" ? t("ff.done") : t("ff.say.cancelled")}</p>
      )}
    </div>
  );
}

function EarningsView({ e }: { e: Extract<Card, { type: "earnings" }>["earnings"] }) {
  const { t } = useI18n();
  const cells: [string, number, string?][] = [
    [t("ff.card.orderValue"), e.orderValue],
    [t("ff.card.fee"), e.platformFee],
    [t("ff.card.net"), e.estimatedNet],
    [t("ff.card.settled"), e.settled, "text-success"],
    [t("ff.card.pending"), e.pending],
    [t("ff.card.awaiting"), e.awaiting],
  ];
  return (
    <div className={box}>
      <p className="font-semibold">
        {t("ff.card.earnings")} · {t(`ff.period.${e.period}`)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {cells.map(([k, v, c]) => (
          <div key={k} className="rounded-xl bg-muted/60 p-2">
            <dt className="text-[11px] text-muted-foreground">{k}</dt>
            <dd className={cn("tabular text-base font-semibold", c)}>{formatINR(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RowsView({ rows, titleKey }: { rows: { key: string; title: string; right: string; sub?: string }[]; titleKey: "ff.card.stock" }) {
  const { t } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t(titleKey)}</p>
      <ul className="mt-2 divide-y">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{r.title}</span>
              {r.sub && <span className="block text-[11px] text-muted-foreground">{r.sub}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold">{r.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PricesView({ rows }: { rows: Extract<Card, { type: "prices" }>["rows"] }) {
  const { t } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t("ff.card.prices")}</p>
      <ul className="mt-2 divide-y">
        {rows.map((r) => (
          <li key={r.listingId} className="flex items-center justify-between gap-3 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{r.title}</span>
              {r.market && <span className="block text-[11px] text-muted-foreground">{t("ff.card.market", { price: Math.round(r.market), unit: t(`ff.unit.${r.unit === "litre" || r.unit === "dozen" ? r.unit : "kg"}`) })}</span>}
            </span>
            <span className="tabular shrink-0 font-semibold">{formatINR(r.price)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusView({ rows }: { rows: Extract<Card, { type: "status" }>["rows"] }) {
  const { t, lang } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t("ff.card.status")}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.batchId}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">{cropName(r.crop, lang)}</span>
              <FarmerStatusBadge status={r.status} />
            </div>
            {r.note && (r.status === "REJECTED" || r.status === "RESUBMIT") && <p className="mt-0.5 text-xs text-muted-foreground">“{r.note}”</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemandsView({ rows, actions }: { rows: Extract<Card, { type: "demands" }>["rows"]; actions: Actions }) {
  const { t, lang } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t("ff.card.demands")}</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.demandId} className="rounded-xl bg-muted/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{cropName(r.crop, lang)}</span>
              {r.urgent && <span className="rounded-full bg-tomato px-1.5 text-[10px] font-semibold text-white">URGENT</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              {r.buyer} · {t("ff.card.needs", { qty: r.needKg, price: r.targetPrice })}
            </p>
            {r.myAvailable > 0 && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-xs">{t("ff.card.youHave", { qty: r.myAvailable })}</span>
                <Button size="sm" className="min-h-9" disabled={actions.busy} onClick={() => actions.reprepare(null, "RESPOND_TO_OFFER", { crop: r.crop as Entities["crop"], qty: Math.min(r.needKg, r.myAvailable), price: r.targetPrice, demandId: r.demandId })}>
                  {t("ff.confirm")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeliveriesView({ rows, actions }: { rows: Extract<Card, { type: "deliveries" }>["rows"]; actions: Actions }) {
  const { t } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t("ff.card.deliveries")}</p>
      <ul className="mt-2 divide-y">
        {rows.map((r) => (
          <li key={r.orderId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block font-mono text-xs font-semibold">{r.code}</span>
              {r.rider && <span className="block text-[11px] text-muted-foreground">{r.rider}</span>}
            </span>
            {r.fulfilment === "DELIVERY" && !r.rider && (r.status === "CONFIRMED" || r.status === "PACKED") ? (
              <Button size="sm" variant="outline" className="min-h-9" disabled={actions.busy} onClick={() => actions.reprepare(null, "BOOK_DELIVERY", { orderCode: r.code })}>
                {t("orders.bookDelivery")}
              </Button>
            ) : (
              <FarmerStatusBadge status={r.status} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentsView({ rows }: { rows: Extract<Card, { type: "payments" }>["rows"] }) {
  const { t, lang } = useI18n();
  return (
    <div className={box}>
      <p className="font-semibold">{t("ff.card.payments")}</p>
      <ul className="mt-2 divide-y">
        {rows.map((r) => (
          <li key={r.orderId} className="flex items-center justify-between gap-2 py-1.5">
            <span className="min-w-0">
              <span className="block font-mono text-xs font-semibold">{r.code}</span>
              {r.date && <span className="block text-[11px] text-muted-foreground">{formatDate(r.date, lang)}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular font-semibold">{formatINR(r.net)}</span>
              <FarmerStatusBadge status={r.stage === "SETTLED" ? "SETTLED" : "PENDING"} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="truncate font-medium">{v}</dd>
    </div>
  );
}
