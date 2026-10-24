// The location chip in the top bar. It shows the active address, and opens a
// panel to use the device's live location (after the browser's own permission
// prompt), switch between saved addresses, add a new one or remove one.
// `AutoLocation` runs once per browser session for buyers and silently
// switches them to where they actually are when they allow it.
"use client";

import { Check, Crosshair, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SERVICE_AREAS } from "@/lib/areas";
import { ApiError, sendJSON } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

interface SavedAddress {
  id: string;
  label: string;
  line: string;
  area: string | null;
  isCurrentLocation: boolean;
}
interface Resolved {
  area: string | null;
  nearestArea: string;
  inService: boolean;
  label: string;
}

const LABELS = ["Home", "Work", "Farm", "Kitchen", "Other"] as const;
const OUTSIDE = "__outside";

/** Asks the browser for the device position (it shows its own permission prompt). */
function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share your location"));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 });
  });
}

/** Friendly text for a geolocation failure. */
function geoMessage(e: unknown): string {
  const code = (e as GeolocationPositionError)?.code;
  if (code === 1) return "Location permission is blocked. Allow it in your browser settings, or add an address instead.";
  if (code === 2) return "We couldn't work out where you are. Try again, or add an address.";
  if (code === 3) return "Finding your location took too long. Try again, or add an address.";
  return (e as Error)?.message || "Couldn't get your location";
}

/**
 * Detects the live location, saves it as "Current location" and (when it is inside a service
 * area) makes it the active address.
 * @returns what was found and whether it became active
 */
async function detectAndSaveLocation(): Promise<{ resolved: Resolved; active: boolean }> {
  const pos = await currentPosition();
  const { latitude: lat, longitude: lng } = pos.coords;
  const resolved = await sendJSON<Resolved>("/api/location/resolve", { lat, lng });
  await sendJSON("/api/addresses", {
    label: "Current location",
    line: resolved.label,
    area: resolved.area,
    lat,
    lng,
    isCurrentLocation: true,
    makeActive: resolved.inService,
  });
  return { resolved, active: resolved.inService };
}

/**
 * Runs once per browser session for signed-in buyers: if the person allows it, their live
 * location becomes the delivery location. Stays quiet if they decline.
 */
export function AutoLocation({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem("foodflow.geo-checked")) return;
      sessionStorage.setItem("foodflow.geo-checked", "1");
    } catch {
      return;
    }
    // No cancel guard: React's dev double-run would cancel the one run that does the work, and a
    // refresh after unmount is harmless.
    (async () => {
      try {
        const perm = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
        if (perm?.state === "denied") return;
        const { resolved, active } = await detectAndSaveLocation();
        if (active) {
          toast.success(`Delivering to ${resolved.label}`);
          router.refresh();
        } else toast.message("FoodFlow isn't available at your current location yet.", { description: "You can still browse, or pick another address from the top bar." });
      } catch {
        /* declined, unavailable or offline: keep the saved address */
      }
    })();
  }, [enabled, router]);
  return null;
}

/**
 * @param label - small caption ("Deliver to Ananya", "Your farm")
 * @param value - the active address, already shortened for display
 * @param defaultLabel - which label chip an added address starts with
 */
export function LocationPicker({ label, value, defaultLabel = "Home", className }: { label: string; value: string; defaultLabel?: (typeof LABELS)[number]; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data, mutate } = useSWR<{ addresses: SavedAddress[]; activeId: string | null }>(open ? "/api/addresses" : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ label: (typeof LABELS)[number]; line: string; area: string }>({ label: defaultLabel, line: "", area: "" });
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await mutate();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : geoMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const detect = () =>
    run("detect", async () => {
      const { resolved, active } = await detectAndSaveLocation();
      if (active) {
        toast.success(`Using ${resolved.label}`);
        setOpen(false);
      } else setError("FoodFlow isn't available at your current location yet. It's saved, but we'll keep your previous delivery address.");
    });
  const choose = (a: SavedAddress) =>
    run(a.id, async () => {
      await sendJSON(`/api/addresses/${a.id}`, { action: "activate" }, "PATCH");
      toast.success(`Using ${a.label}: ${a.line}`);
      setOpen(false);
    });
  const remove = (a: SavedAddress) => run(`rm-${a.id}`, async () => void (await sendJSON(`/api/addresses/${a.id}`, undefined, "DELETE")));
  const add = () =>
    run("add", async () => {
      if (form.line.trim().length < 3) throw new Error("Enter the address");
      await sendJSON("/api/addresses", { label: form.label, line: form.line.trim(), area: form.area && form.area !== OUTSIDE ? form.area : null, makeActive: true });
      setForm({ label: defaultLabel, line: "", area: "" });
      setAdding(false);
      toast.success("Address saved and selected");
      setOpen(false);
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${label}: ${value || "set your location"}. Change`} className={cn("flex min-w-0 items-center gap-1.5 rounded-xl px-1.5 py-1 text-left hover:bg-muted/60", className)}>
        <MapPin className="size-5 shrink-0 text-lime" />
        <span className="min-w-0 leading-tight">
          <span className="block max-w-48 truncate text-xs text-muted-foreground">{label}</span>
          <span className="block max-w-48 truncate text-sm font-semibold">{value || "Set your location"}</span>
        </span>
      </button>

      <ResponsiveModal open={open} onOpenChange={setOpen} title="Choose your location" description="Pick a saved address, use where you are now, or add a new one.">
        <div className="space-y-4">
          <Button type="button" variant="outline" size="lg" className="w-full justify-start" onClick={detect} disabled={busy !== null}>
            {busy === "detect" ? <Loader2 className="animate-spin" /> : <Crosshair />} Use my current location
          </Button>

          <ul className="space-y-2" aria-label="Saved addresses">
            {data?.addresses.map((a) => {
              const on = data.activeId === a.id;
              return (
                <li key={a.id} className={cn("flex items-center gap-2 rounded-2xl border pr-1", on && "border-foreground bg-lime/20")}>
                  <button type="button" onClick={() => choose(a)} disabled={busy !== null || on} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left">
                    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-foreground bg-foreground text-background" : "border-input")}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {a.label}
                        {a.area ? <span className="font-normal text-muted-foreground"> · {a.area}</span> : <span className="font-normal text-warning"> · outside service area</span>}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{a.line}</span>
                    </span>
                  </button>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${a.label}`} onClick={() => remove(a)} disabled={busy !== null}>
                    {busy === `rm-${a.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                  </Button>
                </li>
              );
            })}
            {data && data.addresses.length === 0 && <li className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No saved addresses yet.</li>}
          </ul>

          {adding ? (
            <div className="space-y-3 rounded-2xl border p-4">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Address type">
                {LABELS.map((l) => (
                  <button key={l} type="button" role="radio" aria-checked={form.label === l} onClick={() => setForm((f) => ({ ...f, label: l }))} className={cn("h-9 rounded-full border px-3.5 text-sm", form.label === l ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}>
                    {l}
                  </button>
                ))}
              </div>
              <Input value={form.line} onChange={(e) => setForm((f) => ({ ...f, line: e.target.value }))} placeholder="Flat / street / landmark" aria-label="Address" autoComplete="street-address" />
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Service area">
                {[...SERVICE_AREAS.map((a) => a.name), OUTSIDE].map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={form.area === a} onClick={() => setForm((f) => ({ ...f, area: a }))} className={cn("h-9 rounded-full border px-3.5 text-sm", form.area === a ? "border-foreground bg-lime/30" : "text-muted-foreground")}>
                    {a === OUTSIDE ? "Somewhere else" : a}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="brand" onClick={add} disabled={busy !== null}>
                  {busy === "add" && <Loader2 className="animate-spin" />} Save and use
                </Button>
                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setAdding(true)}>
              <Plus /> Add a new address
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </ResponsiveModal>
    </>
  );
}
