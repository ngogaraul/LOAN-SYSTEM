import { useEffect, useMemo, useState } from "react";
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
  useMediaQuery,
  ListItem,
  Chip,
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
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import LogoutIcon from "@mui/icons-material/Logout";

const drawerWidth = 268;

export default function AppShell({ children, colorMode = "light", onToggleColorMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const isTabletUp = useMediaQuery(theme.breakpoints.up("md"));
  const isDark = theme.palette.mode === "dark";
  const auth = getAuth();
  const role = String(auth?.role || "ANALYST").toUpperCase();
  const portalLabel = role === "ADMIN" ? "Admin Portal" : "Analyst Portal";
  const [desktopNavOpen, setDesktopNavOpen] = useState(() => {
    const stored = localStorage.getItem("desktop-nav-open");
    return stored === null ? true : stored === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (path === "/") return "Dashboard";
    if (path.startsWith("/applications/new")) return "New Application";
    if (path.startsWith("/applications/")) return "Application Details";
    if (path.startsWith("/applications")) return "Applications";
    if (path.startsWith("/clients/new")) return "New Client";
    if (path.startsWith("/clients/")) return "Client Details";
    if (path.startsWith("/clients")) return "Clients";
    if (path.startsWith("/admin")) return "Administration";
    return "Loan Management";
  }, [location.pathname]);

  const navSections = [
    {
      label: "Workspace",
      items: [
        { to: "/", label: "Dashboard", icon: <DashboardIcon /> },
        { to: "/applications", label: "Applications", icon: <AssignmentIcon /> },
        { to: "/clients", label: "Clients", icon: <PeopleIcon /> },
      ],
    },
    {
      label: "Create",
      items: [
        { to: "/clients/new", label: "New Client", icon: <PersonAddIcon /> },
        { to: "/applications/new", label: "New Application", icon: <NoteAddIcon /> },
        ...(role === "ADMIN"
          ? [{ to: "/admin", label: "Admin", icon: <AdminPanelSettingsIcon /> }]
          : []),
      ],
    },
  ];

  const navItemSx = (path) => ({
    mx: 1.2,
    mb: 0.5,
    borderRadius: 2.25,
    minHeight: 50,
    backgroundColor: isActive(path)
      ? (isDark ? "rgba(127, 179, 255, 0.16)" : "rgba(25, 118, 210, 0.10)")
      : "transparent",
    color: isActive(path) ? "primary.main" : "text.primary",
    border: `1px solid ${
      isActive(path)
        ? (isDark ? "rgba(127, 179, 255, 0.24)" : "rgba(25, 118, 210, 0.18)")
        : "transparent"
    }`,
    "& .MuiListItemIcon-root": {
      color: isActive(path) ? "primary.main" : "text.secondary",
      minWidth: 38,
    },
    "&:hover": {
      backgroundColor: isDark ? "rgba(127, 179, 255, 0.10)" : "rgba(25, 118, 210, 0.08)",
      borderColor: isDark ? "rgba(127, 179, 255, 0.20)" : "rgba(25, 118, 210, 0.14)",
    },
  });

  useEffect(() => {
    localStorage.setItem("desktop-nav-open", String(desktopNavOpen));
  }, [desktopNavOpen]);

  function toggleNavigation() {
    if (isDesktop) {
      setDesktopNavOpen((current) => !current);
      return;
    }
    setMobileOpen((current) => !current);
  }

  const drawerContent = (
    <>
      <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
        <Box
          sx={{
            p: 2,
            borderRadius: 3,
            background: isDark
              ? "linear-gradient(160deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.82))"
              : "linear-gradient(160deg, rgba(240, 246, 255, 0.96), rgba(255, 255, 255, 0.88))",
            border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(37, 99, 235, 0.10)"}`,
            boxShadow: isDark ? "none" : "0 12px 30px rgba(15, 23, 42, 0.05)",
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              sx={{
                bgcolor: "primary.main",
                width: 46,
                height: 46,
                boxShadow: "0 8px 18px rgba(37, 99, 235, 0.22)",
              }}
            >
              <AccountBalanceIcon />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={800} noWrap>
                Loan System
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {portalLabel}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.75 }}>
            <Chip size="small" color="primary" variant={isDark ? "filled" : "outlined"} label={role} />
            <Chip size="small" variant="outlined" label={colorMode === "dark" ? "Night mode" : "Day mode"} />
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.5 }}>
            {role === "ADMIN" ? "Operations and approvals" : "Assessment workspace"}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2 }} />

      <List sx={{ pt: 1.2, pb: 0, flexGrow: 1 }}>
        {navSections.map((section) => (
          <Box key={section.label} sx={{ mb: 1 }}>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 2.5, display: "block", letterSpacing: "0.12em" }}
            >
              {section.label}
            </Typography>
            {section.items.map((item) => (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                sx={navItemSx(item.to)}
                onClick={() => setMobileOpen(false)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.label}
                  secondary={isActive(item.to) ? "Current section" : null}
                  secondaryTypographyProps={{ variant: "caption" }}
                />
              </ListItemButton>
            ))}
          </Box>
        ))}
      </List>

      <Divider />

      <List sx={{ py: 1.2 }}>
        <ListItem sx={{ px: 2.2, pt: 0.5 }}>
          <Button
            fullWidth
            variant={isDesktop ? "contained" : "outlined"}
            color="inherit"
            onClick={logout}
            startIcon={<LogoutIcon />}
          >
            Logout
          </Button>
        </ListItem>
      </List>
    </>
  );

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
        backgroundImage: isDark
          ? "radial-gradient(circle at top left, rgba(59, 130, 246, 0.08), transparent 34%), radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.06), transparent 26%)"
          : "radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 30%), radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.06), transparent 22%)",
      }}
    >
      {isDesktop && (
        <Box
          sx={{
            width: desktopNavOpen ? drawerWidth : 0,
            flexShrink: 0,
            overflow: "hidden",
            transition: theme.transitions.create("width", {
              duration: theme.transitions.duration.standard,
            }),
          }}
        >
          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              [`& .MuiDrawer-paper`]: {
                position: "relative",
                width: drawerWidth,
                boxSizing: "border-box",
                borderRight: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "#e6eaf2"}`,
                background: isDark
                  ? "linear-gradient(180deg, #111827 0%, #0f172a 100%)"
                  : "linear-gradient(180deg, #ffffff 0%, #f9fbff 100%)",
              },
            }}
          >
            {drawerContent}
          </Drawer>
        </Box>
      )}

      {!isDesktop && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", lg: "none" },
            [`& .MuiDrawer-paper`]: {
              width: { xs: "86vw", sm: 320 },
              maxWidth: 340,
              boxSizing: "border-box",
              borderRight: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "#e6eaf2"}`,
              background: isDark
                ? "linear-gradient(180deg, #111827 0%, #0f172a 100%)"
                : "linear-gradient(180deg, #ffffff 0%, #f9fbff 100%)",
            },
          }}
        >
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              px: 1.5,
              pt: 1.2,
            }}
          >
            <Typography variant="subtitle2" color="text.secondary" sx={{ pl: 1 }}>
              Navigation
            </Typography>
            <IconButton onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <ChevronLeftIcon />
            </IconButton>
          </Box>
          {drawerContent}
        </Drawer>
      )}

      <Box sx={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
          <Toolbar
            sx={{
              minHeight: { xs: "74px !important", md: "78px !important" },
              px: { xs: 1.25, sm: 2.5, md: 3 },
              gap: 1,
            }}
          >
            {!isDesktop && (
              <IconButton
                edge="start"
                aria-label="Toggle navigation"
                onClick={toggleNavigation}
                color="primary"
                sx={{
                  border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(37, 99, 235, 0.16)"}`,
                  borderRadius: 2.5,
                }}
              >
                <MenuIcon />
              </IconButton>
            )}
            {isDesktop && (
              <IconButton
                edge="start"
                aria-label="Toggle navigation"
                onClick={toggleNavigation}
                color="primary"
                sx={{
                  border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(37, 99, 235, 0.16)"}`,
                  borderRadius: 2.5,
                }}
              >
                <MenuIcon />
              </IconButton>
            )}

            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                <Typography variant={isTabletUp ? "h6" : "subtitle1"} fontWeight={800} noWrap>
                  {pageTitle}
                </Typography>
                {isTabletUp && (
                  <Chip size="small" variant="outlined" color="primary" label={portalLabel} />
                )}
              </Stack>
              {!isDesktop && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                  {portalLabel}
                </Typography>
              )}
            </Box>

            <Stack direction="row" spacing={0.5} alignItems="center">
              <Tooltip title={colorMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
                <IconButton
                  onClick={onToggleColorMode}
                  color="primary"
                  sx={{
                    border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(37, 99, 235, 0.16)"}`,
                    borderRadius: 2.5,
                  }}
                >
                  {colorMode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
              </Tooltip>

              {isTabletUp ? (
                <Button variant="outlined" onClick={logout} startIcon={<LogoutIcon />}>
                  Logout
                </Button>
              ) : (
                <Tooltip title="Logout">
                  <IconButton
                    onClick={logout}
                    color="primary"
                    sx={{
                      border: `1px solid ${isDark ? "rgba(148, 163, 184, 0.18)" : "rgba(37, 99, 235, 0.16)"}`,
                      borderRadius: 2.5,
                    }}
                  >
                    <LogoutIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            px: { xs: 1.25, sm: 2, md: 3 },
            py: { xs: 1.5, md: 3 },
          }}
        >
          <Box sx={{ maxWidth: 1400, mx: "auto" }}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
