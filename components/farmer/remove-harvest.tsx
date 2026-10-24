// Confirm-then-remove for a harvest, shared by Home and the Harvests page.
// One that never went live is deleted; a live one has its listing taken
// down instead (DELETE /api/batches/[id] decides which).
"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/common/responsive-modal";
import { useI18n } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { cropName } from "@/lib/crops";
import { sendJSON } from "@/lib/fetcher";

interface Harvest {
  id: string;
  crop: string;
  listing: { id: string } | null;
}

/**
 * @param onRemoved - called once the server confirms (e.g. SWR mutate)
 * @returns `ask` opens the confirm sheet, `busyId` is the harvest being
 *   removed, `label` names the action per harvest, `dialog` must be rendered
 */
export function useRemoveHarvest(onRemoved: () => void) {
  const { t, lang } = useI18n();
  // Kept after closing so the sheet's text doesn't vanish mid-animation.
  const [target, setTarget] = useState<Harvest | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function ask(h: Harvest) {
    setTarget(h);
    setOpen(true);
  }

  async function remove(h: Harvest) {
    setOpen(false);
    setBusyId(h.id);
    try {
      await sendJSON(`/api/batches/${h.id}`, undefined, "DELETE");
      toast.success(h.listing ? t("listings.removedToast") : t("batches.removedToast"));
      onRemoved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const label = (h: Harvest) => (h.listing ? t("listings.remove") : t("batches.remove"));
  const live = Boolean(target?.listing);
  const dialog = (
    <ResponsiveModal
      open={open}
      onOpenChange={setOpen}
      title={target ? t(live ? "listings.removeTitle" : "batches.removeTitle", { crop: cropName(target.crop, lang) }) : ""}
    >
      <p className="text-sm text-muted-foreground">{live ? t("listings.removeBody") : t("batches.removeBody")}</p>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </Button>
        <Button variant="destructive" className="min-h-11" onClick={() => target && remove(target)}>
          <Trash2 /> {live ? t("listings.removeConfirm") : t("batches.remove")}
        </Button>
      </div>
    </ResponsiveModal>
  );

  return { ask, busyId, label, dialog };
}
