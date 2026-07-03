import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { authClient } from '../api.js';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await authClient.signIn({ email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await queryClient.invalidateQueries();
    await navigate({ to: '/' });
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h1>agentproofarch</h1>
        <p className="sub">sign in · tenant {window.location.hostname}</p>
        <label className="field">
          <span>email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'signing in…' : 'sign in'}
        </button>
        {error ? <p className="form-error">{error}</p> : null}
        <p className="demo-hint">
          demo account: <code>demo@agentproofarch.dev</code> / <code>demo1234</code>
        </p>
      </form>
    </div>
  );
};
