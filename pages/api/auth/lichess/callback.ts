// pages/api/auth/lichess/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";

const TOKEN_URL = "https://lichess.org/api/token";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const clientId = process.env.LICHESS_CLIENT_ID;
  const redirectUri = process.env.LICHESS_REDIRECT_URI;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!clientId || !redirectUri || !sessionSecret) {
    console.error("[lichess callback] Missing Lichess env vars", {
      clientIdPresent: !!clientId,
      redirectUriPresent: !!redirectUri,
      sessionSecretPresent: !!sessionSecret,
    });
    return res.status(500).json({
      error: "Lichess OAuth or SESSION_SECRET not configured",
    });
  }

  // 0. If Lichess redirected with an OAuth error, log & show it
  if (typeof req.query.error === "string") {
    const err = req.query.error;
    const desc =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : "";
    console.error("[lichess callback] OAuth error from Lichess:", {
      error: err,
      description: desc,
      query: req.query,
    });
    return res
      .status(400)
      .send(`Lichess OAuth error: ${err}${desc ? ` - ${desc}` : ""}`);
  }

  // 1. Read query params
  const { code, state } = req.query;

  console.log("[lichess callback] incoming query:", req.query);

  if (typeof code !== "string" || typeof state !== "string") {
    console.error("[lichess callback] Invalid query params", { code, state });
    return res.status(400).json({ error: "Invalid query params" });
  }

  // 2. Read cookies set in /api/auth/lichess/start
  const cookiesObj = cookie.parse(req.headers.cookie || "");
  const storedState = cookiesObj["lichess_state"];
  const codeVerifier = cookiesObj["lichess_code_verifier"];

  console.log("[lichess callback] raw cookies:", req.headers.cookie);
  console.log("[lichess callback] query state:", state);
  console.log(
    "[lichess callback] storedState & codeVerifier:",
    storedState,
    codeVerifier ? "(present)" : "(missing)"
  );

  if (!codeVerifier) {
    console.error("[lichess callback] Missing PKCE code_verifier cookie");
    return res
      .status(400)
      .send("Token error: missing PKCE verifier, please try again");
  }

  // Optional: state check (softened for early stage)
  if (storedState && state !== storedState) {
    console.warn("[lichess callback] OAuth state mismatch", {
      queryState: state,
      storedState,
      cookies: req.headers.cookie,
    });
    // Later, tighten this:
    // return res.status(400).json({ error: "Invalid OAuth state" });
  }

  // 3. Clear temporary OAuth cookies
  res.setHeader("Set-Cookie", [
    cookie.serialize("lichess_state", "", { path: "/", maxAge: 0 }),
    cookie.serialize("lichess_code_verifier", "", { path: "/", maxAge: 0 }),
  ]);

  // 4. Exchange code for access token
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  console.log("[lichess callback] Exchanging code for token…");

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[lichess callback] Token error from Lichess:", {
      status: tokenRes.status,
      body: text,
    });
    return res.status(500).send("Token error: " + text);
  }

  const tokenJson = (await tokenRes.json()) as {
    access_token: string;
    token_type: string;
    scope?: string;
  };

  const accessToken = tokenJson.access_token;
  console.log("[lichess callback] Got access token, fetching account…");

  // 5. Fetch user's account
  const accountRes = await fetch("https://lichess.org/api/account", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!accountRes.ok) {
    const text = await accountRes.text();
    console.error("[lichess callback] Account error from Lichess:", {
      status: accountRes.status,
      body: text,
    });
    return res.status(500).send("Account error: " + text);
  }

  const account = await accountRes.json();
  console.log("[lichess callback] Account loaded:", {
    id: account.id,
    username: account.username,
  });

  // 6. Build a minimal session payload
  const sessionPayload = {
    lichessId: account.id,
    lichessUsername: account.username,
    accessToken,
  };

  // 7. Sign JWT
  const token = jwt.sign(sessionPayload, sessionSecret, { expiresIn: "7d" });

  // 8. Set HttpOnly session cookie
  const sessionCookie = cookie.serialize("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });

  res.setHeader("Set-Cookie", sessionCookie);

  // 9. Redirect back to home
  console.log("[lichess callback] Login success, redirecting to /");
  return res.redirect(302, "/");
}
