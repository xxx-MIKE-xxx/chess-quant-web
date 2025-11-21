// pages/api/me.ts
import type { NextApiRequest, NextApiResponse } from "next";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { db, admin } from "@/lib/firebaseAdmin";

type SessionPayload = {
  lichessId: string;
  lichessUsername: string;
  accessToken: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    console.error("SESSION_SECRET missing");
    return res.status(500).json({ error: "SESSION_SECRET not set" });
  }

  const cookiesObj = cookie.parse(req.headers.cookie || "");
  const token = cookiesObj["session"];

  if (!token) {
    return res.status(200).json({ user: null });
  }

  let session: SessionPayload;
  try {
    session = jwt.verify(token, sessionSecret) as SessionPayload;
  } catch (e) {
    console.error("JWT verify failed in /api/me:", e);
    return res.status(200).json({ user: null });
  }

  const { lichessId, lichessUsername } = session;

  // Upsert user in Firestore
  const userRef = db.collection("users").doc(lichessId);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await userRef.set(
    {
      lichessId,
      username: lichessUsername,
      lastLoginAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  return res.status(200).json({
    user: {
      lichessId,
      username: lichessUsername,
    },
  });
}
