import { mutation } from "./_generated/server";

export const backfillQuantity = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("inventory").collect();
    let count = 0;
    for (const item of all) {
      if (item.quantity === undefined || item.quantity === null) {
        await ctx.db.patch(item._id, {
          quantity: item.stockLevel || 0
        });
        count++;
      }
    }
    return { count };
  },
});
