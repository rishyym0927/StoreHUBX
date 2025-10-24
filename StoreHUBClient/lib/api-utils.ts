import type { BuildState, BuildStatus } from "@/types";

// ========================================
// Validation Helpers
// ========================================

/**
 * Validate semantic version format (e.g., 1.0.0, 2.3.1-beta)
 */
export function isValidVersion(version: string): boolean {
  const semverRegex = /^\d+\.\d+\.\d+(-[a-z0-9.]+)?$/i;
  return semverRegex.test(version);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate component name (alphanumeric, hyphens, underscores)
 */
export function isValidComponentName(name: string): boolean {
  const nameRegex = /^[a-zA-Z0-9_-]{2,50}$/;
  return nameRegex.test(name);
}

/**
 * Validate tag format (lowercase alphanumeric with hyphens)
 */
export function isValidTag(tag: string): boolean {
  const tagRegex = /^[a-z0-9-]{2,30}$/;
  return tagRegex.test(tag);
}

// ========================================
// Formatting Helpers
// ========================================

/**
 * Format date to human-readable string
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Format date with time
 */
export function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
  } catch {
    return "—";
  }
}

/**
 * Format file size to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ========================================
// Build Status Helpers
// ========================================

/**
 * Get human-readable build status label
 */
export function getBuildStatusLabel(status: BuildStatus): string {
  const labels: Record<BuildStatus, string> = {
    queued: "Queued",
    running: "Building",
    success: "Success",
    error: "Failed",
  };
  return labels[status] || status;
}

/**
 * Get build status color class
 */
export function getBuildStatusColor(status: BuildStatus): string {
  const colors: Record<BuildStatus, string> = {
    queued: "text-yellow-600 dark:text-yellow-400",
    running: "text-blue-600 dark:text-blue-400",
    success: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
  };
  return colors[status] || "text-gray-600 dark:text-gray-400";
}

/**
 * Get build status background color class
 */
export function getBuildStatusBgColor(status: BuildStatus): string {
  const colors: Record<BuildStatus, string> = {
    queued: "bg-yellow-100 dark:bg-yellow-900/30",
    running: "bg-blue-100 dark:bg-blue-900/30",
    success: "bg-green-100 dark:bg-green-900/30",
    error: "bg-red-100 dark:bg-red-900/30",
  };
  return colors[status] || "bg-gray-100 dark:bg-gray-900/30";
}

/**
 * Check if build is still in progress
 */
export function isBuildPending(status: BuildStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * Get human-readable version build state label
 */
export function getVersionBuildStateLabel(state: BuildState): string {
  const labels: Record<BuildState, string> = {
    none: "Not built",
    queued: "Build queued",
    running: "Building",
    ready: "Ready",
    error: "Build failed",
  };
  return labels[state] || state;
}

/**
 * Get version build state color
 */
export function getVersionBuildStateColor(state: BuildState): string {
  const colors: Record<BuildState, string> = {
    none: "text-gray-500 dark:text-gray-400",
    queued: "text-yellow-600 dark:text-yellow-400",
    running: "text-blue-600 dark:text-blue-400",
    ready: "text-green-600 dark:text-green-400",
    error: "text-red-600 dark:text-red-400",
  };
  return colors[state] || "text-gray-600 dark:text-gray-400";
}

// ========================================
// String Helpers
// ========================================

/**
 * Truncate text to max length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Generate slug from text (lowercase, hyphenated)
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse comma-separated tags and clean them
 */
export function parseTags(input: string): string[] {
  return input
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0 && isValidTag(tag));
}

/**
 * Parse comma-separated frameworks and clean them
 */
export function parseFrameworks(input: string): string[] {
  return input
    .split(",")
    .map((fw) => fw.trim().toLowerCase())
    .filter((fw) => fw.length > 0);
}

/**
 * Highlight search terms in text
 */
export function highlightText(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

// ========================================
// Array Helpers
// ========================================

/**
 * Remove duplicates from array based on key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter((item) => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Sort array by date field (newest first)
 */
export function sortByDate<T>(
  array: T[],
  dateField: keyof T,
  ascending = false
): T[] {
  return [...array].sort((a, b) => {
    const dateA = new Date(a[dateField] as any).getTime();
    const dateB = new Date(b[dateField] as any).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });
}

// ========================================
// Preview Helpers
// ========================================

/**
 * Get the preview redirect URL for a component version
 * This uses the backend redirect endpoint which handles the actual preview URL
 */
export function getPreviewRedirectUrl(slug: string, version: string): string {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";
  return `${API_BASE}/preview/${slug}/${version}`;
}

// ========================================
// GitHub Helpers
// ========================================

/**
 * Extract owner and repo from GitHub URL
 */
export function parseGitHubUrl(url: string): {
  owner: string;
  repo: string;
} | null {
  try {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ""),
    };
  } catch {
    return null;
  }
}

/**
 * Build GitHub file URL
 */
export function buildGitHubFileUrl(
  owner: string,
  repo: string,
  path: string,
  ref = "main"
): string {
  return `https://github.com/${owner}/${repo}/blob/${ref}/${path}`;
}

/**
 * Build GitHub tree URL
 */
export function buildGitHubTreeUrl(
  owner: string,
  repo: string,
  path?: string,
  ref = "main"
): string {
  const base = `https://github.com/${owner}/${repo}/tree/${ref}`;
  return path ? `${base}/${path}` : base;
}

// ========================================
// Error Helpers
// ========================================

/**
 * Extract user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred";
}

/**
 * Check if error is network-related
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("fetch") ||
    error.message.includes("network") ||
    error.message.includes("Network")
  );
}

/**
 * Check if error is authentication-related
 */
export function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("401") ||
    error.message.includes("403") ||
    error.message.includes("Unauthorized") ||
    error.message.includes("Forbidden")
  );
}

// ========================================
// Local Storage Helpers
// ========================================

/**
 * Safe localStorage getter with fallback
 */
export function getLocalStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Safe localStorage setter
 */
export function setLocalStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Failed to save to localStorage:", error);
  }
}

/**
 * Remove item from localStorage
 */
export function removeLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to remove from localStorage:", error);
  }
}

// ========================================
// Copy to Clipboard
// ========================================

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

// ========================================
// Debounce
// ========================================

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
