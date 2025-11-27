import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const sessionSecret = process.env.SESSION_SECRET!;
  const token = cookie.parse(req.headers.cookie || "")["session"];
  if (!token) return res.status(401).json({ error: "Not logged in" });

  try {
    const session = jwt.verify(token, sessionSecret) as any;
    
    // Fetch last 20 games (lightweight)
    const url = `https://lichess.org/api/games/user/${session.lichessUsername}?max=20&clocks=true&evals=true&opening=true`;
    
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.accessToken}`, Accept: "application/x-ndjson" }
    });

    const text = await response.text();
    const games = text.trim().split('\n').map(l => l ? JSON.parse(l) : null).filter(Boolean);

    return res.status(200).json({ games });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}