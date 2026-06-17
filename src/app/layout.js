import "./globals.css";
import "primeicons/primeicons.css";
import Provider from "@/redux/Provider";
import "primereact/resources/primereact.min.css";
import { Geist, Geist_Mono } from "next/font/google";
import "primereact/resources/themes/lara-dark-blue/theme.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Broken Link Checker",
  description: "Scan websites for broken links in real-time",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
