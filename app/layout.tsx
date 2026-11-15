import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { clerkModalAppearance } from "@/lib/clerk-modal-appearance";

export const metadata: Metadata = {
  title: "Luma Studio",
  description: "AI image generation studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        <ClerkProvider appearance={clerkModalAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
