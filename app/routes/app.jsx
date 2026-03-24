import { Outlet, useLoaderData, useRouteError, NavLink } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { AppProvider as PolarisAppProvider, Text, Button, Badge } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const shopSession = await db.session.findUnique({
    where: { id: session.id },
  });

  const syncedCount = await db.productMapping.count({
    where: { retailShop: session.shop }
  });

  const totalCount = await db.inventory.count();

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    role: shopSession?.role,
    shop: session.shop,
    syncedCount,
    totalCount
  };
};

export default function App() {
  const { apiKey, role, shop, syncedCount, totalCount } = useLoaderData();
  const syncProgress = totalCount > 0 ? (syncedCount / totalCount) * 100 : 0;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={translations}>
        <div style={{ display: 'flex', height: '100vh', background: '#f4f6f8', fontFamily: 'Inter, system-ui, sans-serif' }}>
          <style>{`
            .sidebar-item {
              display: flex;
              align-items: center;
              gap: 12px;
              padding: 12px 24px;
              color: #454f5b;
              text-decoration: none;
              cursor: pointer;
              transition: all 0.2s ease;
              border-left: 4px solid transparent;
              font-weight: 500;
            }
            .sidebar-item:hover {
              background: #f1f2f4;
            }
            .sidebar-item.active {
              background: linear-gradient(90deg, #fff5f6 0%, #fff 100%);
              color: #ff4d4d;
              border-left-color: #ff4d4d;
              font-weight: 700;
            }
            .progress-container {
              padding: 24px;
              margin-top: auto;
              background: #fff;
              border-top: 1px solid #e1e3e5;
            }
            .progress-bar {
              height: 8px;
              background: #e1e3e5;
              border-radius: 4px;
              overflow: hidden;
              margin-top: 8px;
            }
            .progress-fill {
              height: 100%;
              background: linear-gradient(90deg, #ff4d4d 0%, #ff8080 100%);
              transition: width 0.3s ease;
            }
            .main-content {
              flex: 1;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }
            .app-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 16px 32px;
              background: #fff;
              border-bottom: 1px solid #e1e3e5;
            }
            .role-badge {
              display: flex;
              background: #f1f2f4;
              border-radius: 20px;
              padding: 4px 4px;
            }
            .role-toggle {
              padding: 4px 12px;
              border-radius: 16px;
              font-size: 12px;
              font-weight: 600;
              transition: all 0.2s ease;
            }
            .role-toggle.active {
              background: #008060;
              color: #fff;
            }
            .role-toggle.active.destination {
              background: #ff4d4d;
            }
          `}</style>

          {/* SIDEBAR */}
          <aside style={{ width: '260px', background: '#fff', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e1e3e5' }}>
            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', background: '#ff4d4d', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '20px' }}>⚡</div>
              <Text variant="headingMd" as="h2">Happycrafts</Text>
            </div>

            <nav>
              <NavLink to="/app/dashboard" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <Text variant="bodyMd">▦ Dashboard</Text>
              </NavLink>
              <NavLink to="/app/marketplace" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <Text variant="bodyMd">🛍 Marketplace</Text>
              </NavLink>
              {role === "WHOLESALE" && (
                <NavLink to="/app/master-catalog" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                  <Text variant="bodyMd">📦 Master Catalog</Text>
                </NavLink>
              )}
              <NavLink to="/app" end className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <Text variant="bodyMd">🌐 Stores</Text>
              </NavLink>
              <NavLink to="/app/products" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <Text variant="bodyMd">≡ Products</Text>
              </NavLink>
              <NavLink to="/app/settings" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}><Text variant="bodyMd">⚙ Settings</Text></NavLink>
            </nav>

            <div className="progress-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Text variant="bodySm" fontWeight="bold">PRODUCTS SYNCED</Text>
                <Text variant="bodySm">{syncedCount}/{totalCount}</Text>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${syncProgress}%` }}></div>
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="main-content">
            <header className="app-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <Button icon={() => <span>←</span>} variant="tertiary" />
                <Text variant="headingLg" as="h1">Happycrafts V2</Text>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <Text variant="bodyMd" tone="subdued">{shop}</Text>
                <div className="role-badge">
                  <div className={`role-toggle ${role === 'WHOLESALE' ? 'active' : ''}`}>Source</div>
                  <div className={`role-toggle ${role === 'RETAIL' ? 'active destination' : ''}`}>Destination</div>
                </div>
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f1f2f4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <Outlet />
            </div>
          </main>
        </div>
      </PolarisAppProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
