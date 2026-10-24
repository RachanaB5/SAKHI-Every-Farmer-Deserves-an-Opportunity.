// "Fly to cart" micro-interaction: a thumbnail arcs from the tapped card
// into the visible cart icon ([data-cart-target]). Pure Web Animations API
// so it costs nothing when unused; skipped for reduced-motion users.
"use client";

/**
 * @param from - element the product image starts from
 * @param imageUrl - thumbnail to fly
 */
export function flyToCart(from: HTMLElement | null, imageUrl: string | null) {
  if (!from || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]")).find((el) => el.offsetParent !== null);
  if (!target) return;

  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const size = 56;
  const ghost = document.createElement("div");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${a.left + a.width / 2 - size / 2}px`,
    top: `${a.top + a.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "9999px",
    backgroundImage: imageUrl ? `url("${imageUrl}")` : "none",
    backgroundColor: "var(--lime)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "0 12px 30px -8px rgba(0,0,0,.45)",
    zIndex: "100",
    pointerEvents: "none",
  });
  document.body.appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = ghost.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 120}px) scale(0.85)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.4 },
    ],
    { duration: 750, easing: "cubic-bezier(.5,0,.3,1)" },
  );
  anim.onfinish = () => {
    ghost.remove();
    target.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 380, easing: "ease-out" });
  };
}
