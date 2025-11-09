import React, { useState } from "react";
import LoginPanel from "./components/LoginPanel.jsx";
import Monatsuebersicht from "./components/Monatsuebersicht.jsx";
import ProjectPhotos from "./components/ProjectPhotos.jsx";
import EmployeeList from "./components/EmployeeList.jsx";
import NavBar from "./components/NavBar.jsx";
import DaySlider from "./components/DaySlider.jsx"; // dein Zeiterfassungsmodul
import "./styles.css";

function App() {
  const [currentView, setCurrentView] = useState("login");
  const [loggedIn, setLoggedIn] = useState(false);

  const handleLogin = () => {
    setLoggedIn(true);
    setCurrentView("zeiterfassung");
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setCurrentView("login");
  };

  const renderView = () => {
    if (!loggedIn) {
      return <LoginPanel onLogin={handleLogin} />;
    }

    switch (currentView) {
      case "zeiterfassung":
        return <DaySlider />;
      case "monatsuebersicht":
        return <Monatsuebersicht />;
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
