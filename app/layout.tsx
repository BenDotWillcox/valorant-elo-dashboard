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
  description: "The best culmination of predictive models for professional Valorant."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body className="min-h-screen bg-[#1a1a1a]">
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
