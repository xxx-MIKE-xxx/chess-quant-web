"use server";

import { db } from "@/lib/firebaseAdmin";

export async function sendAdminNotification(username: string, message: string) {
  if (!username || !message) return;

  try {
    // Write to the user's subcollection
    await db.collection("users").doc(username).collection("notifications").add({
      message,
      type: "warning", // Default to warning color for admin alerts
      read: false,
      createdAt: new Date(),
    });
    return { success: true };
  } catch (e) {
    console.error("Failed to send notification", e);
    return { success: false };
  }
}