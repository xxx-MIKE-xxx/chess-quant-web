// pages/api/auth/lichess/start.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import crypto from "crypto";

const AUTH_URL = "https://lichess.org/oauth";

function base64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientId = process.env.LICHESS_CLIENT_ID;
  const redirectUri = process.env.LICHESS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error("Missing Lichess env vars");
    return res
      .status(500)
      .json({ error: "Lichess OAuth not configured correctly" });
  }

  // 1) Generate state & PKCE code_verifier / code_challenge
  const state = base64url(crypto.randomBytes(16));
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );

  // 2) Store them in HttpOnly cookies
  const cookies = [
    cookie.serialize("lichess_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    }),
    cookie.serialize("lichess_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 10 * 60,
    }),
  ];

  res.setHeader("Set-Cookie", cookies);

  // 3) Redirect to Lichess OAuth authorization endpoint
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "board:play challenge:read challenge:write", // or whatever you need
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  const url = `${AUTH_URL}?${params.toString()}`;
  return res.redirect(302, url);
}