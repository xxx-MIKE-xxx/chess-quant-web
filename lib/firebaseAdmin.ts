// lib/firebaseAdmin.ts
import admin from "firebase-admin";

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase admin not fully configured");
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
}

const db = admin.firestore();

/** Upsert user + append a tilt result */
export async function recordTiltResult(opts: {
  lichessId: string;
  username: string;
  tiltScore: number;
}) {
  const { lichessId, username, tiltScore } = opts;
  const now = admin.firestore.FieldValue.serverTimestamp();

  const userRef = db.collection("users").doc(username);

  // upsert basic user profile + last tilt info
  await userRef.set(
    {
      lichessId,
      username,
      createdAt: now,
      lastLoginAt: now,
      lastTiltAt: now,
      lastTiltScore: tiltScore,
    },
    { merge: true }
  );

  // add entry to tiltResults subcollection
  await userRef.collection("tiltResults").add({
    tiltScore,
    createdAt: now,
  });
}

/** Read profile + recent tilt history for the dashboard */
export async function getUserDashboard(username: string) {
  const userRef = db.collection("users").doc(username);
  const userSnap = await userRef.get();

  if (!userSnap.exists) return null;

  const userData = userSnap.data() || {};

  // 1. EXISTING: Fetch Tilt History
  const resultsSnap = await userRef
    .collection("tiltResults")
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();

  const tiltHistory = resultsSnap.docs.map((doc) => {
    const data = doc.data() as any;
    let createdIso = null;
    if (data.createdAt?.toDate) {
      createdIso = data.createdAt.toDate().toISOString(); // It's a Timestamp
    } else if (typeof data.createdAt === "string") {
      createdIso = data.createdAt; // It's already an ISO string
    }
    return {
      id: doc.id,
      tiltScore: data.tiltScore ?? null,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : null,
    };
  });

  // 2. NEW: Fetch Last Synced Game Date
  const lastGameSnap = await userRef
    .collection("games")
    .orderBy("createdAt", "desc") // Sort by game played time
    .limit(1)
    .get();

  // Lichess time is usually milliseconds (number), convert to string if needed
  let lastGameAt = null;
  if (!lastGameSnap.empty) {
    const gameData = lastGameSnap.docs[0].data();
    // Lichess 'createdAt' is a timestamp number (ms)
    lastGameAt = new Date(gameData.createdAt).toISOString();
  }

  return {
    profile: {
      lichessId: userData.lichessId ?? null,
      username: userData.username ?? username,
      lastTiltScore: userData.lastTiltScore ?? null,
      lastTiltAt: userData.lastTiltAt?.toDate
        ? userData.lastTiltAt.toDate().toISOString()
        : null,
      isPro: typeof userData.isPro === "boolean" ? userData.isPro : null,
      cancelAtPeriodEnd: !!userData.cancelAtPeriodEnd,
    },
    tiltHistory,
    lastGameAt, // <--- Pass this to frontend
  };
}


export { admin, db };
