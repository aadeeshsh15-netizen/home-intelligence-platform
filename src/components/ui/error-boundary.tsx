'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Card, CardHeader, CardTitle, CardContent } from './card';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorId: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    const errorId = `err_${Math.random().toString(36).substring(2, 9)}`;
    return { hasError: true, error, errorId };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught exception]', {
      error: error.message,
      componentStack: errorInfo.componentStack,
      errorId: this.state.errorId,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-xl mx-auto my-8">
          <Card className="border-rose-500/30 bg-rose-950/10">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base text-rose-300">
                    {this.props.fallbackTitle || 'Operational Display Exception'}
                  </CardTitle>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {this.props.fallbackMessage ||
                      'An unexpected rendering error occurred while presenting this operational view.'}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="p-3 bg-slate-950/80 rounded border border-slate-800 text-xs font-mono text-slate-300">
                <div className="text-slate-500 mb-1">REFERENCE CODE</div>
                <div className="text-rose-400 font-semibold">{this.state.errorId}</div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={this.handleReset}
                  className="bg-rose-600 hover:bg-rose-500 text-white text-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Re-evaluate View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="border-slate-800 text-slate-400 text-xs"
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
