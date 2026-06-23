import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppLaunchSplash } from "@/components/app-launch-splash";
import { StandaloneDashboardRedirect } from "@/components/standalone-dashboard-redirect";


export const metadata: Metadata = {
  title: "Diagsync - Medical Diagnostic Operations",
  description: "Multi-role diagnostic operations system for medical labs",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DiagSync",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/diagsync-logo.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = "diagsync-theme";
                  var saved = localStorage.getItem(key);
                  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
                  document.documentElement.classList.toggle("dark", dark);
                  var meta = document.querySelector('meta[name="theme-color"]');
                  if (meta) meta.setAttribute("content", dark ? "#050505" : "#ffffff");
                } catch (e) {}
              })();
            `,
          }}
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DiagSync" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="antialiased">
        <StandaloneDashboardRedirect />
        <AppLaunchSplash />
        {children}
      </body>
    </html>
  );
}

