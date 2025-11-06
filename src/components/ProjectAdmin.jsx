import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ProjectAdmin() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  async function load() {
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (!error) setItems(data || []);
  }
  useEffect(() => { load(); }, []);

  async function createProject(e) {
    e.preventDefault();
    const { error } = await supabase.from("projects").insert({ name, code });
    if (!error) { setName(""); setCode(""); load(); }
  }

  return (
    <div className="card">
      <h2>Projekte</h2>
      <form onSubmit={createProject} className="row gap">
        <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="Code (z.B. AS01)" value={code} onChange={e=>setCode(e.target.value)} />
        <button>Speichern</button>
      </form>
      <ul>
        {items.map(p => <li key={p.id}>{p.code} — {p.name} {p.active ? "" : "(inaktiv)"}</li>)}
      </ul>
    </div>
  );
}
