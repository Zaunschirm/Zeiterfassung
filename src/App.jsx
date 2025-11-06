import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import LoginPanel from "./components/LoginPanel.jsx";
import DaySlider from "./components/DaySlider.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx";
// ↓ Passe diese beiden Imports an deine Struktur an:
import EmployeeList from "./components/EmployeeList.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";

function isAuthed(){ return localStorage.getItem("isAuthed")==="1"; }
function role(){ return (localStorage.getItem("meRole")||"").toLowerCase(); }
function isManager(){ const r=role(); return r==="admin" || r==="teamleiter"; }

function PrivateRoute({children}){
  return isAuthed() ? children : <Navigate to="/" replace/>;
}
function OnlyManager({children}){
  return isManager() ? children : <Navigate to="/zeiterfassung" replace/>;
}

export default function App(){
  return (
    <BrowserRouter>
      {isAuthed() && <NavBar/>}
      <Routes>
        <Route path="/" element={<LoginPanel/>} />
        <Route path="/zeiterfassung" element={
          <PrivateRoute><DaySlider/></PrivateRoute>
        } />
        <Route path="/monatsübersicht" element={
          <PrivateRoute><MonthlyOverview/></PrivateRoute>
        } />
        {/* Mitarbeiter-Bereich NUR für Admin/Teamleiter */}
        <Route path="/mitarbeiter" element={
          <PrivateRoute><OnlyManager><EmployeeList/></OnlyManager></PrivateRoute>
        } />
        <Route path="/projektfotos" element={
          <PrivateRoute><ProjectPhotos/></PrivateRoute>
        } />
        <Route path="*" element={<Navigate to={isAuthed()?"/zeiterfassung":"/"} replace/>} />
      </Routes>
    </BrowserRouter>
  );
}
