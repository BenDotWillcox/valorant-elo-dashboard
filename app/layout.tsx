import { Providers } from "@/components/utilities/providers";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { NavHeader } from "@/components/nav-header";

const displayFont = Montserrat({ 
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: "Valorant ELO Dashboard",
  description: "Model-based analytics and retrospective evidence for professional Valorant."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={displayFont.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <NavHeader />
          <main>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
