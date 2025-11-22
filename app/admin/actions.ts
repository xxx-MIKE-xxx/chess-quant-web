"use server";

import { db } from "@/lib/firebaseAdmin";
import { sendWelcomeEmail } from "@/lib/email";

// 1. Send In-App Notification (Toast)
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

// 2. Trigger Welcome Email
export async function triggerTestEmail(username: string) {
  // In a real app, you'd fetch the user's real email from DB.
  // For testing in Sandbox, we MUST send to YOUR registered Resend email.
  // Replace this string with YOUR ACTUAL EMAIL you used to sign up for Resend.
  const TEST_EMAIL = "michulek123@gmail.com"; 

  console.log(`Triggering email test for ${username} to ${TEST_EMAIL}`);
  return await sendWelcomeEmail(TEST_EMAIL, username);
}