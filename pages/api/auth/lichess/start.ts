// pages/api/auth/lichess/start.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { generateRandomString, sha256Base64Url } from "@/lib/pkce";
import cookie from "cookie";

const LICHESS_AUTH_URL = "https://lichess.org/oauth";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("LICHESS_CLIENT_ID =", process.env.LICHESS_CLIENT_ID);
  console.log("LICHESS_REDIRECT_URL =", process.env.LICHESS_REDIRECT_URL);

  const clientId = process.env.LICHESS_CLIENT_ID;
  const redirectUri = process.env.LICHESS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res
      .status(500)
      .json({ error: "Lichess OAuth is not configured correctly" });
  }

  const state = generateRandomString(32);
  const codeVerifier = generateRandomString(64);
  const codeChallenge = sha256Base64Url(codeVerifier);

  // set cookies for callback
  res.setHeader("Set-Cookie", [
    cookie.serialize("lichess_state", state, {
      httpOnly: true,
      secure: false, // set true in production (https)
      path: "/",
      maxAge: 300,
    }),
    cookie.serialize("lichess_code_verifier", codeVerifier, {
      httpOnly: true,
      secure: false, // set true in production
      path: "/",
      maxAge: 300,
    }),
  ]);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "", // add scopes if needed
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const url = `${LICHESS_AUTH_URL}?${params.toString()}`;
  res.redirect(302, url);
}
