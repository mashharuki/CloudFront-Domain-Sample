import { describe, expect, test } from "vitest";
import { createApp } from "./app.js";
import { InMemoryTodoRepository } from "./in-memory-todo-repository.js";
import type { Todo } from "./todos.js";

function testApp() {
  return createApp(new InMemoryTodoRepository());
}

async function json<T>(response: Response) {
  return response.json() as Promise<T>;
}

describe("Todo API", () => {
  test("creates, lists, gets, updates, and deletes todos", async () => {
    const app = testApp();

    const createdResponse = await app.request("/v1/todos", {
      method: "POST",
      body: JSON.stringify({
        title: "Write API",
        description: "Implement the contract",
        dueDate: "2026-07-01",
      }),
      headers: { "content-type": "application/json" },
    });
    expect(createdResponse.status).toBe(201);
    const created = await json<{ item: Todo }>(createdResponse);
    expect(created.item).toMatchObject({
      title: "Write API",
      description: "Implement the contract",
      status: "todo",
      dueDate: "2026-07-01",
      version: 1,
    });

    const listResponse = await app.request("/v1/todos");
    expect(listResponse.status).toBe(200);
    expect((await json<{ items: Todo[] }>(listResponse)).items).toHaveLength(1);

    const getResponse = await app.request(`/v1/todos/${created.item.id}`);
    expect(getResponse.status).toBe(200);
    expect((await json<{ item: Todo }>(getResponse)).item.id).toBe(
      created.item.id,
    );

    const patchResponse = await app.request(`/v1/todos/${created.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "done", version: 1 }),
      headers: { "content-type": "application/json" },
    });
    expect(patchResponse.status).toBe(200);
    expect((await json<{ item: Todo }>(patchResponse)).item).toMatchObject({
      status: "done",
      version: 2,
    });

    const deleteResponse = await app.request(`/v1/todos/${created.item.id}`, {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(204);

    const missingResponse = await app.request(`/v1/todos/${created.item.id}`);
    expect(missingResponse.status).toBe(404);
  });

  test("validates invalid input", async () => {
    const app = testApp();

    expect(
      await app.request("/v1/todos", {
        method: "POST",
        body: JSON.stringify({ title: "" }),
        headers: { "content-type": "application/json" },
      }),
    ).toHaveProperty("status", 400);
    expect(await app.request("/v1/todos?status=blocked")).toHaveProperty(
      "status",
      400,
    );
    expect(await app.request("/v1/todos?limit=101")).toHaveProperty(
      "status",
      400,
    );
  });

  test("returns conflict when version does not match", async () => {
    const app = testApp();
    const createdResponse = await app.request("/v1/todos", {
      method: "POST",
      body: JSON.stringify({ title: "Versioned" }),
      headers: { "content-type": "application/json" },
    });
    const created = await json<{ item: Todo }>(createdResponse);

    const response = await app.request(`/v1/todos/${created.item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "Versioned",
        status: "in_progress",
        version: 99,
      }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(409);
  });

  test("paginates list results", async () => {
    const app = testApp();
    for (const title of ["First", "Second", "Third"]) {
      await app.request("/v1/todos", {
        method: "POST",
        body: JSON.stringify({ title }),
        headers: { "content-type": "application/json" },
      });
    }

    const firstPageResponse = await app.request("/v1/todos?limit=2");
    const firstPage = await json<{ items: Todo[]; nextToken: string | null }>(
      firstPageResponse,
    );
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextToken).toBeTruthy();

    const secondPageResponse = await app.request(
      `/v1/todos?limit=2&nextToken=${firstPage.nextToken}`,
    );
    const secondPage = await json<{ items: Todo[]; nextToken: string | null }>(
      secondPageResponse,
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextToken).toBeNull();
  });
});
