import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoginPanel from "./components/LoginPanel.jsx";
import MonthlyOverview from "./components/MonthlyOverview.jsx"; // ✅ richtiger Import
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx";
import "./styles.css";

function App() {
  const [currentView, setCurrentView] = useState("login");
  const [loggedIn, setLoggedIn] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const pathToView = (path) => {
    switch (path) {
      case "/zeiterfassung":
        return "zeiterfassung";
      case "/monatsuebersicht":
      case "/monthly": // ✅ Fallback – alte englische Route funktioniert weiter
        return "monatsuebersicht";
      case "/projektfotos":
        return "projektfotos";
      case "/mitarbeiter":
        return "mitarbeiter";
      default:
        return loggedIn ? "zeiterfassung" : "login";
    }
  };

  useEffect(() => {
    setCurrentView(pathToView(location.pathname));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, loggedIn]);

  const handleLogin = () => {
    setLoggedIn(true);
    navigate("/zeiterfassung", { replace: true });
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentView("login");
    navigate("/", { replace: true });
  };

  const renderView = () => {
    if (!loggedIn) return <LoginPanel onLogin={handleLogin} />;

    switch (currentView) {
      case "zeiterfassung":
        return <DaySlider />;
      case "monatsuebersicht":
        return <MonthlyOverview />; // ✅ korrigiert
      case "projektfotos":
        return <ProjectPhotos />;
      case "mitarbeiter":
        return <EmployeeList />;
      default:
        return <DaySlider />;
    }
  };

  return (
    <div className="App">
      {loggedIn && (
        <NavBar
          setCurrentView={setCurrentView}
          onLogout={handleLogout}
        />
      )}
      <main>{renderView()}</main>
    </div>
  );
}

export default App;
