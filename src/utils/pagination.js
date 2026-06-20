export async function collectPaginatedRows(fetchPage, { pageSize = 1000, maxPages = 10000 } = {}) {
  if (typeof fetchPage !== "function") throw new TypeError("fetchPage must be a function");
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new RangeError("pageSize must be a positive integer");
  if (!Number.isInteger(maxPages) || maxPages <= 0) throw new RangeError("maxPages must be a positive integer");

  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const batch = await fetchPage({
      page,
      pageSize,
      from,
      to: from + pageSize - 1,
    });

    if (!Array.isArray(batch)) throw new TypeError("fetchPage must return an array");
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }

  throw new Error(`Pagination exceeded the safety limit of ${maxPages} pages`);
}
