import { redirect } from "next/navigation";

// The cross-county search UI now lives at the homepage instead - this stays
// as a redirect (rather than being deleted outright) so any existing link
// to this URL still lands somewhere real.
export default function SearchRedirect() {
  redirect("/");
}
