import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Delete sessions for this shop in Convex
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop });
    for (const s of shopSessions) {
        await convex.mutation(api.sessions.deleteSession, { id: s._id });
    }
  }

  return new Response();
};
