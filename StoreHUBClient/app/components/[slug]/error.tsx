"use client";
export default function Error({ error }: { error: Error }) {
  return (
    <div className="p-4 border rounded-xl text-red-500">
      Failed to load component. {error.message}
    </div>
  );
}
