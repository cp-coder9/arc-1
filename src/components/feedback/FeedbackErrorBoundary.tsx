import * as React from "react"

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * FeedbackErrorBoundary — A silent error boundary for the FeedbackWidget.
 *
 * If the FeedbackWidget throws during render or in a lifecycle method,
 * this boundary catches it, logs to console, and renders nothing.
 * The rest of the app continues unaffected.
 */
export class FeedbackErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[FeedbackWidget] Caught error in ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
