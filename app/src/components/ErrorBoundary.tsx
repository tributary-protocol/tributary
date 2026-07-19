import { Component, ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleRefresh = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <span className="error-boundary-icon" aria-hidden="true">
              ⚠️
            </span>
            <h1>Something went wrong</h1>
            <p>An unexpected error prevented the page from rendering.</p>
            {this.state.error && (
              <pre className="error-boundary-detail">
                {this.state.error.message}
              </pre>
            )}
            <div className="error-boundary-actions">
              <button onClick={this.handleReset}>Try again</button>
              <button className="ghost" onClick={this.handleRefresh}>
                Refresh page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
