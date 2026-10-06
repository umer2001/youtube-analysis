import {
  Refine,
  Authenticated,
} from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import { liveProvider } from "@refinedev/supabase";
import { BrowserRouter, Route, Routes, Outlet } from "react-router";
import routerProvider, {
  NavigateToResource,
  CatchAllNavigate,
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import { Tv, Radio, TrendingUp } from "lucide-react";

import {
  ChannelList,
  ChannelCreate,
  ChannelEdit,
  ChannelShow,
} from "./pages/channels";
import {
  StreamList,
  StreamShow,
} from "./pages/streams";
import {
  TradeList,
} from "./pages/trades";
import { supabaseClient } from "./providers/supabase-client";
import { dataProvider } from "./providers/data";
import { Login } from "./pages/login";
import { Register } from "./pages/register";
import { ForgotPassword } from "./pages/forgot-password";
import { ErrorComponent } from "./components/refine-ui/layout/error-component";
import { Layout } from "./components/refine-ui/layout/layout";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import "./App.css";
import authProvider from "./providers/auth";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ThemeProvider>
          <DevtoolsProvider>
            <Refine
              dataProvider={dataProvider}
              liveProvider={liveProvider(supabaseClient)}
              authProvider={authProvider}
              routerProvider={routerProvider}
              notificationProvider={useNotificationProvider()}
              resources={[
                {
                  name: "channels",
                  list: "/channels",
                  create: "/channels/create",
                  edit: "/channels/edit/:id",
                  show: "/channels/show/:id",
                  meta: {
                    canDelete: true,
                    label: "Channels",
                    icon: <Tv className="w-4 h-4" />,
                  },
                },
                {
                  name: "streams",
                  list: "/streams",
                  show: "/streams/show/:id",
                  meta: {
                    label: "Livestreams",
                    icon: <Radio className="w-4 h-4" />,
                  },
                },
                {
                  name: "trades",
                  list: "/trades",
                  meta: {
                    label: "Extracted Trades",
                    icon: <TrendingUp className="w-4 h-4" />,
                  },
                },
              ]}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                title: {
                  text: "TradeStream AI",
                  icon: <Radio className="w-5 h-5 text-red-500 animate-pulse" />,
                },
              }}
            >
              <Routes>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-inner"
                      fallback={<CatchAllNavigate to="/login" />}
                    >
                      <Layout>
                        <Outlet />
                      </Layout>
                    </Authenticated>
                  }
                >
                  <Route
                    index
                    element={<NavigateToResource resource="channels" />}
                  />
                  <Route path="/channels">
                    <Route index element={<ChannelList />} />
                    <Route path="create" element={<ChannelCreate />} />
                    <Route path="edit/:id" element={<ChannelEdit />} />
                    <Route path="show/:id" element={<ChannelShow />} />
                  </Route>
                  <Route path="/streams">
                    <Route index element={<StreamList />} />
                    <Route path="show/:id" element={<StreamShow />} />
                  </Route>
                  <Route path="/trades">
                    <Route index element={<TradeList />} />
                  </Route>
                  <Route path="*" element={<ErrorComponent />} />
                </Route>
                <Route
                  element={
                    <Authenticated
                      key="authenticated-outer"
                      fallback={<Outlet />}
                    >
                      <NavigateToResource />
                    </Authenticated>
                  }
                >
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                </Route>
              </Routes>

              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
            <DevtoolsPanel />
          </DevtoolsProvider>
        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
