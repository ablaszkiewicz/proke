import { Dashboard } from "@/components/dashboard/Dashboard";
import { ProkeLogo } from "@/components/ui/ProkeLogo";
import { authLogic } from "@/lib/logics/authLogic";
import { Link } from "@tanstack/react-router";
import { useValues } from "kea";
import { GithubLoginButton } from "../auth/GithubLoginButton";

export function HomePage() {
  const { isLoggedIn, loginError } = useValues(authLogic);

  if (isLoggedIn) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 p-8">
      <header className="flex flex-col items-center gap-4 text-center">
        <ProkeLogo size={56} />
        <h1 className="text-4xl font-semibold tracking-tight">proke</h1>
        <p className="text-muted-foreground">
          <span className="text-foreground">PR</span> +{" "}
          <span className="text-foreground">Poke</span>
        </p>
      </header>

      <section className="max-w-md text-center space-y-3">
        <p className="text-lg text-foreground">
          GitHub notifications that actually reach you.
        </p>
        <p className="text-sm text-muted-foreground">
          proke watches your pull requests and pokes you where you already are.
          Slack for now — other platforms later.
        </p>
      </section>

      <section className="w-full max-w-xs space-y-3">
        <GithubLoginButton />
        <p className="text-center text-[10px] text-muted-foreground/60">
          By continuing, you agree to our
          <br />
          Terms of Service
        </p>

        {loginError ? (
          <p className="text-center text-xs text-destructive">{loginError}</p>
        ) : null}
      </section>

      <footer className="text-xs text-muted-foreground/50">
        Mock home page — here to exercise the GitHub login flow.{" "}
        <Link
          to="/drafts"
          search={{ d: 1 }}
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          Dashboard drafts
        </Link>
      </footer>
    </div>
  );
}
