import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: Props) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      let errorMessage = 'Something went wrong.';
      try {
        // @ts-ignore
        const parsedError = JSON.parse(this.state.error?.message || '');
        if (parsedError.error) {
          errorMessage = `Firestore Error: ${parsedError.error} (Operation: ${parsedError.operationType})`;
        }
      } catch (e) {
        // @ts-ignore
      errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-brand-bg p-6 selection:bg-brand-red/30">
          <div className="max-w-md w-full bg-brand-card rounded-[2rem] shadow-[0_0_50px_rgba(244,67,54,0.1)] p-10 border border-brand-red/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-red/5 rounded-full -mr-16 -mt-16 blur-2xl" />
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-brand-red/10 rounded-2xl flex items-center justify-center text-brand-red border border-brand-red/20 mb-6 shadow-lg shadow-brand-red/10 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
              </div>
              
              <h2 className="text-2xl font-black text-brand-text uppercase tracking-[0.2em] mb-2">System Collision</h2>
              <p className="text-xs font-bold text-brand-red uppercase tracking-widest mb-6 opacity-80">Critical Execution Block</p>
              
              <div className="w-full bg-black/20 rounded-xl p-4 border border-white/5 mb-8 text-left">
                <p className="text-brand-muted text-xs font-mono leading-relaxed break-words">{errorMessage}</p>
              </div>
              
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-gold-gradient text-brand-bg py-4 rounded-xl font-black uppercase tracking-[0.2em] text-xs hover:opacity-90 transition-all shadow-xl shadow-brand-gold/10 border border-brand-card"
              >
                Reset Terminal
              </button>
              
              <p className="mt-8 text-[10px] text-brand-muted font-bold uppercase tracking-widest opacity-40">
                XECURA Secure Protocol • Error {Math.floor(Math.random() * 900) + 100}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}
