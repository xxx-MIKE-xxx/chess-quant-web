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
  if (!sig || Array.isArray(sig)) {
    return res.status(400).send("Missing Stripe signature");
  }

  let event: Stripe.Event;

  try {
    const buf = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- Idempotency: skip already-processed events ---
  const eventsRef = db.collection("stripeWebhookEvents").doc(event.id);
  const existing = await eventsRef.get();
  if (existing.exists) {
    console.log("[stripe-webhook] Duplicate event, skipping:", event.id);
    return res.json({ received: true, duplicate: true });
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

        console.log(
          "[stripe-webhook] checkout.session.completed → set isPro=true for",
          username
        );
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        const subscriptionId = subscription.id;
        const status = subscription.status;

        const isActive = status === "active" || status === "trialing";

        const usersRef = db.collection("users");
        let snap = await usersRef
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();

        if (snap.empty && customerId) {
          snap = await usersRef
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();
        }

        if (!snap.empty) {
          const doc = snap.docs[0];
          await doc.ref.set(
            {
              isPro: isActive,
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId ?? null,
            },
            { merge: true }
          );
          console.log(
            "[stripe-webhook] customer.subscription.updated → isPro=",
            isActive,
            "for user doc",
            doc.id
          );
        } else {
          console.warn(
            "[stripe-webhook] subscription.updated: no user found for",
            { subscriptionId, customerId }
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : subscription.customer?.id;
        const subscriptionId = subscription.id;

        const usersRef = db.collection("users");
        let snap = await usersRef
          .where("stripeSubscriptionId", "==", subscriptionId)
          .limit(1)
          .get();

        if (snap.empty && customerId) {
          snap = await usersRef
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();
        }

        if (!snap.empty) {
          const doc = snap.docs[0];
          await doc.ref.set(
            {
              isPro: false,
              stripeSubscriptionId: null,
            },
            { merge: true }
          );
          console.log(
            "[stripe-webhook] customer.subscription.deleted → isPro=false for user doc",
            doc.id
          );
        } else {
          console.warn(
            "[stripe-webhook] subscription.deleted: no user found for",
            { subscriptionId, customerId }
          );
        }
        break;
      }

      default:
        // ignore other events for now
        console.log("[stripe-webhook] Ignoring event type", event.type);
        break;
    }

    // mark event as processed (idempotency)
    await eventsRef.set({
      processedAt: Date.now(),
      type: event.type,
    });

    return res.json({ received: true });
  } catch (e: any) {
    console.error("Error handling Stripe webhook:", e);
    return res.status(500).send("Webhook internal error");
  }
}
