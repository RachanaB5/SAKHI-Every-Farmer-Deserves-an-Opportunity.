// Last-resort error screen when the root layout itself fails. Renders its
// own <html>/<body> with inline styles because globals may not have loaded.
"use client";

/** Replaces the root layout on a fatal error. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#faf9f4", color: "#0d1611", fontFamily: "system-ui, sans-serif", padding: 16, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>FoodFlow hit a snag</h1>
          <p style={{ margin: "0 0 24px", opacity: 0.7 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#0d1611", color: "#faf9f4", fontSize: 16, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
