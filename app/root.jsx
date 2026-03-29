import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <ConvexProvider client={convex}>
          <Outlet />
        </ConvexProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

