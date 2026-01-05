import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({
    subsets: ["latin"],
    variable: "--font-fraunces",
});

const sourceSans = Source_Sans_3({
    subsets: ["latin"],
    variable: "--font-source",
});

export const metadata: Metadata = {
    title: "UDITO",
    description: "Fiscal receipts and audit export for Wix Stores.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
          <html lang="en" className={`${fraunces.variable} ${sourceSans.variable}`}>
                  <body>{children}</body>body>
          </html>html>
        );
}
</body>
