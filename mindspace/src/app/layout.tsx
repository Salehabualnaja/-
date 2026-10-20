import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const tajawal = localFont({
  src: [
    { path: "./fonts/tajawal-regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/tajawal-bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-tajawal",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MINDSPACE",
  description: "منصة للتفكير وإدارة المعرفة: كيانات وعلاقات ولوحات وتحليلات",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

// Applies the saved theme before first paint (no flash).
const themeScript = `try{var t=localStorage.getItem('mindspace:theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={tajawal.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
