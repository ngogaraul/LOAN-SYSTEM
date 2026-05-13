import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "notistack";
import {
  Avatar,
  Box,
  Button,
  Paper,
  Stack,
  Switch,
  TextField,
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
    email_code_length: 6,
  };
}

export default function Login() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [brightMode, setBrightMode] = useState(true);
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
    if (!email.trim()) {
      enqueueSnackbar("Email is required", { variant: "error" });
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/request-code", { email: email.trim().toLowerCase() });

      setOtpSent(true);
      enqueueSnackbar("A login code has been sent to your email.", { variant: "success" });
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || "Failed to send login code";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    if (!otpCode.trim()) {
      enqueueSnackbar("Login code is required", { variant: "error" });
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/verify-code", {
        email: email.trim().toLowerCase(),
        code: otpCode.trim(),
      });
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

  const pageBg = brightMode
    ? "linear-gradient(135deg, rgba(4,10,24,0.90) 0%, rgba(11,24,51,0.86) 55%, rgba(18,39,72,0.82) 100%)"
    : "linear-gradient(135deg, rgba(3,7,18,0.96) 0%, rgba(7,16,36,0.94) 55%, rgba(5,14,31,0.97) 100%)";

  const otpMode = authConfig.mode === "email_code";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: { xs: 2, md: 3 },
        py: 4,
        backgroundImage: `${pageBg}, url(${BANK_BG})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 760,
          borderRadius: 7,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "linear-gradient(180deg, rgba(8,16,35,0.96) 0%, rgba(9,19,42,0.98) 100%)",
          boxShadow: "0 28px 80px rgba(2, 6, 23, 0.45)",
        }}
      >
        <Box sx={{ p: { xs: 3, md: 4.5 } }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2, mb: 3.5, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Avatar
                src={LOGO_SRC}
                alt="Bank logo"
                sx={{ width: 74, height: 74, bgcolor: "#fff", border: "2px solid rgba(255,255,255,0.16)" }}
              />
              <Box>
                <Typography sx={{ fontSize: 13, letterSpacing: "0.18em", color: "#d5deea", fontWeight: 700 }}>
                  PRIVATE ACCESS
                </Typography>
                <Typography
                  sx={{
                    mt: 1,
                    fontFamily: '"Georgia", "Times New Roman", serif',
                    fontSize: { xs: 36, md: 54 },
                    lineHeight: 0.96,
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {otpMode ? "Secure sign in" : "Sign in"}
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
              maxWidth: 620,
              color: "#dbe4f0",
              fontFamily: '"Georgia", "Times New Roman", serif',
              fontSize: { xs: 22, md: 34 },
              lineHeight: 1.55,
              mb: 3.5,
            }}
          >
            {otpMode
              ? "Enter your approved email. A one-time code will be sent there before access is granted."
              : "Use your existing account credentials to continue into the system."}
          </Typography>

          {otpMode ? (
            <Box component="form" onSubmit={verifyOtp}>
              <Stack spacing={2.4}>
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
                      borderRadius: 3.5,
                      color: "#f8fafc",
                      backgroundColor: "rgba(34,44,66,0.92)",
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
                    inputProps={{ maxLength: Number(authConfig.email_code_length || 6) }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 3.5,
                        color: "#f8fafc",
                        backgroundColor: "rgba(34,44,66,0.92)",
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
                      mt: 0.6,
                      alignSelf: "flex-start",
                      minWidth: 180,
                      px: 3.2,
                      py: 1.45,
                      borderRadius: 999,
                      background: "linear-gradient(180deg, #4b576f 0%, #2b3446 100%)",
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
                        mt: 0.6,
                        alignSelf: "flex-start",
                        minWidth: 220,
                        px: 3.2,
                        py: 1.45,
                        borderRadius: 999,
                        background: "linear-gradient(180deg, #4b576f 0%, #2b3446 100%)",
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
              <Stack spacing={2.4}>
                <TextField
                  label="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  fullWidth
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 3.5,
                      color: "#f8fafc",
                      backgroundColor: "rgba(34,44,66,0.92)",
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
                      borderRadius: 3.5,
                      color: "#f8fafc",
                      backgroundColor: "rgba(34,44,66,0.92)",
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
                    mt: 0.6,
                    alignSelf: "flex-start",
                    minWidth: 180,
                    px: 3.2,
                    py: 1.45,
                    borderRadius: 999,
                    background: "linear-gradient(180deg, #4b576f 0%, #2b3446 100%)",
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
      </Paper>
    </Box>
  );
}
