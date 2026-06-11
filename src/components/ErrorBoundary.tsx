import * as React from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children: React.ReactNode;
}

function getErrorContext(error: Error | null) {
  const fallback = {
    message: 'An unexpected error occurred.',
    isFirestoreError: false,
    isChunkLoadError: false,
  };
  const message = error?.message || '';

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

export default function ErrorBoundary({ children }: Props) {
  const [hasError, setHasError] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  // Use a ref so the error handler is stable and doesn't trigger re-subscription
  const errorHandlerRef = React.useRef<((event: ErrorEvent) => void) | null>(null);

  React.useEffect(() => {
    errorHandlerRef.current = (event: ErrorEvent) => {
      setError(event.error);
      setHasError(true);
      console.error('Uncaught error:', event.error);
    };

    const onError = (event: ErrorEvent) => {
      errorHandlerRef.current?.(event);
    };

    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, []);

  const handleReset = () => {
    setHasError(false);
    setError(null);
    window.location.reload();
  };

  if (hasError) {
    const { message: errorMessage, isFirestoreError, isChunkLoadError } = getErrorContext(error);

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
              {error?.message}
            </div>
          )}
          <Button
            onClick={handleReset}
            className="w-full bg-primary text-primary-foreground h-12 rounded-xl font-bold gap-2"
          >
            <RefreshCcw size={18} /> Reload Application
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
