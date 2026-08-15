import { authLogic } from "@/lib/logics/authLogic";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BindLogic } from "kea";

const RootLayout = () => (
  <BindLogic logic={authLogic} props={{}}>
    <Outlet />
  </BindLogic>
);

export const Route = createRootRoute({ component: RootLayout });
