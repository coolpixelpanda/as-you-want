import type { Metadata } from "next";
import { Geist, Newsreader } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { NoticeProvider } from "@/components/NoticeProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "JobLink — Apply from a URL",
  description: "Set up your profile once, paste a job link, and apply automatically.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper text-ink">
        <NoticeProvider>
          <AppShell>{children}</AppShell>
        </NoticeProvider>
      </body>
    </html>
  );
}
