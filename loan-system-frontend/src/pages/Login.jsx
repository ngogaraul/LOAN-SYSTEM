import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { isAuthed, saveAuth } from "../auth/auth";
import { useSnackbar } from "notistack";

import {
  Box, Paper, Typography, TextField, Button, Stack, Divider, Chip, ToggleButton, ToggleButtonGroup
} from "@mui/material";

const BANK_BG =
  "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=2000&q=80";

function defaultAuthConfig() {
  return {
    mode: "legacy",
    google_client_id: "",
    allowed_admin_emails: [],
    allowed_analyst_emails: [],
  };
}

export default function Login() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [portalRole, setPortalRole] = useState("ANALYST");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [authConfig, setAuthConfig] = useState(defaultAuthConfig);

  useEffect(() => {
    if (isAuthed()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const res = await api.get("/auth/config");
        if (!cancelled) {
          setAuthConfig({ ...defaultAuthConfig(), ...(res.data || {}) });
        }
      } catch {
        if (!cancelled) {
          setAuthConfig(defaultAuthConfig());
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) {
      enqueueSnackbar("Google sign-in failed", { variant: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/google", { credential: response.credential });
      saveAuth({
        ...res.data,
        role: String(res.data?.role || "").trim().toUpperCase(),
      });
      enqueueSnackbar("Welcome back!", { variant: "success" });
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Google sign-in failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar, navigate]);

  useEffect(() => {
    if (authConfig.mode !== "google" || !authConfig.google_client_id) {
      return undefined;
    }

    function initGoogleButton() {
      if (!window.google?.accounts?.id) {
        return;
      }
      window.google.accounts.id.initialize({
        client_id: authConfig.google_client_id,
        callback: handleGoogleCredential,
      });
      const buttonContainer = document.getElementById("google-signin-button");
      if (buttonContainer) {
        buttonContainer.innerHTML = "";
        window.google.accounts.id.renderButton(buttonContainer, {
          theme: "outline",
          size: "large",
          width: 320,
          text: "signin_with",
          shape: "pill",
        });
      }
      setGoogleReady(true);
    }

    const existingScript = document.querySelector('script[data-google-identity="true"]');
    if (existingScript) {
      initGoogleButton();
      return undefined;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = initGoogleButton;
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [authConfig.google_client_id, authConfig.mode, handleGoogleCredential]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });

      saveAuth({
        ...res.data,
        role: String(res.data?.role || "").trim().toUpperCase(),
      });

      enqueueSnackbar("Welcome back!", { variant: "success" });
      navigate("/", { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "Login failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  const allowedEmails = portalRole === "ADMIN"
    ? authConfig.allowed_admin_emails
    : authConfig.allowed_analyst_emails;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, md: 4 },
        py: 4,
        backgroundImage: `linear-gradient(rgba(2,6,23,0.72), rgba(15,23,42,0.82)), url(${BANK_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Paper
        sx={{
          width: "100%",
          maxWidth: 980,
          overflow: "hidden",
          borderRadius: 6,
          backdropFilter: "blur(12px)",
          background: "rgba(255,255,255,0.92)",
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.05fr 0.95fr" } }}>
          <Box
            sx={{
              p: { xs: 3, md: 5 },
              color: "#eff6ff",
              background: "linear-gradient(180deg, rgba(11,61,145,0.92) 0%, rgba(14,165,233,0.88) 100%)",
            }}
          >
            <Chip label="Loan System" size="small" sx={{ mb: 2, bgcolor: "rgba(255,255,255,0.16)", color: "white" }} />
            <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.05, mb: 2, fontSize: { xs: "2rem", md: "3rem" } }}>
              {portalRole === "ADMIN" ? "Loan Admin Portal" : "Loan Analyst Portal"}
            </Typography>
            <Typography variant="body1" sx={{ maxWidth: 420, opacity: 0.92, mb: 3 }}>
              Sign in with your {portalRole === "ADMIN" ? "admin" : "analyst"} account to access the system.
            </Typography>
          </Box>

          <Box sx={{ p: { xs: 3, md: 5 } }}>
            <Typography variant="h5" sx={{ mb: 0.5, color: "#0f172a", fontWeight: 700 }}>
              Sign in
            </Typography>
            <Typography variant="body2" sx={{ mb: 2.5, color: "#475569" }}>
              {authConfig.mode === "google"
                ? "Use your approved Google account to continue."
                : "Choose your portal and enter your account credentials."}
            </Typography>

            <Divider sx={{ mb: 2.5 }} />

            <ToggleButtonGroup
              exclusive
              fullWidth
              value={portalRole}
              onChange={(_, value) => {
                if (value) setPortalRole(value);
              }}
              color="primary"
              sx={{
                mb: 2.25,
                "& .MuiToggleButton-root": {
                  color: "#334155",
                  borderColor: "rgba(148, 163, 184, 0.35)",
                  backgroundColor: "#f8fafc",
                  fontWeight: 700,
                },
                "& .MuiToggleButton-root.Mui-selected": {
                  color: "#0b3d91",
                  backgroundColor: "rgba(11, 61, 145, 0.12)",
                },
                "& .MuiToggleButton-root.Mui-selected:hover": {
                  backgroundColor: "rgba(11, 61, 145, 0.18)",
                },
              }}
            >
              <ToggleButton value="ANALYST">Analyst</ToggleButton>
              <ToggleButton value="ADMIN">Admin</ToggleButton>
            </ToggleButtonGroup>

            {authConfig.mode === "google" ? (
              <Stack spacing={2.25}>
                <Typography variant="body2" sx={{ color: "#475569" }}>
                  Allowed {portalRole.toLowerCase()} emails: {allowedEmails?.join(", ") || "not configured"}
                </Typography>
                <Box
                  id="google-signin-button"
                  sx={{ minHeight: 44, display: "flex", alignItems: "center" }}
                />
                {!googleReady && (
                  <Typography variant="body2" sx={{ color: "#64748b" }}>
                    Loading Google sign-in...
                  </Typography>
                )}
              </Stack>
            ) : (
              <Box component="form" onSubmit={submit}>
                <Stack spacing={2.25}>
                  <TextField
                    label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    fullWidth
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        color: "#0f172a",
                        backgroundColor: "#ffffff",
                      },
                      "& .MuiInputLabel-root": {
                        color: "#64748b",
                      },
                      "& .MuiInputLabel-root.Mui-focused": {
                        color: "#0b3d91",
                      },
                    }}
                  />
                  <TextField
                    label="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                    fullWidth
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        color: "#0f172a",
                        backgroundColor: "#ffffff",
                      },
                      "& .MuiInputLabel-root": {
                        color: "#64748b",
                      },
                      "& .MuiInputLabel-root.Mui-focused": {
                        color: "#0b3d91",
                      },
                    }}
                  />

                  <Button type="submit" variant="contained" size="large" disabled={loading}>
                    {loading ? "Signing in..." : "Sign in"}
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
