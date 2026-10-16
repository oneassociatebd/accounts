import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: import("@tanstack/react-router").ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">An unexpected error occurred. Please try again.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "One Associate — Billing & Client Management System" },
      {
        name: "description",
        content:
          "One Associate is a comprehensive billing and client management system for professional invoicing, collections, and customer ledgers.",
      },
      { property: "og:site_name", content: "One Associate" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "One Associate — Billing & Client Management System" },
      {
        property: "og:description",
        content:
          "Professional billing, invoicing, and customer ledger management for service businesses.",
      },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "One Associate — Billing & Client Management System" },
      {
        name: "twitter:description",
        content:
          "Professional billing, invoicing, and customer ledger management for service businesses.",
      },
      { name: "description", content: "A service billing and client management ERP for consultants, built with Node.js and MySQL." },
      { property: "og:description", content: "A service billing and client management ERP for consultants, built with Node.js and MySQL." },
      { name: "twitter:description", content: "A service billing and client management ERP for consultants, built with Node.js and MySQL." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6b222851-744d-46ba-a001-20777d7e6177/id-preview-eddc2160--feafece6-a34b-482b-9053-dc8ab7a5758e.lovable.app-1780414274175.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/6b222851-744d-46ba-a001-20777d7e6177/id-preview-eddc2160--feafece6-a34b-482b-9053-dc8ab7a5758e.lovable.app-1780414274175.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Preconnect to Supabase for faster API calls on slow networks
      ...(supabaseUrl ? [
        { rel: "preconnect", href: supabaseUrl },
        { rel: "dns-prefetch", href: supabaseUrl },
      ] : []),
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "One Associate",
          url: "https://oneassociatebd.lovable.app",
          description:
            "Billing and client management system for professional invoicing and collections.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "One Associate",
          url: "https://oneassociatebd.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});


function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
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
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
