"use client";

import Link from "next/link";
import * as Avatar from "@radix-ui/react-avatar";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/store";

export function Navbar() {
  const { user, token, clear } = useAuth();

  return (
    <header className="h-20 border-b border-black dark:border-white">
      <div className="h-full flex items-center justify-between">
        {/* Logo */}
        <Link 
          href="/" 
          className="text-xl sm:text-2xl font-bold font-mono tracking-tight hover:opacity-70 transition-opacity"
        >
          StoreHUB<span className="text-black/60 dark:text-white/60">X</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-3 sm:gap-6">
          {/* Browse Components */}
          <Link 
            href="/components" 
            className="text-xs sm:text-sm font-mono border border-black dark:border-white px-2 sm:px-3 py-1 transition-transform hover:scale-105 active:scale-95"
          >
            Browse
          </Link>

          {/* New Component (Authenticated Only) */}
          {token && (
            <Link 
              href="/components/new" 
              className="text-xs sm:text-sm font-mono border-2 border-black dark:border-white px-2 sm:px-3 py-1 transition-transform hover:scale-105 active:scale-95"
            >
              + New
            </Link>
          )}

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          {token && user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Profile Link */}
              <Link 
                href="/me" 
                className="flex items-center gap-2 border border-black dark:border-white px-2 sm:px-3 py-1 transition-transform hover:scale-105 active:scale-95"
              >
                <Avatar.Root className="w-5 h-5 sm:w-6 sm:h-6 border border-black dark:border-white overflow-hidden">
                  <Avatar.Image 
                    src={user.avatarUrl} 
                    alt={user.username || user.name} 
                    className="object-cover w-full h-full" 
                  />
                  <Avatar.Fallback className="bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center w-full h-full">
                    {user.username?.[0]?.toUpperCase() || user.name?.[0]?.toUpperCase() || 'U'}
                  </Avatar.Fallback>
                </Avatar.Root>
                <span className="hidden sm:inline text-xs font-mono">
                  {user.username || user.name?.split(' ')[0] || 'Profile'}
                </span>
              </Link>

              {/* GitHub Profile Link */}
              {user.username && (
                <a
                  href={`https://github.com/${user.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1 text-xs font-mono border border-black dark:border-white px-2 py-1 transition-transform hover:scale-105 active:scale-95"
                  title="View GitHub Profile"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                  <span className="hidden md:inline">GitHub</span>
                </a>
              )}

              {/* Logout */}
              <button 
                onClick={() => clear()} 
                className="text-xs font-mono text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition-colors px-2 py-1"
              >
                Logout
              </button>
            </div>
          ) : (
            <a
              href={`${process.env.NEXT_PUBLIC_API_BASE}/auth/github/login`}
              className="text-xs sm:text-sm font-mono border-2 border-black dark:border-white px-3 sm:px-4 py-1 sm:py-2 transition-transform hover:scale-105 active:scale-95"
            >
              Login
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}
