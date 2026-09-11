'use client';

import React, { useEffect } from 'react';
import { AlertOctagon, RefreshCw, Home as HomeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Next.js Page Error caught by root error boundary:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-rose-500/30 bg-slate-900/90 shadow-2xl">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <div>
              <CardTitle className="text-lg text-rose-300">System Operational Boundary Exception</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                An unhandled error occurred during page rendering or client state execution.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs font-mono space-y-1">
            <div className="text-slate-500">DIGEST CODE</div>
            <div className="text-rose-400 font-semibold">{error.digest || 'ERR_RUNTIME_EXCEPTION'}</div>
            {error.message && (
              <div className="text-slate-400 pt-1 text-[11px] truncate">
                {error.message}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => reset()}
              className="bg-rose-600 hover:bg-rose-500 text-white text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Recover View
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = '/')}
              className="border-slate-800 text-slate-300 text-xs"
            >
              <HomeIcon className="w-3.5 h-3.5 mr-1.5" /> Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
