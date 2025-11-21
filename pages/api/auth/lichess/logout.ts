// pages/api/auth/lichess/logout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const base = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };

  res.setHeader("Set-Cookie", [
    cookie.serialize("session", "", base),
    cookie.serialize("lichess_state", "", base),
    cookie.serialize("lichess_code_verifier", "", base),
  ]);

  return res.redirect(302, "/");
}
