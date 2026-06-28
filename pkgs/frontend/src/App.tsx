import { useEffect, useMemo, useState } from "react";
import "./App.css";

type TodoStatus = "todo" | "in_progress" | "done";

interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface TodoDraft {
  title: string;
  description: string;
  status: TodoStatus;
  dueDate: string;
}

const statusLabels: Record<TodoStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};

const emptyDraft: TodoDraft = {
  title: "",
  description: "",
  status: "todo",
  dueDate: "",
};

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TodoStatus | "all">("all");
  const [createDraft, setCreateDraft] = useState<TodoDraft>(emptyDraft);
  const [editDraft, setEditDraft] = useState<TodoDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const selectedTodo = todos.find((todo) => todo.id === selectedId) ?? null;
  const filteredTodos = useMemo(
    () =>
      filter === "all" ? todos : todos.filter((todo) => todo.status === filter),
    [filter, todos],
  );
  const counts = useMemo(
    () =>
      todos.reduce(
        (acc, todo) => {
          acc[todo.status] += 1;
          return acc;
        },
        { todo: 0, in_progress: 0, done: 0 } satisfies Record<
          TodoStatus,
          number
        >,
      ),
    [todos],
  );

  useEffect(() => {
    void loadTodos();
  }, []);

  useEffect(() => {
    if (!selectedTodo) {
      setEditDraft(emptyDraft);
      return;
    }

    setEditDraft({
      title: selectedTodo.title,
      description: selectedTodo.description ?? "",
      status: selectedTodo.status,
      dueDate: selectedTodo.dueDate ?? "",
    });
  }, [selectedTodo]);

  async function loadTodos(nextFilter = filter) {
    setLoading(true);
    setMessage(null);
    setConflict(null);
    try {
      const search = new URLSearchParams({ limit: "100" });
      if (nextFilter !== "all") {
        search.set("status", nextFilter);
      }
      const response = await fetch(`/v1/todos?${search}`);
      const data = await parseResponse<{ items: Todo[] }>(response);
      setTodos(data.items);
      setSelectedId((current) => current ?? data.items[0]?.id ?? null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to load todos.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setConflict(null);
    try {
      const response = await fetch("/v1/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(createDraft)),
      });
      const data = await parseResponse<{ item: Todo }>(response);
      setTodos((current) => [data.item, ...current]);
      setSelectedId(data.item.id);
      setCreateDraft(emptyDraft);
      setMessage("Todo created.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to create todo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveSelected(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTodo) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setConflict(null);
    try {
      const response = await fetch(`/v1/todos/${selectedTodo.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...toPayload(editDraft),
          status: editDraft.status,
          version: selectedTodo.version,
        }),
      });
      const data = await parseResponse<{ item: Todo }>(response);
      replaceTodo(data.item);
      setMessage("Changes saved.");
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : "Failed to save todo.";
      if (nextMessage.includes("updated by another request")) {
        setConflict(nextMessage);
        await loadTodos();
      } else {
        setMessage(nextMessage);
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(todo: Todo, status: TodoStatus) {
    setSaving(true);
    setMessage(null);
    setConflict(null);
    try {
      const response = await fetch(`/v1/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, version: todo.version }),
      });
      const data = await parseResponse<{ item: Todo }>(response);
      replaceTodo(data.item);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to update status.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelected() {
    if (!selectedTodo) {
      return;
    }

    setSaving(true);
    setMessage(null);
    setConflict(null);
    try {
      const response = await fetch(`/v1/todos/${selectedTodo.id}`, {
        method: "DELETE",
      });
      await parseResponse(response);
      setTodos((current) =>
        current.filter((todo) => todo.id !== selectedTodo.id),
      );
      setSelectedId(null);
      setMessage("Todo deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Failed to delete todo.",
      );
    } finally {
      setSaving(false);
    }
  }

  function replaceTodo(item: Todo) {
    setTodos((current) =>
      current.map((todo) => (todo.id === item.id ? item : todo)),
    );
  }

  return (
    <main className="todo-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">mashharuki.com/v1</p>
          <h1>Todo Console</h1>
        </div>
        <div className="metrics" aria-label="Todo counts">
          <span>{todos.length} total</span>
          <span>{counts.in_progress} active</span>
          <span>{counts.done} done</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-label="Todo list">
          <form className="new-todo" onSubmit={createTodo}>
            <label>
              Title
              <input
                value={createDraft.title}
                maxLength={100}
                onChange={(event) =>
                  setCreateDraft((draft) => ({
                    ...draft,
                    title: event.target.value,
                  }))
                }
                placeholder="Add a deploy check"
                required
              />
            </label>
            <label>
              Due
              <input
                type="date"
                value={createDraft.dueDate}
                onChange={(event) =>
                  setCreateDraft((draft) => ({
                    ...draft,
                    dueDate: event.target.value,
                  }))
                }
              />
            </label>
            <textarea
              value={createDraft.description}
              maxLength={1000}
              onChange={(event) =>
                setCreateDraft((draft) => ({
                  ...draft,
                  description: event.target.value,
                }))
              }
              placeholder="Description"
              rows={3}
            />
            <button type="submit" disabled={saving}>
              Add todo
            </button>
          </form>

          <div className="filters" role="tablist" aria-label="Status filter">
            {(["all", "todo", "in_progress", "done"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => {
                  setFilter(value);
                  void loadTodos(value);
                }}
              >
                {value === "all" ? "All" : statusLabels[value]}
              </button>
            ))}
          </div>

          <div className="todo-list">
            {loading ? <p className="muted">Loading todos...</p> : null}
            {!loading && filteredTodos.length === 0 ? (
              <p className="muted">No todos match this filter.</p>
            ) : null}
            {filteredTodos.map((todo) => (
              <button
                key={todo.id}
                type="button"
                className={`todo-row ${selectedId === todo.id ? "selected" : ""}`}
                onClick={() => setSelectedId(todo.id)}
              >
                <span className={`status-dot ${todo.status}`} />
                <span>
                  <strong>{todo.title}</strong>
                  <small>
                    {statusLabels[todo.status]}
                    {todo.dueDate ? ` · due ${formatDate(todo.dueDate)}` : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail" aria-label="Todo detail">
          {selectedTodo ? (
            <form onSubmit={saveSelected}>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Version {selectedTodo.version}</p>
                  <h2>{selectedTodo.title}</h2>
                </div>
                <span className={`status-pill ${selectedTodo.status}`}>
                  {statusLabels[selectedTodo.status]}
                </span>
              </div>

              <div className="field-grid">
                <label>
                  Title
                  <input
                    value={editDraft.title}
                    maxLength={100}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={editDraft.status}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        status: event.target.value as TodoStatus,
                      }))
                    }
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type="date"
                    value={editDraft.dueDate}
                    onChange={(event) =>
                      setEditDraft((draft) => ({
                        ...draft,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label className="description-field">
                Description
                <textarea
                  value={editDraft.description}
                  maxLength={1000}
                  rows={8}
                  onChange={(event) =>
                    setEditDraft((draft) => ({
                      ...draft,
                      description: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="quick-actions">
                {(["todo", "in_progress", "done"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => updateStatus(selectedTodo, status)}
                    disabled={saving || selectedTodo.status === status}
                  >
                    {statusLabels[status]}
                  </button>
                ))}
              </div>

              <div className="meta">
                <span>Created {formatDateTime(selectedTodo.createdAt)}</span>
                <span>Updated {formatDateTime(selectedTodo.updatedAt)}</span>
              </div>

              {message ? <p className="notice">{message}</p> : null}
              {conflict ? <p className="notice conflict">{conflict}</p> : null}

              <div className="form-actions">
                <button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={deleteSelected}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              <h2>No todo selected</h2>
              <p>Create a todo or select one from the list.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function toPayload(draft: TodoDraft) {
  return {
    title: draft.title,
    description: draft.description.trim() ? draft.description : null,
    status: draft.status,
    dueDate: draft.dueDate || null,
  };
}

async function parseResponse<T = unknown>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Request failed.");
  }

  return data as T;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default App;
