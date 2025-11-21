// pages/api/stripe-webhook.ts
import type { NextApiRequest, NextApiResponse } from "next";
import getRawBody from "raw-body";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/firebaseAdmin";

export const config = {
  api: {
    // We need the raw body for Stripe signature verification
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || Array.isArray(sig) || !webhookSecret) {
    console.error(
      "[stripe-webhook] Missing signature or STRIPE_WEBHOOK_SECRET"
    );
    return res.status(400).send("Webhook signature missing");
  }

  let event: Stripe.Event;

  try {
    const buf = await getRawBody(req);
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err: any) {
    console.error(
      "[stripe-webhook] Signature verification failed:",
      err.message
    );
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

      default:
        // ignore other events for now
        break;
    }

    return res.json({ received: true });
  } catch (e: any) {
    console.error("Error handling Stripe webhook:", e);
    return res.status(500).send("Webhook internal error");
  }
}