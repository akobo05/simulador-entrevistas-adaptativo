import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px',
            fontFamily: "'DM Sans', sans-serif",
            background: '#F4F6FB',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '22px',
              color: '#2563EB',
            }}
          >
            Warachikuy
          </span>
          <p style={{ color: '#64748B', maxWidth: '400px', lineHeight: 1.5 }}>
            Algo salió mal. Recarga la página o vuelve al inicio.
          </p>
          <Button
            onClick={() => {
              this.setState({ error: null });
              window.location.href = '/';
            }}
          >
            Volver al inicio
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
