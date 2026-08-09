import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://realisle.im"),
  title: {
    default: "The People’s Isle — Evidence for the 2026 House of Keys election",
    template: "%s · The People’s Isle",
  },
  description:
    "An independent, evidence-led guide to Isle of Man constituencies, candidates, issues and election reporting.",
  openGraph: {
    title: "The People’s Isle — Your Isle, Your Future",
    description:
      "Explore every constituency, compare candidate positions and follow the original sources behind the 2026 House of Keys election.",
    type: "website",
    locale: "en_GB",
    siteName: "The People’s Isle",
    images: [
      {
        url: "/og-peoples-isle.png",
        width: 1536,
        height: 1024,
        alt: "The People’s Isle — Your Isle, Your Future",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "The People’s Isle — Your Isle, Your Future",
    description: "Independent, source-linked intelligence for the 2026 House of Keys election.",
    images: ["/og-peoples-isle.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
