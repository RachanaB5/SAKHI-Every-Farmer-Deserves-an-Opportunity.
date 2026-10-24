// "From the field" photo story: six moments from seed to plate, mirroring
// the steps above. One consistent treatment — rounded frames, bottom scrim
// and a short caption — with a larger lead image on desktop.
import { Photo } from "@/components/common/photo";
import { Reveal } from "@/components/motion/reveal";
import type { PhotoName } from "@/lib/photos";

const MOMENTS: { photo: PhotoName; title: string; body: string; position?: string; span?: string }[] = [
  { photo: "field-panorama", title: "Grown by smallholders", body: "Bengaluru's farms list what they actually have, as they harvest it.", position: "70% 50%", span: "sm:col-span-2 lg:col-span-2 lg:row-span-2" },
  { photo: "carrots-harvest", title: "Picked this morning", body: "Harvest dates are declared and checked, never guessed.", position: "40% 60%" },
  { photo: "crate-topdown", title: "Packed with care", body: "Every lot is photographed, scored and verified by a person.", position: "50% 50%" },
  { photo: "truck-sunset", title: "On the road", body: "Short routes, pooled runs, riders with OTP handover.", position: "60% 55%" },
  { photo: "box-unpack", title: "At the doorstep", body: "Households get a basket they can trace to the farm.", position: "50% 50%" },
  { photo: "salad-plating", title: "On the plate", body: "Kitchens buy in bulk and nothing is left to wilt.", position: "55% 50%", span: "sm:col-span-2 lg:col-span-1" },
];

/** Photo mosaic between "How it works" and the impact numbers. */
export function FieldStory() {
  return (
    <section aria-labelledby="story-title" className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
      <Reveal>
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">From the field</p>
        <h2 id="story-title" className="mt-3 max-w-3xl text-3xl leading-[1.05] font-semibold tracking-tight sm:text-4xl">
          Real farms. Real kitchens. <span className="font-serif font-normal italic">Nothing in between.</span>
        </h2>
      </Reveal>
      <div className="mt-8 grid auto-rows-[8.5rem] gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {MOMENTS.map((m, i) => (
          <Reveal key={m.photo} delay={i * 0.05} className={`h-full ${m.span ?? ""}`}>
            <figure className="group relative h-full overflow-hidden rounded-2xl border">
              <Photo name={m.photo} decorative scrim="bottom" position={m.position} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw" className="absolute inset-0 size-full" imgClassName="transition-transform duration-700 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 p-3 text-white">
                <span className="block text-sm font-semibold tracking-tight sm:text-base">{m.title}</span>
                <span className="mt-0.5 hidden text-xs text-white/85 sm:block">{m.body}</span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
