import { useNavigate, Link as RouterLink, useLocation } from "react-router-dom";
import { clearAuth, getAuth } from "../auth/auth";
import api from "../api/client";

import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import PeopleIcon from "@mui/icons-material/People";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import NoteAddIcon from "@mui/icons-material/NoteAdd";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

const drawerWidth = 260;

export default function AppShell({ children, colorMode = "light", onToggleColorMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const auth = getAuth();
  const role = String(auth?.role || "ANALYST").toUpperCase();
  const portalLabel = role === "ADMIN" ? "Admin Portal" : "Analyst Portal";

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore logout failures and still clear the local shell state.
    } finally {
      clearAuth();
      navigate("/login", { replace: true });
    }
  }

  function isActive(path) {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  }

  const navItemSx = (path) => ({
    mx: 1.2,
    mb: 0.5,
    borderRadius: 2,
    minHeight: 46,
    backgroundColor: isActive(path)
      ? (isDark ? "rgba(127, 179, 255, 0.16)" : "rgba(25, 118, 210, 0.10)")
      : "transparent",
    color: isActive(path) ? "primary.main" : "text.primary",
    "& .MuiListItemIcon-root": {
      color: isActive(path) ? "primary.main" : "text.secondary",
      minWidth: 38,
    },
    "&:hover": {
      backgroundColor: isDark ? "rgba(127, 179, 255, 0.10)" : "rgba(25, 118, 210, 0.08)",
    },
  });

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      {/* SIDEBAR */}
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: "border-box",
            borderRight: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "#e6eaf2"}`,
            background: isDark
              ? "linear-gradient(180deg, #111827 0%, #0f172a 100%)"
              : "linear-gradient(180deg, #ffffff 0%, #f9fbff 100%)",
          },
        }}
      >
        <Box sx={{ px: 2.5, py: 2.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              sx={{
                bgcolor: "primary.main",
                width: 42,
                height: 42,
              }}
            >
              <AccountBalanceIcon />
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Loan System
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {portalLabel}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Divider />

        <List sx={{ pt: 1.2 }}>
          <ListItemButton component={RouterLink} to="/" sx={navItemSx("/")}>
            <ListItemIcon><DashboardIcon /></ListItemIcon>
            <ListItemText primary="Dashboard" />
          </ListItemButton>

          <ListItemButton component={RouterLink} to="/applications" sx={navItemSx("/applications")}>
            <ListItemIcon><AssignmentIcon /></ListItemIcon>
            <ListItemText primary="Applications" />
          </ListItemButton>

          <ListItemButton component={RouterLink} to="/clients" sx={navItemSx("/clients")}>
            <ListItemIcon><PeopleIcon /></ListItemIcon>
            <ListItemText primary="Clients" />
          </ListItemButton>

          <Divider sx={{ my: 1.5, mx: 2 }} />

          <ListItemButton component={RouterLink} to="/clients/new" sx={navItemSx("/clients/new")}>
            <ListItemIcon><PersonAddIcon /></ListItemIcon>
            <ListItemText primary="New Client" />
          </ListItemButton>

          <ListItemButton component={RouterLink} to="/applications/new" sx={navItemSx("/applications/new")}>
            <ListItemIcon><NoteAddIcon /></ListItemIcon>
            <ListItemText primary="New Application" />
          </ListItemButton>

          {role === "ADMIN" && (
            <ListItemButton component={RouterLink} to="/admin" sx={navItemSx("/admin")}>
              <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
              <ListItemText primary="Admin" />
            </ListItemButton>
          )}
        </List>
      </Drawer>

      {/* RIGHT SIDE */}
      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* TOP BAR */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            bgcolor: isDark ? "rgba(15, 23, 42, 0.92)" : "rgba(255,255,255,0.92)",
            color: "text.primary",
            borderBottom: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "#e6eaf2"}`,
            backdropFilter: "blur(10px)",
          }}
        >
          <Toolbar sx={{ minHeight: "72px !important", px: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ flexGrow: 1 }}>
              Loan Management Dashboard
            </Typography>
            <Tooltip title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              <IconButton onClick={onToggleColorMode} color="primary" sx={{ mr: 1 }}>
                {colorMode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>
            <Button variant="outlined" onClick={logout}>
              Logout
            </Button>
          </Toolbar>
        </AppBar>

        {/* MAIN CONTENT */}
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            px: { xs: 2, md: 3 },
            py: 3,
          }}
        >
          <Box
            sx={{
              maxWidth: "100%",
              mx: "auto",
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
