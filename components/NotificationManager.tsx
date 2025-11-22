"use client";

import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, limit, doc, updateDoc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
import { Toast, NotificationType } from "./Toast";

export default function NotificationManager({ username }: { username?: string }) {
  const [activeNote, setActiveNote] = useState<{ id: string; msg: string; type: NotificationType } | null>(null);

  useEffect(() => {
    if (!username) return;

    // Listen for the oldest unread notification
    // Note: If you haven't created the Index in Firebase Console yet, 
    // remove 'orderBy("createdAt", "asc")' and just use limit(1).
    const q = query(
      collection(db, "users", username, "notifications"),
      where("read", "==", false),
      // orderBy("createdAt", "asc"), // Uncomment this if you made the index
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const data = change.doc.data();
          setActiveNote({
            id: change.doc.id,
            msg: data.message,
            type: data.type || "info",
          });
        }
      });
    });

    return () => unsubscribe();
  }, [username]);

  async function dismiss() {
    if (!activeNote || !username) return;
    
    const idToDismiss = activeNote.id;
    setActiveNote(null); // Hide immediately from UI

    try {
      // Mark as read in DB
      await updateDoc(doc(db, "users", username, "notifications", idToDismiss), { 
        read: true 
      });
    } catch (e) {
      console.error("Failed to dismiss notification", e);
    }
  }

  if (!activeNote) return null;

  return (
    <Toast 
      message={activeNote.msg} 
      type={activeNote.type} 
      onClose={dismiss} 
    />
  );
}