"use client";
import React, { useState } from 'react';
import { useSearchParams } from 'next/navigation';

function BrokenComponent(): React.ReactNode {
  throw new Error('Intentional client-side test error');
}

export default function TestErrorPage() {
  const searchParams = useSearchParams();
  const [triggerClientError, setTriggerClientError] = useState(
    searchParams.get('trigger') === 'client'
  );
  const [serverResult, setServerResult] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);

  if (triggerClientError) {
    return <BrokenComponent />;
  }

  async function invokeServerError() {
    setServerLoading(true);
    setServerResult(null);
    try {
      const res = await fetch('/api/test-error');
      const text = await res.text();
      setServerResult(`Status ${res.status}: ${text}`);
    } catch (err) {
      setServerResult(`Fetch error: ${String(err)}`);
    } finally {
      setServerLoading(false);
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-2xl font-semibold">Error Boundary Test Page</h1>
      <p className="text-gray-500 text-sm max-w-md text-center">
        Use these buttons to verify that the ErrorBoundary and PostHog error monitoring are correctly
        configured. Check your PostHog dashboard for captured exceptions after triggering an error.
      </p>

      <button
        className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
        onClick={() => setTriggerClientError(true)}
      >
        Generate client-side error
      </button>

      <button
        className="px-6 py-3 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium"
        onClick={invokeServerError}
        disabled={serverLoading}
      >
        {serverLoading ? 'Invoking…' : 'Invoke server-side error endpoint'}
      </button>

      {serverResult && (
        <pre className="mt-4 p-4 bg-gray-800 text-gray-200 rounded text-sm max-w-xl overflow-auto">
          {serverResult}
        </pre>
      )}
    </main>
  );
}
