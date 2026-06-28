import {
  ConditionalCheckFailedException,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  type ScanCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
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

export class DynamoTodoRepository implements TodoRepository {
  readonly #client: DynamoDBDocumentClient;
  readonly #tableName: string;

  constructor(tableName: string, client?: DynamoDBDocumentClient) {
    this.#tableName = tableName;
    this.#client =
      client ??
      DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true },
      });
  }

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

    await this.#client.send(
      new PutCommand({
        TableName: this.#tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(id)",
      }),
    );

    return item;
  }

  async list(input: ListTodosInput): Promise<ListTodosResult> {
    const scanInput: ScanCommandInput = {
      TableName: this.#tableName,
      Limit: input.limit,
      ExclusiveStartKey: input.nextToken
        ? decodeNextToken(input.nextToken)
        : undefined,
    };

    if (input.status) {
      scanInput.FilterExpression = "#status = :status";
      scanInput.ExpressionAttributeNames = { "#status": "status" };
      scanInput.ExpressionAttributeValues = { ":status": input.status };
    }

    const result = await this.#client.send(new ScanCommand(scanInput));
    return {
      items: (result.Items ?? []) as Todo[],
      nextToken: result.LastEvaluatedKey
        ? encodeNextToken(result.LastEvaluatedKey)
        : null,
    };
  }

  async get(todoId: string): Promise<Todo | null> {
    const result = await this.#client.send(
      new GetCommand({
        TableName: this.#tableName,
        Key: { id: todoId },
      }),
    );

    return (result.Item as Todo | undefined) ?? null;
  }

  async replace(todoId: string, input: ReplaceTodoInput): Promise<Todo | null> {
    const current = await this.get(todoId);
    if (!current) {
      return null;
    }

    try {
      const result = await this.#client.send(
        new UpdateCommand({
          TableName: this.#tableName,
          Key: { id: todoId },
          ConditionExpression: "#version = :expectedVersion",
          UpdateExpression:
            "SET title = :title, description = :description, #status = :status, dueDate = :dueDate, #version = #version + :increment, updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#status": "status",
            "#version": "version",
          },
          ExpressionAttributeValues: {
            ":title": input.title,
            ":description": input.description ?? null,
            ":status": input.status,
            ":dueDate": input.dueDate ?? null,
            ":expectedVersion": input.version,
            ":increment": 1,
            ":updatedAt": new Date().toISOString(),
          },
          ReturnValues: "ALL_NEW",
        }),
      );

      return result.Attributes as Todo;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new VersionConflictError();
      }
      throw error;
    }
  }

  async update(todoId: string, input: UpdateTodoInput): Promise<Todo | null> {
    const current = await this.get(todoId);
    if (!current) {
      return null;
    }

    const expressionNames: Record<string, string> = {
      "#version": "version",
    };
    const expressionValues: Record<string, string | number | null> = {
      ":increment": 1,
      ":updatedAt": new Date().toISOString(),
    };
    const updates = [
      "#version = #version + :increment",
      "updatedAt = :updatedAt",
    ];

    if (input.title !== undefined) {
      updates.push("title = :title");
      expressionValues[":title"] = input.title;
    }
    if (input.description !== undefined) {
      updates.push("description = :description");
      expressionValues[":description"] = input.description;
    }
    if (input.status !== undefined) {
      updates.push("#status = :status");
      expressionNames["#status"] = "status";
      expressionValues[":status"] = input.status;
    }
    if (input.dueDate !== undefined) {
      updates.push("dueDate = :dueDate");
      expressionValues[":dueDate"] = input.dueDate;
    }

    let conditionExpression: string | undefined;
    if (input.version !== undefined) {
      conditionExpression = "#version = :expectedVersion";
      expressionValues[":expectedVersion"] = input.version;
    }

    try {
      const result = await this.#client.send(
        new UpdateCommand({
          TableName: this.#tableName,
          Key: { id: todoId },
          ConditionExpression: conditionExpression,
          UpdateExpression: `SET ${updates.join(", ")}`,
          ExpressionAttributeNames: expressionNames,
          ExpressionAttributeValues: expressionValues,
          ReturnValues: "ALL_NEW",
        }),
      );

      return result.Attributes as Todo;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        throw new VersionConflictError();
      }
      throw error;
    }
  }

  async delete(todoId: string): Promise<boolean> {
    try {
      await this.#client.send(
        new DeleteCommand({
          TableName: this.#tableName,
          Key: { id: todoId },
          ConditionExpression: "attribute_exists(id)",
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return false;
      }
      throw error;
    }
  }
}

function encodeNextToken(key: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeNextToken(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
}
