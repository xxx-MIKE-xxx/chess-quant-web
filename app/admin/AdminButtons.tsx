"use client";

import { sendAdminNotification } from "./actions";

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