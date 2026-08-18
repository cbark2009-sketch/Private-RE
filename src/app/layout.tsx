import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ZipSearchBar } from "@/components/ZipSearchBar";
import { CountySelect } from "@/components/CountySelect";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auction Clarity — Florida Foreclosure Auctions, Plainly Explained",
  description:
    "Upcoming Florida foreclosure auction listings translated into plain English, with rough value estimates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border bg-gradient-to-r from-navy to-navy-light text-white">
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
            <a href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tracking-tight">
                Auction Clarity
              </span>
              <span className="hidden sm:inline text-sm text-white/60">
                Florida foreclosure auctions, plainly explained
              </span>
            </a>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span>Browse by county</span>
                <CountySelect />
              </div>
              <span className="text-xs text-white/40">or</span>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span>search a zip</span>
                <ZipSearchBar />
              </div>
              <a
                href="/auctions/search"
                className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                🔍 Search multiple counties
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 text-xs leading-relaxed text-muted">
            <p>
              <strong className="text-foreground">Not legal or financial advice.</strong>{" "}
              Case and judgment data comes from each county Clerk of Courts&rsquo;
              public auction calendar. &ldquo;Estimated Max Bid&rdquo; and &ldquo;Estimated
              Value&rdquo; figures are this tool&rsquo;s own rough calculations, not official
              data — always confirm against the linked case record and property appraiser
              page before relying on any number here. Only a subset of Florida counties are
              covered so far. This is a personal prototype, not a public product.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
