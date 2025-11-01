import { ProtectedRoute } from "@/components/common/protected-route";
import { GithubBrowser } from "./github-browser";
import { OwnershipGuard } from "@/components/common/ownership-guard";

export default async function ImportFromGitHub({
  params,
}: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  
  return (
    <ProtectedRoute>
      <div className="space-y-12 pb-12">
        {/* Header Section */}
        <section className="border-2 border-black dark:border-white p-6 md:p-10">
          <div className="space-y-4">
            <div className="inline-block border border-black dark:border-white px-2 py-1 text-xs font-mono">
              GITHUB INTEGRATION
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight">
              Link Component to GitHub
            </h1>
            <p className="text-xl md:text-2xl font-bold tracking-tight text-black/60 dark:text-white/60">
              {slug}
            </p>
            <p className="text-sm md:text-base max-w-2xl text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Connect your component to a GitHub repository for version control and automated imports. Browse your repos, navigate folders, and link to enable automatic updates.
            </p>
          </div>
        </section>

        {/* Info Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border-2 border-black dark:border-white p-6 transition-transform hover:scale-105 active:scale-95">
            <div className="text-3xl mb-3">🔍</div>
            <h3 className="text-lg font-bold mb-2">Browse Repos</h3>
            <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Search and select from your GitHub repositories
            </p>
          </div>
          <div className="border-2 border-black dark:border-white p-6 transition-transform hover:scale-105 active:scale-95">
            <div className="text-3xl mb-3">📁</div>
            <h3 className="text-lg font-bold mb-2">Navigate Folders</h3>
            <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Explore the repository structure to find your component
            </p>
          </div>
          <div className="border-2 border-black dark:border-white p-6 transition-transform hover:scale-105 active:scale-95">
            <div className="text-3xl mb-3">🔗</div>
            <h3 className="text-lg font-bold mb-2">Link & Sync</h3>
            <p className="text-sm text-black/60 dark:text-white/60 font-mono leading-relaxed">
              Connect the folder to enable version tracking
            </p>
          </div>
        </section>

        {/* Main Browser Component */}
        <section className="border-2 border-black dark:border-white p-6 md:p-8">
          <GithubBrowser slug={slug} />
        </section>
      </div>
    </ProtectedRoute>
  );
}
