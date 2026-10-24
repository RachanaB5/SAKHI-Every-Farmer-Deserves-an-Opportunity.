// Recurring procurement schedule: every repeating requirement with its
// cadence and next due date; post the next cycle now or stop repeating.
"use client";

import { CalendarClock, Loader2, Repeat } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import type { SerializedDemand } from "@/lib/bulk";
import { sendJSON } from "@/lib/fetcher";
import { formatDateTime, formatINR } from "@/lib/format";

/** Next due date for a recurring requirement. */
function nextDue(d: SerializedDemand) {
  const step = d.frequency === "DAILY" ? 86_400_000 : 7 * 86_400_000;
  let t = new Date(d.deadline).getTime() + step;
  while (t < Date.now()) t += step;
  return new Date(t).toISOString();
}

/** /bulk/schedule */
export function Schedule() {
  const { data, error, isLoading, mutate } = useSWR<SerializedDemand[]>("/api/demands");
  const [busy, setBusy] = useState<string | null>(null);
  // Latest occurrence per crop/frequency series, still marked recurring.
  const series = (data ?? []).filter((d) => d.recurring);

  async function repost(d: SerializedDemand) {
    setBusy(d.id);
    try {
      const r = await sendJSON<{ id: string; deadline: string }>(`/api/demands/${d.id}/repost`);
      toast.success(`Next ${d.cropName.toLowerCase()} requirement posted for ${formatDateTime(r.deadline)}`);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function stop(d: SerializedDemand) {
    setBusy(d.id);
    try {
      await sendJSON(`/api/demands/${d.id}`, { recurring: false }, "PATCH");
      toast("Stopped repeating");
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Recurring *schedule*" description="Standing requirements your kitchen repeats. Post the next cycle in one tap." />
      {isLoading && <SkeletonRows count={3} />}
      {error && <ErrorState message={error.message} onRetry={() => mutate()} />}
      {data && series.length === 0 && (
        <EmptyState icon={CalendarClock} title="No recurring requirements" body="Turn on “Recurring” when posting a requirement to see it here." action={<Button asChild variant="outline"><Link href="/bulk/demands/new">Post requirement</Link></Button>} />
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {series.map((d, i) => (
          <motion.li key={d.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="rounded-3xl border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {d.qtyKg} kg {d.cropName}
                </p>
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Repeat className="size-3.5" /> {d.frequency === "DAILY" ? "Every day" : "Every week"} · target {formatINR(d.targetPrice)}/kg
                </p>
              </div>
              <StatusBadge status={d.status} />
            </div>
            <p className="mt-3 text-sm">
              Next due <b>{formatDateTime(nextDue(d))}</b>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="brand" onClick={() => repost(d)} disabled={busy !== null}>
                {busy === d.id && <Loader2 className="animate-spin" />} Post next now
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/bulk/demands/${d.id}`}>View</Link>
              </Button>
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => stop(d)} disabled={busy !== null}>
                Stop repeating
              </Button>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
