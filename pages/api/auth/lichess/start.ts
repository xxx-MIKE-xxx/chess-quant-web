// pages/api/auth/lichess/start.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import crypto from "crypto";

const AUTH_URL = "https://lichess.org/oauth";

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientId = process.env.LICHESS_CLIENT_ID;
  const redirectUri = process.env.LICHESS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error("Missing Lichess env vars");
    return res.status(500).json({ error: "Lichess OAuth not configured" });
  }

  // 1) Generate state + PKCE verifier/challenge
  const state = base64UrlEncode(crypto.randomBytes(32));
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));

  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  };

  // 2) Store state + code_verifier in cookies
  res.setHeader("Set-Cookie", [
    cookie.serialize("lichess_state", state, cookieOptions),
    cookie.serialize("lichess_code_verifier", codeVerifier, cookieOptions),
  ]);

  // 3) Redirect to Lichess OAuth
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "account:read", // or whatever you need
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const redirectUrl = `${AUTH_URL}?${params.toString()}`;

  return res.redirect(302, redirectUrl);
}
