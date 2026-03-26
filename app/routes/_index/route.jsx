import { redirect, Form, useLoaderData } from "react-router";
import { login } from "../../shopify.server";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Welcome to Happycrafts</h1>
        <p className={styles.text}>
          Synchronize your inventory across stores and manage your marketplace with ease.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Inventory Sync</strong>. Automatically keep your retail and wholesale stores in sync.
          </li>
          <li>
            <strong>Master Catalog</strong>. Define your products once and push them to all connected stores.
          </li>
          <li>
            <strong>Order Forwarding</strong>. Seamlessly bridge retail orders to your wholesale fulfillment.
          </li>
        </ul>
      </div>
    </div>
  );
}
