import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function NavBar(){
  const nav = useNavigate();
  const me = JSON.parse(localStorage.getItem("me") || "null");
  const role = (me?.role || "").toLowerCase();
  const isManager = role === "admin" || role === "teamleiter";

  function logout(){
    ["me","employee","isAuthed","meRole",
     "activeEmployeeIds","activeEmployeeId_last","employee_names_map"
    ].forEach(k=>localStorage.removeItem(k));
    nav("/",{replace:true});
  }

  return (
    <header className="hbz-card" style={{backgroundColor:"var(--hbz-brown)",color:"#fff",marginBottom:"16px"}}>
      <div className="hbz-container" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div className="hbz-title">Holzbau&nbsp;Zaunschirm</div>
        <nav>
          <Link className="hbz-btn" to="/zeiterfassung">Zeiterfassung</Link>
          <Link className="hbz-btn" to="/monatsübersicht">Monatsübersicht</Link>
          {isManager && <Link className="hbz-btn" to="/mitarbeiter">Mitarbeiter</Link>}
          <Link className="hbz-btn" to="/projektfotos">Projektfotos</Link>
        </nav>
        <div>
          {me && <span style={{marginRight:10,fontWeight:600}}>{me.name} ({role})</span>}
          <button className="hbz-btn primary" onClick={logout}>Logout</button>
        </div>
      </div>
    </header>
  );
}
