import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-black uppercase tracking-tight mb-4">404</h1>
        <h2 className="text-xl font-bold uppercase tracking-tight mb-2">
          Page Not Found
        </h2>
        <p className="font-mono text-sm text-black/60 dark:text-white/60 mb-8">
          The page you&apos;re looking for doesn&apos;t exist or was moved.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-block border-2 border-black dark:border-white bg-black dark:bg-white text-white dark:text-black px-6 py-3 text-sm font-mono font-bold uppercase transition-transform hover:scale-105 active:scale-95"
          >
            Home
          </Link>
          <Link
            href="/components"
            className="inline-block border-2 border-black dark:border-white px-6 py-3 text-sm font-mono font-bold uppercase transition-transform hover:scale-105 active:scale-95"
          >
            Browse Components
          </Link>
        </div>
      </div>
    </div>
  );
}
