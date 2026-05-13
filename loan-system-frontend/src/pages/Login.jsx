import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import {
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import api from "../api/client";
import { isAuthed, saveAuth } from "../auth/auth";

const BANK_BG =
  "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=2000&q=80";
const LOGO_SRC = "https://www.brr.rw/fileadmin/_processed_/8/7/csm_BNR_Logo_05_5474706df9.png";

function defaultAuthConfig() {
  return {
    mode: "legacy",
    allowed_admin_emails: [],
    allowed_analyst_emails: [],
    supabase_url: "",
    supabase_anon_key: "",
  };
}

function roleCopy(role) {
  return role === "ADMIN"
    ? {
        title: "Admin sign in",
        badge: "PRIVATE ACCESS",
        helper: "Enter the approved admin email. A one-time code will be sent there before access is granted.",
      }
    : {
        title: "Analyst sign in",
        badge: "PRIVATE ACCESS",
        helper: "Enter the approved analyst email. A one-time code will be sent there before access is granted.",
      };
}

export default function Login() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [portalRole, setPortalRole] = useState("ADMIN");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [brightMode, setBrightMode] = useState(true);
  const [authConfig, setAuthConfig] = useState(defaultAuthConfig);

  const supabase = useMemo(() => {
    if (authConfig.mode !== "email_otp" || !authConfig.supabase_url || !authConfig.supabase_anon_key) {
      return null;
    }
    return createClient(authConfig.supabase_url, authConfig.supabase_anon_key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }, [authConfig.mode, authConfig.supabase_anon_key, authConfig.supabase_url]);

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

  async function submitLegacy(e) {
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
      const msg = err?.response?.data?.message || err?.response?.data?.error || "Login failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    if (!supabase) {
      enqueueSnackbar("Email OTP is not configured", { variant: "error" });
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
        },
      });

      if (error) {
        throw error;
      }

      setOtpSent(true);
      enqueueSnackbar("A login code has been sent to that email.", { variant: "success" });
    } catch (err) {
      enqueueSnackbar(err?.message || "Failed to send login code", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    if (!supabase) {
      enqueueSnackbar("Email OTP is not configured", { variant: "error" });
      return;
    }

    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: otpCode.trim(),
        type: "email",
      });

      if (error) {
        throw error;
      }

      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        throw new Error("OTP verification did not return a session");
      }

      const res = await api.post("/auth/email-otp/exchange", { access_token: accessToken });
      saveAuth({
        ...res.data,
        role: String(res.data?.role || "").trim().toUpperCase(),
      });

      enqueueSnackbar("Welcome back!", { variant: "success" });
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || "Login failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  const copy = roleCopy(portalRole);
  const allowedEmails =
    portalRole === "ADMIN" ? authConfig.allowed_admin_emails : authConfig.allowed_analyst_emails;

  const pageBg = brightMode
    ? "linear-gradient(135deg, rgba(3,7,18,0.92) 0%, rgba(15,23,42,0.85) 55%, rgba(10,37,64,0.82) 100%)"
    : "linear-gradient(135deg, rgba(2,6,23,0.97) 0%, rgba(8,15,38,0.94) 60%, rgba(4,12,31,0.96) 100%)";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, md: 3 },
        py: 3,
        backgroundImage: `${pageBg}, url(${BANK_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 1180,
          minHeight: { xs: 680, md: 640 },
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(7, 16, 36, 0.94)",
          boxShadow: "0 28px 80px rgba(2, 6, 23, 0.45)",
        }}
      >
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.15fr 0.85fr" }, minHeight: "100%" }}>
          <Box
            sx={{
              p: { xs: 3, md: 4.5 },
              color: "#e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              background:
                "radial-gradient(circle at top left, rgba(37,99,235,0.26), transparent 34%), linear-gradient(180deg, rgba(9,16,35,0.96) 0%, rgba(12,22,48,0.98) 100%)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Avatar
                  src={LOGO_SRC}
                  alt="Bank logo"
                  sx={{ width: 74, height: 74, bgcolor: "#fff", border: "2px solid rgba(255,255,255,0.16)" }}
                />
                <Box>
                  <Typography sx={{ fontSize: 13, letterSpacing: "0.2em", color: "#cbd5e1", fontWeight: 700 }}>
                    {copy.badge}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 1,
                      fontFamily: '"Georgia", "Times New Roman", serif',
                      fontSize: { xs: 42, md: 54 },
                      lineHeight: 0.95,
                      fontWeight: 700,
                      color: "#f8fafc",
                    }}
                  >
                    {copy.title}
                  </Typography>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 1.25,
                  px: 1.4,
                  py: 0.8,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.07)",
                  color: "#f8fafc",
                }}
              >
                <Switch
                  checked={brightMode}
                  onChange={(e) => setBrightMode(e.target.checked)}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                      color: "#f8fafc",
                    },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: "#d2cc22",
                      opacity: 1,
                    },
                  }}
                />
                <Typography sx={{ fontFamily: '"Georgia", "Times New Roman", serif', fontSize: 16, fontWeight: 700 }}>
                  Day brightness
                </Typography>
              </Box>
            </Box>

            <Typography
              sx={{
                maxWidth: 610,
                color: "#dbe4f0",
                fontFamily: '"Georgia", "Times New Roman", serif',
                fontSize: { xs: 24, md: 33 },
                lineHeight: 1.55,
              }}
            >
              {authConfig.mode === "email_otp"
                ? copy.helper
                : `Sign in with your ${portalRole === "ADMIN" ? "admin" : "analyst"} account to access the system.`}
            </Typography>

            <Box
              sx={{
                mt: "auto",
                p: 2,
                borderRadius: 4,
                background: "rgba(148,163,184,0.08)",
                border: "1px solid rgba(148,163,184,0.14)",
              }}
            >
              <Typography sx={{ color: "#cbd5e1", fontSize: 13, mb: 1.2, letterSpacing: "0.08em", fontWeight: 700 }}>
                APPROVED EMAILS
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {allowedEmails?.length ? (
                  allowedEmails.map((allowedEmail) => (
                    <Chip
                      key={allowedEmail}
                      label={allowedEmail}
                      sx={{
                        color: "#eff6ff",
                        bgcolor: "rgba(30,41,59,0.72)",
                        border: "1px solid rgba(148,163,184,0.18)",
                      }}
                    />
                  ))
                ) : (
                  <Typography sx={{ color: "#94a3b8", fontSize: 14 }}>
                    No approved {portalRole.toLowerCase()} emails configured yet.
                  </Typography>
                )}
              </Stack>
            </Box>
          </Box>

          <Box
            sx={{
              p: { xs: 3, md: 4.5 },
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(180deg, rgba(12,19,38,0.96) 0%, rgba(8,14,30,0.98) 100%)",
            }}
          >
            <Box sx={{ width: "100%", maxWidth: 470 }}>
              <ToggleButtonGroup
                exclusive
                fullWidth
                value={portalRole}
                onChange={(_, value) => {
                  if (value) {
                    setPortalRole(value);
                    setOtpSent(false);
                    setOtpCode("");
                  }
                }}
                sx={{
                  mb: 3,
                  "& .MuiToggleButton-root": {
                    py: 1.2,
                    fontWeight: 700,
                    color: "#cbd5e1",
                    borderColor: "rgba(148,163,184,0.22)",
                    background: "rgba(15,23,42,0.9)",
                  },
                  "& .MuiToggleButton-root.Mui-selected": {
                    color: "#f8fafc",
                    background: "rgba(30,41,59,0.96)",
                  },
                  "& .MuiToggleButton-root.Mui-selected:hover": {
                    background: "rgba(30,41,59,0.96)",
                  },
                }}
              >
                <ToggleButton value="ADMIN">Admin</ToggleButton>
                <ToggleButton value="ANALYST">Analyst</ToggleButton>
              </ToggleButtonGroup>

              {authConfig.mode === "email_otp" ? (
                <Box component="form" onSubmit={verifyOtp}>
                  <Stack spacing={2.2}>
                    <TextField
                      label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      fullWidth
                      disabled={otpSent}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 3,
                          color: "#f8fafc",
                          backgroundColor: "rgba(30,41,59,0.82)",
                        },
                        "& .MuiInputLabel-root": {
                          color: "#94a3b8",
                        },
                        "& .MuiInputLabel-root.Mui-focused": {
                          color: "#e2e8f0",
                        },
                      }}
                    />

                    {otpSent && (
                      <TextField
                        label="Login code"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        autoComplete="one-time-code"
                        required
                        fullWidth
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            borderRadius: 3,
                            color: "#f8fafc",
                            backgroundColor: "rgba(30,41,59,0.82)",
                          },
                          "& .MuiInputLabel-root": {
                            color: "#94a3b8",
                          },
                          "& .MuiInputLabel-root.Mui-focused": {
                            color: "#e2e8f0",
                          },
                        }}
                      />
                    )}

                    {!otpSent ? (
                      <Button
                        type="button"
                        variant="contained"
                        size="large"
                        disabled={loading || !email.trim()}
                        onClick={sendOtp}
                        sx={{
                          mt: 1,
                          alignSelf: "flex-start",
                          px: 3.2,
                          py: 1.4,
                          borderRadius: 999,
                          background: "linear-gradient(180deg, #48556e 0%, #283347 100%)",
                          color: "#f8fafc",
                          fontFamily: '"Georgia", "Times New Roman", serif',
                          fontSize: 15,
                          fontWeight: 700,
                          textTransform: "none",
                          boxShadow: "none",
                        }}
                      >
                        {loading ? "Sending..." : "Send login code"}
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="submit"
                          variant="contained"
                          size="large"
                          disabled={loading || !otpCode.trim()}
                          sx={{
                            mt: 1,
                            alignSelf: "flex-start",
                            px: 3.2,
                            py: 1.4,
                            borderRadius: 999,
                            background: "linear-gradient(180deg, #48556e 0%, #283347 100%)",
                            color: "#f8fafc",
                            fontFamily: '"Georgia", "Times New Roman", serif',
                            fontSize: 15,
                            fontWeight: 700,
                            textTransform: "none",
                            boxShadow: "none",
                          }}
                        >
                          {loading ? "Verifying..." : "Verify code and continue"}
                        </Button>
                        <Button
                          type="button"
                          variant="text"
                          disabled={loading}
                          onClick={() => {
                            setOtpSent(false);
                            setOtpCode("");
                          }}
                          sx={{
                            alignSelf: "flex-start",
                            color: "#cbd5e1",
                            textTransform: "none",
                            fontWeight: 600,
                          }}
                        >
                          Use another email
                        </Button>
                      </>
                    )}
                  </Stack>
                </Box>
              ) : (
                <Box component="form" onSubmit={submitLegacy}>
                  <Stack spacing={2.2}>
                    <TextField
                      label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                      fullWidth
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 3,
                          color: "#f8fafc",
                          backgroundColor: "rgba(30,41,59,0.82)",
                        },
                        "& .MuiInputLabel-root": {
                          color: "#94a3b8",
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
                          borderRadius: 3,
                          color: "#f8fafc",
                          backgroundColor: "rgba(30,41,59,0.82)",
                        },
                        "& .MuiInputLabel-root": {
                          color: "#94a3b8",
                        },
                      }}
                    />
                    <Button
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={loading}
                      sx={{
                        mt: 1,
                        alignSelf: "flex-start",
                        px: 3.2,
                        py: 1.4,
                        borderRadius: 999,
                        background: "linear-gradient(180deg, #48556e 0%, #283347 100%)",
                        color: "#f8fafc",
                        fontFamily: '"Georgia", "Times New Roman", serif',
                        fontSize: 15,
                        fontWeight: 700,
                        textTransform: "none",
                        boxShadow: "none",
                      }}
                    >
                      {loading ? "Signing in..." : "Sign in"}
                    </Button>
                  </Stack>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
