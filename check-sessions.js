import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  const sessions = await client.query(api.sessions.findSessionsByRole, { role: 'WHOLESALE' });
  console.log("Wholesale Sessions:");
  sessions.forEach(s => {
    console.log(`Shop: ${s.shop} | Session ID: ${s.id} | Scopes: ${s.scope}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
