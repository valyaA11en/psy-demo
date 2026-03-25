import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@livekit/components-styles";
import { AuthProvider } from "@/components/auth-provider";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Консультации с психологом",
  description:
    "Спокойный и приватный flow записи на онлайн-консультации с психологом.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
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
