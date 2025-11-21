// lib/pkce.ts
import crypto from "crypto";

// random URL-safe string
export function generateRandomString(length = 64): string {
  return crypto.randomBytes(length).toString("base64url");
}

// BASE64URL(SHA256(input))
export function sha256Base64Url(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest("base64");
  // Convert to base64url (no +, /, =)
  return hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
