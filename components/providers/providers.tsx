// Root client providers: theme (light/dark via CSS class), tooltips, toasts
// and SWR defaults. Shared by every interface.
"use client";

import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";

/**
 * Wraps the app in global client-side context.
 * @param children - the rendered route tree
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false }}>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </SWRConfig>
    </ThemeProvider>
  );
}
