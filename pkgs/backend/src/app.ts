import { Hono } from "hono";
import { z } from "zod";
import { DynamoTodoRepository } from "./dynamo-todo-repository.js";
import { InMemoryTodoRepository } from "./in-memory-todo-repository.js";
import type { TodoRepository } from "./todos.js";
import { VersionConflictError, todoStatuses } from "./todos.js";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date.")
  .nullable();

const createTodoSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(todoStatuses).optional(),
  dueDate: dateSchema.optional(),
});

const replaceTodoSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(todoStatuses),
  dueDate: dateSchema.optional(),
  version: z.number().int().min(1),
});

const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    status: z.enum(todoStatuses).optional(),
    dueDate: dateSchema.optional(),
    version: z.number().int().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required.",
  });

const listTodosSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  nextToken: z.string().optional(),
  status: z.enum(todoStatuses).optional(),
});

export function createApp(repository = createDefaultRepository()) {
  const app = new Hono();

  app.get("/v1/todos", async (c) => {
    const query = listTodosSchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(validationError(query.error), 400);
    }

    try {
      return c.json(await repository.list(query.data));
    } catch (error) {
      if (error instanceof SyntaxError) {
        return c.json(errorResponse("BAD_REQUEST", "Invalid nextToken."), 400);
      }
      throw error;
    }
  });

  app.post("/v1/todos", async (c) => {
    const body = await parseJson(c);
    const input = createTodoSchema.safeParse(body);
    if (!input.success) {
      return c.json(validationError(input.error), 400);
    }

    const item = await repository.create(input.data);
    c.header("Location", `/v1/todos/${item.id}`);
    return c.json({ item }, 201);
  });

  app.get("/v1/todos/:todoId", async (c) => {
    const item = await repository.get(c.req.param("todoId"));
    if (!item) {
      return c.json(errorResponse("TODO_NOT_FOUND", "Todo not found."), 404);
    }

    return c.json({ item });
  });

  app.put("/v1/todos/:todoId", async (c) => {
    const body = await parseJson(c);
    const input = replaceTodoSchema.safeParse(body);
    if (!input.success) {
      return c.json(validationError(input.error), 400);
    }

    return saveTodo(c.req.param("todoId"), repository, () =>
      repository.replace(c.req.param("todoId"), input.data),
    );
  });

  app.patch("/v1/todos/:todoId", async (c) => {
    const body = await parseJson(c);
    const input = updateTodoSchema.safeParse(body);
    if (!input.success) {
      return c.json(validationError(input.error), 400);
    }

    return saveTodo(c.req.param("todoId"), repository, () =>
      repository.update(c.req.param("todoId"), input.data),
    );
  });

  app.delete("/v1/todos/:todoId", async (c) => {
    const deleted = await repository.delete(c.req.param("todoId"));
    if (!deleted) {
      return c.json(errorResponse("TODO_NOT_FOUND", "Todo not found."), 404);
    }

    return c.body(null, 204);
  });

  app.notFound((c) => c.json(errorResponse("NOT_FOUND", "Not found."), 404));

  app.onError((error, c) => {
    console.error(error);
    return c.json(
      errorResponse("INTERNAL_SERVER_ERROR", "Unexpected server error."),
      500,
    );
  });

  return app;
}

function createDefaultRepository(): TodoRepository {
  if (process.env.TODO_TABLE_NAME) {
    return new DynamoTodoRepository(process.env.TODO_TABLE_NAME);
  }

  return new InMemoryTodoRepository();
}

async function parseJson(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

async function saveTodo(
  todoId: string,
  repository: TodoRepository,
  operation: () => Promise<Awaited<ReturnType<TodoRepository["get"]>>>,
) {
  try {
    const item = await operation();
    if (!item) {
      return new Response(
        JSON.stringify(errorResponse("TODO_NOT_FOUND", "Todo not found.")),
        {
          status: 404,
          headers: { "content-type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ item }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if (error instanceof VersionConflictError) {
      return new Response(
        JSON.stringify(
          errorResponse(
            "CONFLICT",
            "Todo has already been updated by another request.",
          ),
        ),
        {
          status: 409,
          headers: { "content-type": "application/json" },
        },
      );
    }
    throw error;
  } finally {
    void todoId;
    void repository;
  }
}

function validationError(error: z.ZodError) {
  return {
    error: {
      code: "BAD_REQUEST",
      message: "Invalid request parameters.",
      details: error.issues.map((issue) => ({
        field: issue.path.join("."),
        reason: issue.message,
      })),
    },
  };
}

function errorResponse(code: string, message: string) {
  return {
    error: {
      code,
      message,
    },
  };
}
