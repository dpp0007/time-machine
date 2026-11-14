import "./globals.css";
import Link from "next/link";

export const metadata = { title: "Time Machine: version history for the web", description: "Every change to the pages that matter, with a screenshot for each version. Built on TinyFish Monitor." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="in">
            <Link href="/" className="brand"><span className="logo" />Time Machine</Link>
            <span className="muted sm">Version history for the web, powered by TinyFish Monitor</span>
            <span className="live"><span className="dot" />Watching hourly</span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
