import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MOTECHWA & Sayyidina Omar Institute — Voice Assistant",
  description:
    "Shared-line AI voice receptionist for MOTECHWA and the Sayyidina Omar Institute.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen font-sans text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
