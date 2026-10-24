// Page frame shared by the sign-in and join screens: the brand panel on the
// left (desktop), logo and theme switch on top, a centred column of content.
import { AuthAside } from "@/components/auth/auth-aside";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/common/theme-toggle";

/**
 * @param width - max width of the content column
 */
export function AuthShell({ children, width = "max-w-xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <AuthAside />
      <section className="flex flex-col px-4 pt-4 pb-10 sm:px-8 lg:px-14 lg:py-10">
        <header className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </header>
        <div className={`mx-auto w-full ${width} flex-1 pt-8 lg:pt-12`}>{children}</div>
      </section>
    </main>
  );
}
