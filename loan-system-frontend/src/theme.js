import { createTheme } from "@mui/material/styles";

export function getAppTheme(mode = "light") {
  const isDark = mode === "dark";

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? "#7fb3ff" : "#0b3d91" },
      secondary: { main: isDark ? "#38bdf8" : "#0ea5e9" },
      background: {
        default: isDark ? "#0f172a" : "#f6f8fb",
        paper: isDark ? "#111c34" : "#ffffff",
      },
      text: {
        primary: isDark ? "#e5eefc" : "#0f172a",
        secondary: isDark ? "#a8b6cc" : "#475569",
      },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: ["Inter", "system-ui", "Segoe UI", "Roboto", "Arial"].join(","),
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      button: { textTransform: "none", fontWeight: 600 },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            border: isDark ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid rgba(15, 23, 42, 0.08)",
            boxShadow: isDark
              ? "0 14px 34px rgba(2, 6, 23, 0.34)"
              : "0 10px 30px rgba(2, 6, 23, 0.06)",
            backgroundImage: "none",
          },
        },
      },
    },
  });
}
