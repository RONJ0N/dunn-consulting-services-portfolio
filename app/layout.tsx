import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

const isProd = process.env.NODE_ENV === "production";

export const metadata: Metadata = isProd
  ? {
      title: "Dunn Consulting Services",
      description: "Chatbot platform host",
      robots: { index: false, follow: false },
    }
  : {
      title: "Iron Valley Fitness (local demo)",
      description:
        "Local dev demo gym — not shown in production. Marketing lives on dunnconsulting.org.",
    };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
