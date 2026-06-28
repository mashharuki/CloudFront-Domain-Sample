export const todoStatuses = ["todo", "in_progress", "done"] as const;

export type TodoStatus = (typeof todoStatuses)[number];

export interface Todo {
  id: string;
  title: string;
  description: string | null;
  status: TodoStatus;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTodoInput {
  title: string;
  description?: string | null;
  status?: TodoStatus;
  dueDate?: string | null;
}

export interface ReplaceTodoInput {
  title: string;
  description?: string | null;
  status: TodoStatus;
  dueDate?: string | null;
  version: number;
}

export interface UpdateTodoInput {
  title?: string;
  description?: string | null;
  status?: TodoStatus;
  dueDate?: string | null;
  version?: number;
}

export interface ListTodosInput {
  limit: number;
  nextToken?: string;
  status?: TodoStatus;
}

export interface ListTodosResult {
  items: Todo[];
  nextToken: string | null;
}

export interface TodoRepository {
  create(input: CreateTodoInput): Promise<Todo>;
  list(input: ListTodosInput): Promise<ListTodosResult>;
  get(todoId: string): Promise<Todo | null>;
  replace(todoId: string, input: ReplaceTodoInput): Promise<Todo | null>;
  update(todoId: string, input: UpdateTodoInput): Promise<Todo | null>;
  delete(todoId: string): Promise<boolean>;
}

export class VersionConflictError extends Error {
  constructor() {
    super("Todo has already been updated by another request.");
    this.name = "VersionConflictError";
  }
}
