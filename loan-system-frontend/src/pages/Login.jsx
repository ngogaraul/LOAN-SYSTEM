import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { isAuthed, saveAuth } from "../auth/auth";
import { useSnackbar } from "notistack";

import {
  Box, Paper, Typography, TextField, Button, Stack, Divider, Chip, ToggleButton, ToggleButtonGroup
} from "@mui/material";

const BANK_BG =
  "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=2000&q=80";

export default function Login() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [portalRole, setPortalRole] = useState("ANALYST");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthed()) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { email, password });

      // expected: { token, role, name, user_id }
      // ✅ normalize role so UI permissions work reliably
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
              Choose your portal and enter your account credentials.
            </Typography>

            <Divider sx={{ mb: 2.5 }} />

            <Box component="form" onSubmit={submit}>
              <Stack spacing={2.25}>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={portalRole}
                  onChange={(_, value) => {
                    if (value) setPortalRole(value);
                  }}
                  color="primary"
                  sx={{
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
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
