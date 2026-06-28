import { ulid } from "ulid";
import type {
  CreateTodoInput,
  ListTodosInput,
  ListTodosResult,
  ReplaceTodoInput,
  Todo,
  TodoRepository,
  UpdateTodoInput,
} from "./todos.js";
import { VersionConflictError } from "./todos.js";

export class InMemoryTodoRepository implements TodoRepository {
  readonly #items = new Map<string, Todo>();

  async create(input: CreateTodoInput): Promise<Todo> {
    const now = new Date().toISOString();
    const item: Todo = {
      id: `todo_${ulid()}`,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "todo",
      dueDate: input.dueDate ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.#items.set(item.id, item);
    return item;
  }

  async list(input: ListTodosInput): Promise<ListTodosResult> {
    const offset = input.nextToken ? Number.parseInt(input.nextToken, 10) : 0;
    const filtered = [...this.#items.values()]
      .filter((item) => !input.status || item.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const items = filtered.slice(offset, offset + input.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextToken: nextOffset < filtered.length ? String(nextOffset) : null,
    };
  }

  async get(todoId: string): Promise<Todo | null> {
    return this.#items.get(todoId) ?? null;
  }

  async replace(todoId: string, input: ReplaceTodoInput): Promise<Todo | null> {
    const current = this.#items.get(todoId);
    if (!current) {
      return null;
    }
    if (current.version !== input.version) {
      throw new VersionConflictError();
    }

    const updated: Todo = {
      ...current,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      dueDate: input.dueDate ?? null,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#items.set(todoId, updated);
    return updated;
  }

  async update(todoId: string, input: UpdateTodoInput): Promise<Todo | null> {
    const current = this.#items.get(todoId);
    if (!current) {
      return null;
    }
    if (input.version !== undefined && current.version !== input.version) {
      throw new VersionConflictError();
    }

    const updated: Todo = {
      ...current,
      title: input.title ?? current.title,
      description:
        input.description === undefined
          ? current.description
          : input.description,
      status: input.status ?? current.status,
      dueDate: input.dueDate === undefined ? current.dueDate : input.dueDate,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#items.set(todoId, updated);
    return updated;
  }

  async delete(todoId: string): Promise<boolean> {
    return this.#items.delete(todoId);
  }
}
