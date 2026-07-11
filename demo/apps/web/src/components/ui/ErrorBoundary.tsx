import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  fallback: (error: unknown, reset: () => void) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
}

/**
 * Presentational error boundary: it catches render-time throws and delegates
 * rendering to a `fallback` render prop, so the taxonomy-aware fallback lives
 * with the composition root and this primitive stays free of `core`.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error };
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error !== null) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
