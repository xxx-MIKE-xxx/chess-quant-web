// pages/api/auth/lichess/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";

const TOKEN_URL = "https://lichess.org/api/token";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const clientId = process.env.LICHESS_CLIENT_ID;
  const redirectUri = process.env.LICHESS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res
      .status(500)
      .json({ error: "Lichess OAuth is not configured correctly" });
  }

  const { code, state } = req.query;

  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).json({ error: "Invalid query params" });
  }

  const cookies = cookie.parse(req.headers.cookie || "");
  const storedState = cookies["lichess_state"];
  const codeVerifier = cookies["lichess_code_verifier"];

  if (!storedState || !codeVerifier || state !== storedState) {
    return res.status(400).json({ error: "Invalid OAuth state" });
  }

  // clear cookies
  res.setHeader("Set-Cookie", [
    cookie.serialize("lichess_state", "", {
      path: "/",
      maxAge: 0,
    }),
    cookie.serialize("lichess_code_verifier", "", {
      path: "/",
      maxAge: 0,
    }),
  ]);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return res.status(500).send("Token error: " + text);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    token_type: string;
    scope?: string;
  };

  const accessToken = tokenJson.access_token;

  const accountRes = await fetch("https://lichess.org/api/account", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!accountRes.ok) {
    const text = await accountRes.text();
    return res.status(500).send("Account error: " + text);
  }

  const account = await accountRes.json();

  // For now: show account info as JSON
  // Later: create session & redirect to dashboard
  return res.status(200).json({ account, accessToken });
}
