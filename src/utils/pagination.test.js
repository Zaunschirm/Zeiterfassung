import { describe, expect, it, vi } from "vitest";
import { collectPaginatedRows } from "./pagination.js";

describe("collectPaginatedRows", () => {
  it("loads more than 500 rows without truncating them", async () => {
    const source = Array.from({ length: 1205 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async ({ from, to }) => source.slice(from, to + 1));

    const rows = await collectPaginatedRows(fetchPage, { pageSize: 500 });

    expect(rows).toEqual(source);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(3, {
      page: 2,
      pageSize: 500,
      from: 1000,
      to: 1499,
    });
  });

  it("requests one final empty page when the row count matches the page size exactly", async () => {
    const source = Array.from({ length: 1000 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async ({ from, to }) => source.slice(from, to + 1));

    const rows = await collectPaginatedRows(fetchPage, { pageSize: 500 });

    expect(rows).toHaveLength(1000);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed page results instead of silently losing rows", async () => {
    await expect(collectPaginatedRows(async () => null)).rejects.toThrow("must return an array");
  });
});
