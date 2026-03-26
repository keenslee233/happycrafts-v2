import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session) {
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop });
    const shopSession = shopSessions[0];
    if (shopSession) {
        await convex.mutation(api.sessions.storeSession, {
            ...shopSession,
            scope: current.toString(),
        });
    }
  }

  return new Response();
};
