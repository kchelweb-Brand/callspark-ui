import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { OG_IMAGE_PATH, SITE_DESCRIPTION, SITE_NAME, absoluteUrl, isPrivatePath, ldScript, organizationLd, websiteLd } from "@/site/seo";

import { Toaster } from "@/components/ui/sonner";
import { SoftphoneProvider } from "@/components/dash/SoftphoneProvider";
import { HelpChat } from "@/components/help/HelpChat";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Kchel Dialer: call center software with a power dialer and voice broadcasts" },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#0b2742" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [ldScript(organizationLd()), ldScript(websiteLd())],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
      // SVG first for browsers that take it; favicon.ico carries the raster
      // fallback (16/32/48) that Safari and older browsers actually use.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <SeoTags />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Softphone lives above the router so page components — which *render*
          Shell rather than sit inside it — can still reach the context, and so
          one registration survives navigation. It stays inert until an agent
          explicitly goes online, so mounting it on public pages costs nothing. */}
      <SoftphoneProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </SoftphoneProvider>
      <HelpChat />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}

/**
 * Tags every page needs and no page should have to repeat: the canonical address, the social preview
 * built from the page's own title and description, and a "do not index" on the signed-in app.
 */
function SeoTags() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const matches = useRouterState({ select: (s) => s.matches });
  const metas = matches.flatMap((m) => ((m as { meta?: unknown }).meta ?? []) as Record<string, string | undefined>[]);
  const has = (key: "name" | "property", value: string) => metas.some((m) => m?.[key] === value);
  const title = [...metas].reverse().find((m) => typeof m?.["title"] === "string")?.["title"] ?? SITE_NAME;
  const description = [...metas].reverse().find((m) => m?.["name"] === "description")?.["content"] ?? SITE_DESCRIPTION;
  const url = absoluteUrl(pathname);
  const image = absoluteUrl(OG_IMAGE_PATH);
  return (
    <>
      <link rel="canonical" href={url} />
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Kchel Dialer: call center software with a power dialer and voice broadcasts" />
      <meta name="twitter:image" content={image} />
      {!has("property", "og:title") && <meta property="og:title" content={title} />}
      {!has("property", "og:description") && <meta property="og:description" content={description} />}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {isPrivatePath(pathname) && <meta name="robots" content="noindex, nofollow" />}
    </>
  );
}
