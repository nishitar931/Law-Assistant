import Image from "next/image";
import AuthForm from "../components/AuthForm";

export const metadata = {
  title: "Sign in · Legal Assistant",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-page">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-panel)] text-xs">
            <Image src="/next.svg" alt="" width={14} height={14} className="dark:invert" aria-hidden />
            Legal Assistant
          </div>
          <h1 className="mt-4 font-black tracking-[-0.02em]">Welcome back</h1>
          <p className="mt-2 text-[15px] text-[color:var(--color-muted)]">
            Sign in to continue your conversations or discover new lawyers.
          </p>
        </div>

        <div className="mt-8 mx-auto max-w-2xl surface p-6">
          <AuthForm variant="login" />
        </div>

        <p className="mt-6 text-center text-xs text-[color:var(--color-muted)]">
          By signing in you agree to our Terms and acknowledge the Privacy Policy.
        </p>
      </div>
    </div>
  );
}
