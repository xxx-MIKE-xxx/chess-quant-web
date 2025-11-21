// pages/api/stripe-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/firebaseAdmin";

export const config = {
  api: {
    bodyParser: false, // Stripe needs the raw body
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).send("Missing Stripe signature");
  }

  const buf = await buffer(req);
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const username =
          (session.client_reference_id as string | null) ||
          (session.metadata?.username as string | undefined);

        if (!username) {
          console.warn(
            "checkout.session.completed without username",
            session.id
          );
          break;
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription as any)?.id;

        const userRef = db.collection("users").doc(username);
        await userRef.set(
          {
            isPro: true,
            stripeCustomerId: customerId ?? null,
            stripeSubscriptionId: subscriptionId ?? null,
          },
          { merge: true }
        );

        break;
      }

      // Later we can handle subscription.updated / deleted here too
      default:
        break;
    }

    return res.json({ received: true });
  } catch (e: any) {
    console.error("Error handling Stripe webhook:", e);
    return res.status(500).send("Webhook internal error");
  }
}
