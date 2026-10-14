import { Component, type ErrorInfo, type ReactNode } from "react";
import { useStore } from "statelift";
import { documentsStore } from "../../stores/documents";
import { RecoveryScreen } from "./RecoveryScreen";

type ErrorBoundaryState = {
  hasFailed: boolean;
  message: string;
  componentStack: string;
};

type ErrorBoundaryProps = {
  children: ReactNode;
  region: "application" | "diagram";
  resetKey: string | null;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasFailed: false, message: "", componentStack: "" };

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return { hasFailed: true, message: typeof error === "string" ? error : message, componentStack: "" };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    const shouldReset = this.state.hasFailed && previousProps.resetKey !== this.props.resetKey;
    if (!shouldReset) return;

    this.handleRetry();
  }

  handleRetry = () => {
    this.setState({ hasFailed: false, message: "", componentStack: "" });
  };

  render() {
    if (this.state.hasFailed) {
      return (
        <RecoveryScreen
          region={this.props.region}
          message={this.state.message}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

type RecoveryBoundaryProps = {
  children: ReactNode;
  region: "application" | "diagram";
};

export const RecoveryBoundary = ({ children, region }: RecoveryBoundaryProps) => {
  const currentDocumentId = useStore(documentsStore, (state) => state.currentDocumentId);

  return (
    <ErrorBoundary region={region} resetKey={region === "diagram" ? currentDocumentId : null}>
      {children}
    </ErrorBoundary>
  );
};
