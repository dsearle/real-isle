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
    title: "Real Isle — See the evidence",
    description:
      "Explore every constituency, compare candidate positions and follow the original sources behind the 2026 House of Keys election.",
    type: "website",
    locale: "en_GB",
    siteName: "Real Isle",
    images: [
      {
        url: "/og.png",
        width: 1536,
        height: 1024,
        alt: "Real Isle — See the Island. See the evidence.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Real Isle — See the evidence",
    description: "Independent, source-linked intelligence for the 2026 House of Keys election.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
