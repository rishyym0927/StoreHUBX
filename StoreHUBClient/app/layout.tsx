import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/common/theme-provider";
import { Navbar } from "@/components/common/navbar";

const inter = Inter({ subsets: ["latin"] });


export const metadata = {
  title: "StoreHUB",
  description: "Share and discover reusable web components",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en" className={inter.className}>
      <body suppressHydrationWarning className="min-h-screen bg-white dark:bg-[#0a0a0a] text-black dark:text-white antialiased selection:bg-blue-500/30">
        <ThemeProvider>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
            <Navbar />
            <main className="py-12 md:py-20 lg:py-24 animate-in fade-in duration-700">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
