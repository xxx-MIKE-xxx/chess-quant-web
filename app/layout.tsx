import "./globals.css";
import type { Metadata } from "next";
import { PosthogBoot } from "./PosthogBoot";

export const metadata: Metadata = {
  title: "Chess Meta Coach",
  description: "Tilt-aware chess training",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <PosthogBoot />
        {children}
      </body>
    </html>
  );
}
