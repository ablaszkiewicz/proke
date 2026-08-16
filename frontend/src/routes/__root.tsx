import { ConfirmProvider } from "@/components/ui/ConfirmDialog";
import { authLogic } from "@/lib/logics/authLogic";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { BindLogic } from "kea";

// ConfirmProvider sits at the root so anything on any route can ask before doing something
// irreversible, without mounting a dialog of its own. Nothing in proke uses window.confirm.
const RootLayout = () => (
  <BindLogic logic={authLogic} props={{}}>
    <ConfirmProvider>
      <Outlet />
    </ConfirmProvider>
  </BindLogic>
);

export const Route = createRootRoute({ component: RootLayout });
