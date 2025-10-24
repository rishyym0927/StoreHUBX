"use client";
export default function Error({ error }: { error: Error }) {
  return (
    <div className="p-4 border rounded-xl text-red-500">
      Couldn’t open version form. {error.message}
    </div>
  );
}
