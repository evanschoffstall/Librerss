import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface LoginCardHeaderProps {
  mode: "login" | "signup";
}

/**
 * Render the login card header component.
 * @param props - The component props.
 * @returns The rendered login card header component.
 */
export function LoginCardHeader(props: LoginCardHeaderProps) {
  const { mode } = props;
  return (
    <CardHeader className="items-center pb-2 text-center">
      <div className="relative mb-3 flex size-14 items-center justify-center">
        <div
          aria-hidden="true"
          className="absolute size-18 rounded-2xl border border-border/20"
        />
        <div
          className="
            relative flex size-14 items-center justify-center rounded-2xl border
            border-border/50 bg-card/70 shadow-md backdrop-blur-sm
          "
        >
          <img alt="LibreRSS" className="size-6" src="/favicon.svg" />
        </div>
      </div>
      <CardTitle>
        {mode === "signup" ? "Create your account" : "Sign in to LibreRSS"}
      </CardTitle>
      <CardDescription>
        {mode === "signup"
          ? "Create an account to save your feeds and preferences."
          : "Access your saved feeds and reading preferences."}
      </CardDescription>
    </CardHeader>
  );
}
