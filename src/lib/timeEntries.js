export async function createTimeEntries(client, rows) {
  const payload = Array.isArray(rows) ? rows : [rows];
  const { data, error } = await client
    .from("time_entries")
    .insert(payload)
    .select("*");

  if (error) throw error;
  return data || [];
}

export async function updateTimeEntry(client, id, changes) {
  const { error } = await client
    .from("time_entries")
    .update(changes)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteTimeEntry(client, id) {
  const { error } = await client
    .from("time_entries")
    .delete()
    .eq("id", id);

  if (error) throw error;
}
