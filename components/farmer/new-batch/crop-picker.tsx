// Photo grid for choosing the crop (all options visible, no hidden scroll).
// Names show in the farmer's UI language.
"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useI18n } from "@/components/providers/i18n-provider";
import { CROP_SLUGS, CROPS, cropName, type CropSlug } from "@/lib/crops";
import { cn } from "@/lib/utils";

/**
 * @param value - selected crop
 * @param onChange - called with the tapped crop
 * @param crops - optional subset (e.g. the farmer's own crops first)
 */
export function CropPicker({
  value,
  onChange,
  crops = [...CROP_SLUGS],
}: {
  value: CropSlug | null;
  onChange: (c: CropSlug) => void;
  crops?: CropSlug[];
}) {
  const { lang } = useI18n();
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {crops.map((slug) => {
        const on = value === slug;
        return (
          <motion.button
            key={slug}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(slug)}
            whileTap={{ scale: 0.95 }}
            animate={{ scale: on ? 0.97 : 1 }}
            className={cn(
              "relative aspect-square overflow-hidden rounded-2xl text-left ring-offset-2 ring-offset-background transition-shadow",
              on ? "ring-3 ring-lime" : "ring-1 ring-border",
            )}
          >
            <Image src={CROPS[slug].image} alt="" fill sizes="(max-width: 640px) 33vw, 160px" className="object-cover" />
            <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <span className="absolute inset-x-2 bottom-1.5 text-[13px] leading-tight font-semibold text-white break-words">
              {cropName(slug, lang)}
            </span>
            <AnimatePresence>
              {on && (
                <motion.span
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 22 }}
                  className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-lime text-lime-foreground"
                >
                  <Check className="size-4" strokeWidth={3} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        );
      })}
    </div>
  );
}
