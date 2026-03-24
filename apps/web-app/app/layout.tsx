import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Consultations with a Psychologist",
  description:
    "Calm and privacy-oriented booking flow for online psychology consultations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <div className="site-shell">
            <SiteHeader />
            <main>{children}</main>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
