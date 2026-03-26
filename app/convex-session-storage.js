import { Session } from "@shopify/shopify-api";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

export class ConvexSessionStorage {
  constructor() {
    this.client = new ConvexHttpClient(process.env.CONVEX_URL);
  }

  async storeSession(session) {
    const data = {
      id: session.id,
      shop: session.shop,
      state: session.state,
      isOnline: session.isOnline,
      scope: session.scope,
      expires: session.expires ? session.expires.getTime() : undefined,
      accessToken: session.accessToken,
      userId: session.onlineAccessInfo?.associated_user?.id ? String(session.onlineAccessInfo.associated_user.id) : undefined,
      firstName: session.onlineAccessInfo?.associated_user?.first_name,
      lastName: session.onlineAccessInfo?.associated_user?.last_name,
      email: session.onlineAccessInfo?.associated_user?.email,
      accountOwner: session.onlineAccessInfo?.associated_user?.account_owner || false,
      locale: session.onlineAccessInfo?.associated_user?.locale,
      collaborator: session.onlineAccessInfo?.associated_user?.collaborator,
      emailVerified: session.onlineAccessInfo?.associated_user?.email_verified,
    };

    await this.client.mutation(api.sessions.storeSession, data);
    return true;
  }

  async loadSession(id) {
    const sessionData = await this.client.query(api.sessions.loadSession, { id });
    if (!sessionData) return undefined;

    const session = new Session({
      id: sessionData.id,
      shop: sessionData.shop,
      state: sessionData.state,
      isOnline: sessionData.isOnline,
      scope: sessionData.scope,
      accessToken: sessionData.accessToken,
    });

    if (sessionData.expires) {
      session.expires = new Date(sessionData.expires);
    }

    if (sessionData.userId) {
      session.onlineAccessInfo = {
        associated_user: {
          id: Number(sessionData.userId),
          first_name: sessionData.firstName,
          last_name: sessionData.lastName,
          email: sessionData.email,
          accountOwner: sessionData.accountOwner,
          locale: sessionData.locale,
          collaborator: sessionData.collaborator,
          email_verified: sessionData.emailVerified,
        },
      };
    }

    return session;
  }

  async deleteSession(id) {
    await this.client.mutation(api.sessions.deleteSession, { id });
    return true;
  }

  async deleteSessions(ids) {
    await this.client.mutation(api.sessions.deleteSessions, { ids });
    return true;
  }

  async findSessionsByShop(shop) {
    const sessionsData = await this.client.query(api.sessions.findSessionsByShop, { shop });
    return sessionsData.map((sessionData) => {
      const session = new Session({
        id: sessionData.id,
        shop: sessionData.shop,
        state: sessionData.state,
        isOnline: sessionData.isOnline,
        scope: sessionData.scope,
        accessToken: sessionData.accessToken,
      });
      if (sessionData.expires) {
        session.expires = new Date(sessionData.expires);
      }
      return session;
    });
  }
}
