import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";
import { currentAccount } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await currentAccount()) redirect("/dashboard");
  return (
    <>
      <SiteHeader />
      <main className="narrow">
        <AuthForm mode="signup" />
      </main>
    </>
  );
}
