"use client";

import Link from "next/link";
import * as Avatar from "@radix-ui/react-avatar";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "@/lib/store";

export function Navbar() {
  const { user, token, clear } = useAuth();

  return (
    <header className="border-b-2 border-black dark:border-white">
      <div className="h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link 
          href="/" 
          className="text-xl sm:text-2xl font-bold tracking-tight hover:opacity-70 transition-opacity shrink-0"
        >
          StoreHUB<span className="text-black/40 dark:text-white/40">X</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-2 sm:gap-3">
          {/* Browse Components */}
          <Link 
            href="/components" 
            className="text-xs sm:text-sm font-mono border-2 border-black dark:border-white px-3 py-1.5 transition-transform hover:scale-105 active:scale-95"
          >
            Browse
          </Link>

          {/* New Component (Authenticated Only) */}
          {token && (
            <Link 
              href="/components/new" 
              className="text-xs sm:text-sm font-mono border-2 border-black dark:border-white px-3 py-1.5 bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95"
            >
              + New
            </Link>
          )}

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-black dark:bg-white opacity-30"></div>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Menu */}
          {token && user ? (
            <>
              {/* Divider */}
              <div className="hidden sm:block w-px h-6 bg-black dark:bg-white opacity-30"></div>
              
              <div className="flex items-center gap-2">
                {/* Profile Link with Avatar */}
                <Link 
                  href="/me" 
                  className="flex items-center gap-2 border-2 border-black dark:border-white px-2 py-1 transition-transform hover:scale-105 active:scale-95"
                  title={user.username || user.name || 'Profile'}
                >
                  <Avatar.Root className="w-5 h-5 sm:w-6 sm:h-6 border border-black dark:border-white overflow-hidden bg-black dark:bg-white">
                    <Avatar.Image 
                      src={user.avatarUrl} 
                      alt={user.username || user.name || 'User'} 
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

                {/* Logout */}
                <button 
                  onClick={() => clear()} 
                  className="hidden sm:block text-xs font-mono border-2 border-black dark:border-white px-3 py-1.5 text-black/70 dark:text-white/70 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                  title="Sign out"
                >
                  Logout
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Divider */}
              <div className="hidden sm:block w-px h-6 bg-black dark:bg-white opacity-30"></div>
              
              <a
                href={`${process.env.NEXT_PUBLIC_API_BASE}/auth/github/login`}
                className="text-xs sm:text-sm font-mono border-2 border-black dark:border-white px-3 sm:px-4 py-1.5 bg-black text-white dark:bg-white dark:text-black transition-transform hover:scale-105 active:scale-95 inline-flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span className="hidden sm:inline">Login</span>
              </a>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
