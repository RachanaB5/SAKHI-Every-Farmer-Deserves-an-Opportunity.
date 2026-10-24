// Start or edit a subscription: pick a listing (or arrive with one),
// quantity, daily / weekly, weekday and delivery slot. Shows the estimated
// cost per delivery and when the first one arrives.
"use client";

import { Check, Loader2, Repeat } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { MediaImage } from "@/components/common/media-image";
import { QtyStepper } from "@/components/common/qty-stepper";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { SkeletonRows } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { sendJSON } from "@/lib/fetcher";
import { formatINR } from "@/lib/format";
import { nextRun, SUBSCRIPTION_SLOTS, WEEKDAYS, type SubscriptionSlot } from "@/lib/subscription-schedule";
import { cn } from "@/lib/utils";

export interface SubscribableListing {
  id: string;
  title: string;
  crop: string;
  unit: string;
  price: number;
  minOrderQty: number;
  imageUrl: string | null;
  farmer: { name: string; village?: string | null };
}

export interface ScheduleValue {
  qty: string;
  frequency: "DAILY" | "WEEKLY";
  dayOfWeek: number;
  preferredSlot: SubscriptionSlot;
}

/** "Tomorrow, 6–8 AM" / "Sun 25 Oct, 9–11 AM" in IST. */
export function deliveryLabel(at: Date | string, slot: string): string {
  const d = new Date(at);
  const ist = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = ist(new Date());
  const tomorrow = ist(new Date(Date.now() + 86_400_000));
  const day = ist(d) === today ? "Today" : ist(d) === tomorrow ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return `${day}, ${slot}`;
}

/** Quantity + frequency + weekday + slot controls. */
export function ScheduleFields({ value, onChange, unit, min = 1 }: { value: ScheduleValue; onChange: (v: ScheduleValue) => void; unit: string; min?: number }) {
  const set = (p: Partial<ScheduleValue>) => onChange({ ...value, ...p });
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-sm font-medium">Each delivery</p>
        <QtyStepper value={value.qty} onChange={(qty) => set({ qty })} min={min} max={100} step={unit === "kg" ? 0.5 : 1} suffix={unit} ariaLabel="Quantity per delivery" />
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">How often</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Frequency">
          {(["DAILY", "WEEKLY"] as const).map((f) => (
            <Chip key={f} on={value.frequency === f} onClick={() => set({ frequency: f })}>
              {f === "DAILY" ? "Every day" : "Once a week"}
            </Chip>
          ))}
        </div>
      </div>
      {value.frequency === "WEEKLY" && (
        <div>
          <p className="mb-2 text-sm font-medium">On</p>
          <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Day of week">
            {WEEKDAYS.map((d, i) => (
              <Chip key={d} on={value.dayOfWeek === i} onClick={() => set({ dayOfWeek: i })} className="px-0" aria-label={d}>
                {d.slice(0, 2)}
              </Chip>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 text-sm font-medium">Delivery window</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Delivery window">
          {SUBSCRIPTION_SLOTS.map((s) => (
            <Chip key={s} on={value.preferredSlot === s} onClick={() => set({ preferredSlot: s })}>
              {s}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ on, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border px-3 text-sm whitespace-nowrap transition-colors",
        on ? "border-foreground bg-foreground text-background" : "bg-background hover:border-foreground/40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Modal for starting a plan.
 * @param listing - preselected listing; when absent the buyer picks one
 */
export function SubscribeSheet({ open, onOpenChange, listing, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; listing?: SubscribableListing | null; onCreated?: () => void }) {
  const [picked, setPicked] = useState<SubscribableListing | null>(null);
  const chosen = listing ?? picked;
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setPicked(null);
  };
  return (
    <ResponsiveModal open={open} onOpenChange={close} title={chosen ? `Repeat ${chosen.title}` : "Start a plan"} description={chosen ? undefined : "Pick something you buy often."}>
      {chosen ? (
        <PlanForm key={chosen.id} listing={chosen} onBack={listing ? undefined : () => setPicked(null)} onDone={() => (close(false), onCreated?.())} />
      ) : (
        <ListingPicker onPick={setPicked} />
      )}
    </ResponsiveModal>
  );
}

function ListingPicker({ onPick }: { onPick: (l: SubscribableListing) => void }) {
  const { data, isLoading } = useSWR<SubscribableListing[]>("/api/listings?sort=nearest");
  if (isLoading || !data) return <SkeletonRows count={4} />;
  // One option per crop — the nearest live listing.
  const seen = new Set<string>();
  const options = data.filter((l) => !seen.has(l.crop) && seen.add(l.crop)).slice(0, 14);
  return (
    <ul className="-mx-1 max-h-[55vh] space-y-1 overflow-y-auto px-1">
      {options.map((l) => (
        <li key={l.id}>
          <button type="button" onClick={() => onPick(l)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-muted">
            <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">{l.imageUrl && <MediaImage src={l.imageUrl} alt="" sizes="48px" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {l.farmer.name} · {formatINR(l.price)}/{l.unit}
              </span>
            </span>
            <Repeat className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PlanForm({ listing, onBack, onDone }: { listing: SubscribableListing; onBack?: () => void; onDone: () => void }) {
  const [v, setV] = useState<ScheduleValue>({ qty: String(Math.max(1, listing.minOrderQty)), frequency: listing.crop === "milk" ? "DAILY" : "WEEKLY", dayOfWeek: 0, preferredSlot: "7–9 AM" });
  const [busy, setBusy] = useState(false);
  const qty = Number(v.qty) || 0;
  const first = nextRun(v.frequency, v.dayOfWeek, v.preferredSlot);

  async function submit() {
    setBusy(true);
    try {
      await sendJSON("/api/subscriptions", { listingId: listing.id, qty, frequency: v.frequency, dayOfWeek: v.frequency === "WEEKLY" ? v.dayOfWeek : null, preferredSlot: v.preferredSlot });
      toast.success(`Plan started, first delivery ${deliveryLabel(first.deliveryAt, v.preferredSlot)}`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">{listing.imageUrl && <MediaImage src={listing.imageUrl} alt="" sizes="48px" />}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{listing.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {listing.farmer.name} · {formatINR(listing.price)}/{listing.unit}
          </p>
        </div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            Change
          </Button>
        )}
      </div>
      <ScheduleFields value={v} onChange={setV} unit={listing.unit} min={Math.max(listing.minOrderQty, listing.unit === "kg" ? 0.5 : 1)} />
      <div className="rounded-2xl border p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Per delivery (est.)</span>
          <b className="tabular">{formatINR(qty * listing.price)}</b>
        </div>
        <div className="mt-1 flex justify-between gap-3">
          <span className="text-muted-foreground">First delivery</span>
          <b className="text-right">{deliveryLabel(first.deliveryAt, v.preferredSlot)}</b>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Charged per delivery at that day&apos;s price. If this farm runs out, we use another nearby farm&apos;s {listing.crop}. Pause any time.</p>
      </div>
      <Button className="min-h-12 w-full" size="lg" disabled={busy || qty <= 0} onClick={submit}>
        {busy ? <Loader2 className="animate-spin" /> : <Check />} Start plan
      </Button>
    </div>
  );
}
