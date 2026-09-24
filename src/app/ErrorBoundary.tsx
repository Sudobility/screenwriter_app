import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Top-level render-error catch-all, matching music_app's provider stack shape (ErrorBoundary wraps everything). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-full flex items-center justify-center p-6 text-center">
          <div>
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-neutral-500 mt-2">Reload the page to try again.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
