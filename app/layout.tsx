import "./globals.css";
import type { Metadata } from "next";
import { PosthogBoot } from "./PosthogBoot";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import NotificationManager from "@/components/NotificationManager";
import { ThemeProvider } from "./ThemeProvider";
import { CookieConsent } from "@/components/CookieConsent"; // <--- NEW IMPORT

export const metadata: Metadata = {
  title: "Chess Quant",
  description: "Tilt-aware chess training",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let username = "";

  if (token && process.env.SESSION_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET) as any;
      username = payload.lichessUsername || "";
    } catch (e) {
      // Token invalid/expired
    }
  }

  return (
    // suppressHydrationWarning is required by next-themes
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Analytics Bootstrapper (Silent Init) */}
          <PosthogBoot />
          
          {/* Live Notifications System */}
          <NotificationManager username={username} />
          
          {/* GDPR Banner (Shows if no consent found) */}
          <CookieConsent />
          
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}