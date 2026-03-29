/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as importList from "../importList.js";
import type * as inventory from "../inventory.js";
import type * as migrations from "../migrations.js";
import type * as orders from "../orders.js";
import type * as pricing from "../pricing.js";
import type * as productMappings from "../productMappings.js";
import type * as sessions from "../sessions.js";
import type * as stores from "../stores.js";
import type * as syncLogs from "../syncLogs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  importList: typeof importList;
  inventory: typeof inventory;
  migrations: typeof migrations;
  orders: typeof orders;
  pricing: typeof pricing;
  productMappings: typeof productMappings;
  sessions: typeof sessions;
  stores: typeof stores;
  syncLogs: typeof syncLogs;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
