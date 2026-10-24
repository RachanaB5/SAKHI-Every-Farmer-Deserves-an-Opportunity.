// "From farm to table" — a scroll-scrubbed storybook. A tall track holds a
// sticky full-screen stage; the scroll position (and nothing else) decides
// how far the story has played, so scrolling back rewinds it and stopping
// freezes it. One requestAnimationFrame loop eases the picture toward the
// scroll position and writes transforms straight to the SVG — no React
// state, no timers, no scroll hijacking, and it goes idle as soon as the
// picture has caught up.
//
// Phones are portrait, so there the camera pans and zooms with the action
// instead of squeezing the whole scene into view. Reduced-motion users get
// the finished scene as a still picture with the four captions listed.
"use client";

import { useEffect, useRef } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { pose, WORLD } from "./pose";
import { Scene } from "./scene";

const CAPTIONS = [
  { title: "Fresh from the farm.", body: "Grown by smallholders near you." },
  { title: "Picked with care.", body: "Every harvest is checked before it is sold." },
  { title: "Delivered directly to you.", body: "No middlemen, and every handover is OTP-verified." },
  { title: "Made into something delicious.", body: "Households, restaurants and community kitchens cook with it." },
] as const;

/** Time constant (s) of the easing toward the scroll position; time-based, so slow devices catch up as fast as quick ones. */
const EASE_TAU = 0.085;
// Phone camera: 900 world units across and as tall as the screen needs, placed so the ground sits
// about 72% of the way down (characters low, captions in the sky above).
const PORTRAIT_W = 900;
const GROUND_AT = 0.72;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** The scroll-driven story section. */
export function FarmStory() {
  const portrait = useMediaQuery("(max-aspect-ratio: 1/1)");
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const captions = useRef<(HTMLDivElement | null)[]>([]);
  const hint = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trackEl = track.current;
    const stageEl = stage.current;
    const svgEl = svg.current;
    if (!trackEl || !stageEl || !svgEl) return;

    const parts = new Map<string, Element>();
    svgEl.querySelectorAll("[data-p]").forEach((el) => parts.set(el.getAttribute("data-p")!, el));
    const written = new Map<string, string>();
    const write = (id: string, attr: string, value: string) => {
      const key = `${id}|${attr}`;
      if (written.get(key) === value) return;
      written.set(key, value);
      parts.get(id)?.setAttribute(attr, value);
    };

    let target = 0;
    let current = 0;
    let raf = 0;
    let viewH: number = WORLD.H;
    let lookY: number = WORLD.H / 2;

    /** Sizes the viewBox to the stage so the scene fills the screen at any aspect ratio. */
    const fitView = () => {
      if (portrait) {
        viewH = PORTRAIT_W * (stageEl.clientHeight / Math.max(1, stageEl.clientWidth));
        lookY = WORLD.ground - (GROUND_AT - 0.5) * viewH;
        svgEl.setAttribute("viewBox", `0 0 ${PORTRAIT_W} ${viewH.toFixed(1)}`);
      } else {
        svgEl.setAttribute("viewBox", `0 0 ${WORLD.W} ${WORLD.H}`);
      }
    };
    fitView();

    const render = () => {
      const s = pose(current, portrait);
      for (const id in s.t) write(id, "transform", s.t[id]);
      for (const id in s.o) write(id, "opacity", String(Math.round(s.o[id] * 1000) / 1000));
      write("camera", "transform", portrait ? `translate(${PORTRAIT_W / 2} ${(viewH / 2).toFixed(1)}) scale(${s.cam.zoom.toFixed(4)}) translate(${(-s.cam.cx).toFixed(2)} ${(-lookY).toFixed(1)})` : "");
      captions.current.forEach((el, i) => {
        if (!el) return;
        el.style.opacity = String(s.captions[i]);
        el.style.transform = `translate3d(0, ${(1 - s.captions[i]) * 14}px, 0)`;
      });
      if (hint.current) hint.current.style.opacity = String(1 - clamp(current / 0.04));
      svgEl.style.opacity = "1";
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      current = target = 1;
      render();
      return;
    }

    let lastT = 0;
    const tick = (now: number) => {
      const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 1 / 60;
      lastT = now;
      current += (target - current) * (1 - Math.exp(-dt / EASE_TAU));
      if (Math.abs(target - current) < 0.0004) current = target;
      render();
      if (current === target) {
        raf = 0;
        lastT = 0;
      } else raf = requestAnimationFrame(tick);
    };
    const schedule = () => {
      fitView();
      const rect = trackEl.getBoundingClientRect();
      target = clamp(-rect.top / Math.max(1, rect.height - stageEl.offsetHeight));
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    // Start where the page already is (e.g. after a reload mid-story) without easing from zero.
    const rect = trackEl.getBoundingClientRect();
    current = target = clamp(-rect.top / Math.max(1, rect.height - stageEl.offsetHeight));
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [portrait]);

  return (
    <section id="story" aria-labelledby="story-title" className="relative bg-[#eef4ef] text-[#24382a]">
      <h2 id="story-title" className="sr-only">
        From farm to table: a farmer picks a tomato and tosses it to a home cook, who turns it into dinner.
      </h2>
      <div ref={track} className="relative h-[600svh] motion-reduce:h-auto">
        <div ref={stage} className="sticky top-0 h-svh overflow-hidden motion-reduce:static motion-reduce:h-[78svh]">
          <svg
            ref={svg}
            aria-hidden
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 size-full opacity-0"
          >
            <Scene />
          </svg>

          {/* golden-hour light from the upper left and a gentle vignette, like a film frame */}
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_18%_8%,rgb(255_255_255/0.3),transparent_55%),radial-gradient(130%_110%_at_50%_45%,transparent_55%,rgb(20_45_30/0.16))]" />

          <div className="pointer-events-none absolute inset-x-0 top-20 px-4 text-center sm:top-24">
            <div className="relative mx-auto h-28 max-w-2xl">
              {CAPTIONS.map((c, i) => (
                <div
                  key={c.title}
                  ref={(el) => {
                    captions.current[i] = el;
                  }}
                  aria-hidden
                  style={{ opacity: i === 0 ? 1 : 0, willChange: "opacity, transform" }}
                  className="absolute inset-0"
                >
                  <p className="font-mono text-xs tracking-widest uppercase opacity-60">
                    0{i + 1} / 0{CAPTIONS.length}
                  </p>
                  <p className="mt-2 text-3xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">{c.title}</p>
                  <p className="mt-2 text-base opacity-75 sm:text-lg">{c.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div ref={hint} aria-hidden className="pointer-events-none absolute inset-x-0 bottom-6 text-center font-mono text-xs tracking-widest uppercase opacity-70 motion-reduce:hidden">
            Scroll to play ↓
          </div>
        </div>
      </div>

      <ol className="sr-only motion-reduce:not-sr-only motion-reduce:mx-auto motion-reduce:grid motion-reduce:max-w-5xl motion-reduce:gap-4 motion-reduce:px-4 motion-reduce:py-10 motion-reduce:sm:grid-cols-2">
        {CAPTIONS.map((c) => (
          <li key={c.title}>
            <span className="block text-xl font-semibold">{c.title}</span>
            <span className="block text-sm opacity-75">{c.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
