import "./globals.css";
import type { Metadata } from "next";
import { PosthogBoot } from "./PosthogBoot";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
// This component will handle the live Firestore connection
import NotificationManager from "@/components/NotificationManager";

export const metadata: Metadata = {
  title: "Chess Quant",
  description: "Tilt-aware chess training",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Attempt to get the logged-in username server-side
  // We need this to tell the NotificationManager which user's alerts to listen for.
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  let username = "";

  if (token && process.env.SESSION_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.SESSION_SECRET) as any;
      username = payload.lichessUsername || "";
    } catch (e) {
      // If token is invalid/expired, we just don't listen for notifications
    }
  }

  return (
    <html lang="en">
      <body className="bg-black text-white">
        <PosthogBoot />
        
        {/* Invisible listener for live toasts */}
        <NotificationManager username={username} />
        
        {children}
      </body>
    </html>
  );
}