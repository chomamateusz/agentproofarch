import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { meQuery, orgsQuery, todosQuery, unwrap, ApiError } from '@core/client/index.js';

import { api, authClient, tenantHue, tenantUrl } from '../api.js';

export const TodosPage = () => {
  const navigate = useNavigate();
  const me = useQuery(meQuery(api));

  const unauthorized =
    me.error instanceof ApiError && me.error.appError.code === 'unauthorized';

  useEffect(() => {
    if (unauthorized) void navigate({ to: '/login' });
  }, [unauthorized, navigate]);

  useEffect(() => {
    const slug = me.data?.tenant?.slug;
    if (slug) document.documentElement.style.setProperty('--accent-h', String(tenantHue(slug)));
  }, [me.data?.tenant?.slug]);

  if (me.isPending) return <div className="shell"><p className="loading">opening the logbook…</p></div>;
  if (unauthorized) return null;
  if (me.isError) return <div className="shell"><p className="form-error">{me.error.message}</p></div>;

  return me.data.tenant ? <TenantLedger tenant={me.data.tenant} email={me.data.email} /> : <PickTenant />;
};

const PickTenant = () => {
  const orgs = useQuery(orgsQuery(api));
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Choose a tenant</h1>
        <p className="sub">every tenant lives on its own domain</p>
        {orgs.isPending ? <p className="loading">loading…</p> : null}
        <ul className="pick-list">
          {orgs.data?.organizations.map((m) => (
            <li key={m.tenant.id}>
              <a href={tenantUrl(m.tenant.slug)}>
                <strong>{m.tenant.name}</strong>
                <span className="slug">{tenantUrl(m.tenant.slug)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const TenantLedger = ({
  tenant,
  email,
}: {
  tenant: { id: string; slug: string; name: string; role: string };
  email: string;
}) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const todos = useQuery(todosQuery(api));
  const orgs = useQuery(orgsQuery(api));
  const [title, setTitle] = useState('');

  const addTodo = useMutation({
    mutationFn: async (newTitle: string) => unwrap(await api.addTodo({ title: newTitle })),
    onSuccess: async () => {
      setTitle('');
      await queryClient.invalidateQueries({ queryKey: ['todos'] });
    },
  });

  const signOut = async () => {
    await authClient.signOut();
    await queryClient.invalidateQueries();
    await navigate({ to: '/login' });
  };

  return (
    <div className="shell">
      <header className="masthead">
        <div className="masthead__row">
          <span className="masthead__mark" aria-hidden />
          <h1 className="masthead__tenant">{tenant.name}</h1>
          <span className="masthead__meta">{window.location.hostname}</span>
          <span className="masthead__spacer" />
          <span className="role-badge">{tenant.role}</span>
        </div>
        <div className="masthead__row masthead__row--account">
          <span className="masthead__meta masthead__email">{email}</span>
          <span className="masthead__spacer" />
          <button className="linkish" onClick={() => void signOut()}>
            sign out
          </button>
        </div>
      </header>

      <nav className="switcher">
        <span className="switcher__label">your tenants →</span>
        {orgs.data?.organizations.map((m) => (
          <a
            key={m.tenant.id}
            href={tenantUrl(m.tenant.slug)}
            aria-current={m.tenant.id === tenant.id}
          >
            {m.tenant.slug}
          </a>
        ))}
      </nav>

      <section className="ledger">
        <h2 className="ledger__title">Entries in this tenant's ledger</h2>
        {todos.isPending ? <p className="loading">reading entries…</p> : null}
        {todos.isError ? <p className="form-error">{todos.error.message}</p> : null}
        {todos.data ? (
          todos.data.todos.length === 0 ? (
            <p className="empty">— no entries yet; this tenant's page is blank —</p>
          ) : (
            <ul className="todo-list">
              {todos.data.todos.map((todo) => (
                <li key={todo.id}>
                  {todo.title}
                  <time dateTime={todo.createdAt}>
                    {new Date(todo.createdAt).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )
        ) : null}

        <form
          className="add-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) addTodo.mutate(title);
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={`new entry for ${tenant.name}…`}
            aria-label="New todo title"
          />
          <button type="submit" disabled={addTodo.isPending}>
            {addTodo.isPending ? 'adding…' : 'add ↵'}
          </button>
        </form>
        {addTodo.isError ? <p className="form-error">{addTodo.error.message}</p> : null}
      </section>
    </div>
  );
};
