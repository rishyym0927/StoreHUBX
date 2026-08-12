import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/common/theme-provider";
import { Navbar } from "@/components/common/navbar";
import { PageTransition } from "@/components/common/page-transition";
import { ToastProvider } from "@/components/common/toast";
import { ScrollToTop } from "@/components/common/scroll-to-top";

const inter = Inter({ subsets: ["latin"] });


export const metadata = {
  title: "StoreHUB",
  description: "Share and discover reusable web components",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en" className={inter.className}>
      <body suppressHydrationWarning className="min-h-screen bg-page dark:bg-[#0a0a0a] text-black dark:text-white antialiased">
        <ThemeProvider>
          <ToastProvider>
            <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12">
              <Navbar />
              <main className="py-6 md:py-6 lg:py-6">
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
            <ScrollToTop />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
