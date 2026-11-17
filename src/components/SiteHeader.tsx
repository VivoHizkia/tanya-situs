import Link from "next/link";
import { logoutAction } from "@/app/actions";

// `email` is set on pages for a signed-in owner.
export function SiteHeader({ email }: { email?: string }) {
  return (
    <header className="site-header">
      <Link className="brand" href={email ? "/dashboard" : "/"}>
        tanya<span>situs</span>
      </Link>
      {email ? (
        <form action={logoutAction} className="site-header__account">
          <span>{email}</span>
          <button type="submit" className="button button--quiet">
            Log out
          </button>
        </form>
      ) : (
        <nav className="site-header__nav" aria-label="Account">
          <Link href="/login">Log in</Link>
          <Link className="button" href="/signup">
            Start free
          </Link>
        </nav>
      )}
    </header>
  );
}
