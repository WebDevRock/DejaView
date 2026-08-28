// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  openDatabase,
  type DatabaseConnection,
} from "@/infrastructure/db/client";

const connections: DatabaseConnection[] = [];

afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
});

describe("SQLite client", () => {
  it("enables the required connection pragmas", () => {
    const connection = openDatabase(":memory:");
    connections.push(connection);

    expect(connection.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(connection.sqlite.pragma("busy_timeout", { simple: true })).toBe(
      5_000,
    );
    expect(connection.sqlite.pragma("journal_mode", { simple: true })).toBe(
      "memory",
    );
  });
});
