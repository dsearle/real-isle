import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://realisle.im"),
  title: {
    default: "Real Isle — Evidence for the 2026 House of Keys election",
    template: "%s · Real Isle",
  },
  description:
    "An independent, evidence-led guide to Isle of Man constituencies, candidates, issues and election reporting.",
  openGraph: {
    title: "Real Isle — Your Isle, Your Future",
    description:
      "Explore every constituency, compare candidate positions and follow the original sources behind the 2026 House of Keys election.",
    type: "website",
    locale: "en_GB",
    siteName: "Real Isle",
    images: [
      {
        url: "/og-v3.png",
        width: 1536,
        height: 1024,
        alt: "Real Isle — Your Isle, Your Future",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Real Isle — Your Isle, Your Future",
    description: "Independent, source-linked intelligence for the 2026 House of Keys election.",
    images: ["/og-v3.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
