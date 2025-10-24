import { ProtectedRoute } from "@/components/common/protected-route";
import { GithubBrowser } from "./github-browser";

export default async function ImportFromGitHub({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-white dark:bg-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          {/* Header */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-sm font-mono font-semibold text-blue-700 dark:text-blue-300 mb-4">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              GitHub Integration
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold mb-3 bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              Link Component to GitHub
            </h1>
            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Connect your component <span className="font-semibold text-blue-600 dark:text-blue-400">{slug}</span> to a GitHub repository for version control and automated imports.
            </p>
          </div>

          {/* Info cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-10">
            <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <span className="text-xl">🔍</span>
                </div>
                <h3 className="font-semibold text-base">Browse Repos</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Search and select from your GitHub repositories
              </p>
            </div>
            <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <span className="text-xl">📁</span>
                </div>
                <h3 className="font-semibold text-base">Navigate Folders</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Explore the repository structure to find your component
              </p>
            </div>
            <div className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="text-xl">🔗</span>
                </div>
                <h3 className="font-semibold text-base">Link & Sync</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connect the folder to enable version tracking
              </p>
            </div>
          </div>

          {/* Main component */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8">
            <GithubBrowser slug={slug} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
