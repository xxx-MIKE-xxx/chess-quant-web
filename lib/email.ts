import { Resend } from 'resend';
import { WelcomeEmail } from '@/components/emails/WelcomeEmail';
import React from 'react';

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

// The "From" address. 
// IMPORTANT: Until you verify a domain in Resend dashboard, 
// you can ONLY send to your own email address (the one you signed up with).
// Once verified, change this to 'system@yourdomain.com'.
const FROM_EMAIL = 'onboarding@resend.dev'; 

export async function sendWelcomeEmail(email: string, username: string) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("Resend API Key missing. Skipping email.");
    return { success: false, error: "Configuration missing" };
  }

  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Welcome to the Terminal // Chess Quant',
      // FIX: Cast the result to ReactElement to satisfy strict TS
      react: WelcomeEmail({ username }) as React.ReactElement, 
    });

    console.log("Email sent successfully:", data);
    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
}