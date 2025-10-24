"use client";

import { ProtectedRoute } from "@/components/common/protected-route";
import { useAuth } from "@/lib/store";
import { componentApi } from "@/lib/api";
import { useMutation } from "@/hooks/use-api";
import { parseFrameworks, parseTags, isValidComponentName } from "@/lib/api-utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentCreateRequest } from "@/types";

export default function NewComponent() {
  const router = useRouter();
  const token = useAuth((s) => s.token);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { mutate, loading, error, reset } = useMutation(
    (data: ComponentCreateRequest) => componentApi.create(data, token!)
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    reset();
    setFormErrors({});
    
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const frameworksInput = String(form.get("frameworks") || "");
    const tagsInput = String(form.get("tags") || "");
    const license = String(form.get("license") || "MIT").trim();

    // Client-side validation
    const errors: Record<string, string> = {};
    
    if (!name) {
      errors.name = "Name is required";
    } else if (!isValidComponentName(name)) {
      errors.name = "Use only alphanumeric characters, hyphens, and underscores (2-50 chars)";
    }
    
    const frameworks = parseFrameworks(frameworksInput);
    if (frameworks.length === 0) {
      errors.frameworks = "At least one framework is required";
    }
    
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const payload: ComponentCreateRequest = {
      name,
      description,
      frameworks,
      tags: parseTags(tagsInput),
      license,
    };

    const result = await mutate(payload);
    
    if (result) {
      router.push(`/components/${result.component.slug}`);
    }
  }

  return (
    <ProtectedRoute>
      <form onSubmit={onSubmit} className="max-w-xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Create New Component</h1>
          <p className="text-sm opacity-70 mt-1">Publish a new UI component to the registry</p>
        </div>
        
        {error && (
          <div className="p-3 border-2 border-red-500/50 bg-red-500/10 rounded-xl text-sm">
            <p className="text-red-600 dark:text-red-400 font-medium">⚠️ {error}</p>
          </div>
        )}
        
        <div>
          <input 
            name="name" 
            placeholder="Name" 
            className={`w-full border rounded-xl p-3 bg-transparent ${formErrors.name ? 'border-red-500' : ''}`}
            required 
          />
          {formErrors.name && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.name}</p>
          )}
        </div>
        
        <div>
          <textarea 
            name="description" 
            placeholder="Description" 
            className="w-full border rounded-xl p-3 bg-transparent" 
          />
        </div>
        
        <div>
          <input 
            name="frameworks" 
            placeholder="Frameworks (comma-separated, e.g., react, vue, svelte)" 
            className={`w-full border rounded-xl p-3 bg-transparent ${formErrors.frameworks ? 'border-red-500' : ''}`}
            required 
          />
          {formErrors.frameworks && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{formErrors.frameworks}</p>
          )}
          <p className="text-xs opacity-60 mt-1">Separate multiple frameworks with commas</p>
        </div>
        
        <div>
          <input 
            name="tags" 
            placeholder="Tags (comma-separated, e.g., ui, button, form)" 
            className="w-full border rounded-xl p-3 bg-transparent" 
          />
          <p className="text-xs opacity-60 mt-1">Optional: Add tags to help others discover your component</p>
        </div>
        
        <div>
          <input 
            name="license" 
            placeholder="License (e.g., MIT, Apache-2.0)" 
            className="w-full border rounded-xl p-3 bg-transparent" 
          />
        </div>
        
        <button 
          disabled={loading} 
          className="px-4 py-2 rounded-xl border disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating..." : "Create Component"}
        </button>
      </form>
    </ProtectedRoute>
  );
}
