import "./globals.css";
import { ThemeProvider } from "@/components/common/theme-provider";
import { Navbar } from "@/components/common/navbar";

export const metadata = {
  title: "StoreHUB",
  description: "Share and discover reusable web components",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang="en">
      <body suppressHydrationWarning className="min-h-screen bg-white dark:bg-black text-black dark:text-white">
        <ThemeProvider>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Navbar />
            <main className="py-6">{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
