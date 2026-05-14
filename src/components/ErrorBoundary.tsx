import * as React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public props: Props;
  public state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
    window.location.reload();
  };

  private getErrorContext() {
    const fallback = {
      message: 'An unexpected error occurred.',
      isFirestoreError: false,
      isChunkLoadError: false,
    };
    const message = this.state.error?.message || '';

    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(message)) {
      return {
        message: 'The application could not load the latest deployed assets. Reload the page to fetch the current version.',
        isFirestoreError: false,
        isChunkLoadError: true,
      };
    }

    try {
      if (message) {
        const parsed = JSON.parse(message);
        if (parsed.error && parsed.operationType) {
          return {
            message: `Firestore ${parsed.operationType} error: ${parsed.error}`,
            isFirestoreError: true,
            isChunkLoadError: false,
          };
        }
      }
    } catch (e) {
      return { ...fallback, message: message || fallback.message };
    }

    return { ...fallback, message: message || fallback.message };
  }

  render() {
    if (this.state.hasError) {
      const { message: errorMessage, isFirestoreError, isChunkLoadError } = this.getErrorContext();

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full bg-white rounded-[2rem] border border-border shadow-2xl p-10 text-center space-y-6">
            <div className="w-20 h-20 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto">
              <AlertCircle size={40} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-heading font-bold tracking-tight">Something went wrong</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {errorMessage}
              </p>
              {isChunkLoadError && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  This can happen immediately after a production deployment while a browser is still using an older HTML bundle.
                </p>
              )}
            </div>
            {isFirestoreError && (
              <div className="p-4 bg-secondary/30 rounded-xl text-[10px] font-mono text-left overflow-auto max-h-32">
                {this.state.error?.message}
              </div>
            )}
            <Button
              onClick={this.handleReset}
              className="w-full bg-primary text-primary-foreground h-12 rounded-xl font-bold gap-2"
            >
              <RefreshCcw size={18} /> Reload Application
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
