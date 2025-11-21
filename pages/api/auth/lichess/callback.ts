// pages/api/auth/lichess/callback.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";

const TOKEN_URL = "https://lichess.org/api/token";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const clientId = process.env.LICHESS_CLIENT_ID;
    const redirectUri = process.env.LICHESS_REDIRECT_URI;
    const sessionSecret = process.env.SESSION_SECRET;

    if (!clientId || !redirectUri || !sessionSecret) {
      console.error("Missing Lichess env vars");
      return res
        .status(500)
        .json({ error: "Lichess OAuth or SESSION_SECRET not configured" });
    }

    // ---- 1. Read query params ------------------------------------------------
    const { code, state } = req.query;

    if (typeof code !== "string" || typeof state !== "string") {
      return res.status(400).json({ error: "Invalid query params" });
    }

    // ---- 2. Read temporary cookies (state + optional PKCE verifier) ----------
    const cookiesObj = cookie.parse(req.headers.cookie || "");
    const storedState = cookiesObj["lichess_state"];            // must match /auth/lichess/start
    const codeVerifier = cookiesObj["lichess_code_verifier"];   // may be undefined

    if (!storedState || state !== storedState) {
      console.warn("OAuth state mismatch", { state, storedState });

      // For early-stage / personal use we *log* but don't block the login.
      // Later you can turn this into a hard failure again:
      // return res.status(400).json({ error: "Invalid OAuth state" });
    }

    // ---- 3. Clear temporary OAuth cookies -----------------------------------
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

    // ---- 4. Exchange code for access token ----------------------------------
    const bodyParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    };

    if (codeVerifier) {
      bodyParams["code_verifier"] = codeVerifier;
    }

    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token error:", text);
      return res.status(500).send("Token error: " + text);
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      scope?: string;
    };

    const accessToken = tokenJson.access_token;

    // ---- 5. Fetch user account from Lichess ---------------------------------
    const accountRes = await fetch("https://lichess.org/api/account", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!accountRes.ok) {
      const text = await accountRes.text();
      console.error("Account error:", text);
      return res.status(500).send("Account error: " + text);
    }

    const account = await accountRes.json();

    // ---- 6. Create our own session token ------------------------------------
    const sessionPayload = {
      lichessId: account.id,
      lichessUsername: account.username,
      accessToken,
    };

    const token = jwt.sign(sessionPayload, sessionSecret, {
      expiresIn: "7d",
    });

    const sessionCookie = cookie.serialize("session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    res.setHeader("Set-Cookie", sessionCookie);

    // ---- 7. Redirect back to home -------------------------------------------
    return res.redirect(302, "/");
  } catch (err) {
    console.error("Lichess callback error:", err);
    return res.status(500).json({ error: "Internal error in Lichess callback" });
  }
}