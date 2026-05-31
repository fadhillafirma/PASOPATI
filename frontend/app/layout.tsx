import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistem Evakuasi Bencana – Kota Padang",
  description:
    "Optimasi rute evakuasi bencana menggunakan 4-Layer K-Means, Dijkstra, dan Algoritma Genetika.",
};

import { Poppins } from "next/font/google";

const poppins = Poppins({ 
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins"
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          crossOrigin=""
        />
      </head>
      <body className={poppins.variable}>{children}</body>
    </html>
  );
}
