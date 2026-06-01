import type { Metadata } from "next";
import { Analytics } from "@/components/Analytics";
import { FailoverBootstrap } from "@/components/FailoverBootstrap";
import "./globals.css";

export const metadata: Metadata = {
  title: "المنزّل — تحميل فيديو وصوت وصور",
  description:
    "المنزّل — حمّل الفيديو والصوت والصور من يوتيوب وتيك توك وإنستغرام وأكثر من 1000 منصة بجودات متعددة.",
  applicationName: "المنزّل",
  appleWebApp: {
    title: "المنزّل",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="h-full overflow-hidden">
      <body className="h-full overflow-hidden">
        <FailoverBootstrap />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
