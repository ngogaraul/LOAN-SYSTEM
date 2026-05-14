/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import { ThemeProvider, CssBaseline } from "@mui/material";
import { getAppTheme } from "./theme";
import { SnackbarProvider } from "notistack";

function Root() {
  const [colorMode, setColorMode] = useState(() => localStorage.getItem("color-mode") || "light");

  useEffect(() => {
    localStorage.setItem("color-mode", colorMode);
  }, [colorMode]);

  const theme = useMemo(() => getAppTheme(colorMode), [colorMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider maxSnack={3} autoHideDuration={2500} anchorOrigin={{ vertical: "top", horizontal: "right" }}>
        <App colorMode={colorMode} onToggleColorMode={() => setColorMode((prev) => prev === "light" ? "dark" : "light")} />
      </SnackbarProvider>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
