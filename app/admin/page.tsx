import { redirect } from "next/navigation";
import { headers } from "next/headers";
import cookie from "cookie";
import jwt from "jsonwebtoken";
import { db } from "@/lib/firebaseAdmin";
import { SendAlertButton, SendEmailButton } from "./AdminButtons"; // Ensure these are imported

// 1. Helper to verify Admin status on the server
async function getAdminUser() {
  const cookieHeader = (await headers()).get("cookie") || "";
  const cookies = cookie.parse(cookieHeader);
  const token = cookies["session"];

  if (!token || !process.env.SESSION_SECRET) return null;

  try {
    const payload = jwt.verify(token, process.env.SESSION_SECRET) as any;
    const username = payload.lichessUsername;

    // Check Firestore for the flag
    const doc = await db.collection("users").doc(username).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (data?.isAdmin === true) {
      return { username, ...data };
    }
  } catch (e) {
    console.error("Admin auth check failed", e);
  }
  return null;
}

export default async function AdminPage() {
  const adminUser = await getAdminUser();

  // 2. Security Gate
  if (!adminUser) {
    redirect("/"); // Kick them out if not admin
  }

  // 3. Fetch ALL users
  const usersSnap = await db
    .collection("users")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  const users = usersSnap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      username: d.username,
      isPro: !!d.isPro,
      cancelAtPeriodEnd: !!d.cancelAtPeriodEnd,
      stripeId: d.stripeCustomerId || "—",
      lastLogin: d.lastLoginAt?.toDate
        ? d.lastLoginAt.toDate().toLocaleDateString()
        : "—",
    };
  });

  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 border-b border-border pb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-primary">God Mode</h1>
            <p className="text-muted-foreground text-sm">System Overview</p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            Admin: <span className="text-foreground font-bold">{adminUser.username}</span>
          </div>
        </header>

        {/* User Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-secondary/50 text-muted-foreground font-medium">
              <tr>
                <th className="p-4">Username</th>
                <th className="p-4">Status</th>
                <th className="p-4">Stripe ID</th>
                <th className="p-4">Last Login</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="hover:bg-secondary/30 transition-colors"
                >
                  <td className="p-4 font-medium text-foreground">{u.username}</td>
                  <td className="p-4">
                    {u.isPro ? (
                      u.cancelAtPeriodEnd ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                          Ends Soon
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                          Pro Active
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground">Free Tier</span>
                    )}
                  </td>
                  <td className="p-4 font-mono text-xs text-muted-foreground">
                    {u.stripeId}
                  </td>
                  <td className="p-4 text-muted-foreground">{u.lastLogin}</td>
                  <td className="p-4 text-right flex justify-end gap-4">
                    <SendAlertButton username={u.username} />
                    <SendEmailButton username={u.username} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}