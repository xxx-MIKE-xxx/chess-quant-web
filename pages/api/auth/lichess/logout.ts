// pages/api/auth/logout.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Clear the session cookie
  res.setHeader(
    "Set-Cookie",
    cookie.serialize("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0, // delete cookie
    })
  );

  return res.status(200).json({ ok: true });
}
