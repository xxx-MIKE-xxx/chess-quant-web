"use client";

import { sendAdminNotification, triggerTestEmail } from "./actions";

// Button 1: Send Toast
export function SendAlertButton({ username }: { username: string }) {
  async function handleClick() {
    // Simple browser prompt (fastest way to build this UI)
    const message = window.prompt(`Send alert to ${username}:`);
    
    if (!message) return; // Cancelled

    const result = await sendAdminNotification(username, message);
    
    if (result?.success) {
      alert("Notification sent!");
    } else {
      alert("Failed to send.");
    }
  }

  return (
    <button 
      onClick={handleClick}
      className="text-blue-400 hover:text-blue-300 text-xs underline cursor-pointer"
    >
      Send Alert
    </button>
  );
}

// Button 2: Send Email
export function SendEmailButton({ username }: { username: string }) {
  async function handleClick() {
    const confirm = window.confirm(`Send TEST Welcome Email for ${username}?`);
    if (!confirm) return;

    const result = await triggerTestEmail(username);
    
    if (result?.success) {
      alert("Email sent! Check your inbox.");
    } else {
      alert("Failed to send email. Check server logs.");
    }
  }

  return (
    <button 
      onClick={handleClick}
      className="text-emerald-400 hover:text-emerald-300 text-xs underline cursor-pointer ml-4"
    >
      Test Email
    </button>
  );
}