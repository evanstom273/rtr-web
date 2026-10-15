import { Component, type ReactNode } from 'react';
import { store } from '../storage/storage';

interface State {
  error: Error | null;
}

/** A crash shows what went wrong and a way out, instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section id="setup">
        <div className="wrap">
          <p className="eyebrow">Something broke</p>
          <h1 className="crash-title">That's not supposed to happen</h1>
          <pre className="crash">{`${error.message}\n${(error.stack ?? '').split('\n').slice(1, 6).join('\n')}`}</pre>
          <div className="ractions">
            <button className="primary" onClick={() => location.reload()}>
              Reload
            </button>
            <button
              className="ghost"
              onClick={() => {
                store.set('rtr-picks', null);
                location.reload();
              }}
            >
              Reset picks and reload
            </button>
          </div>
        </div>
      </section>
    );
  }
}
