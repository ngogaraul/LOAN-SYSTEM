import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { Box, Paper, Typography, TextField, Button, Stack, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export default function NewClient() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [account, setAccount] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  function validate() {
    const nextErrors = {};
    const cleanAccount = account.trim();
    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();

    if (!cleanAccount) {
      nextErrors.account = "Account number is required.";
    } else if (!/^\d+$/.test(cleanAccount)) {
      nextErrors.account = "Account number must contain digits only.";
    }

    if (!cleanName) {
      nextErrors.fullName = "Full name is required.";
    } else if (cleanName.length < 3) {
      nextErrors.fullName = "Full name must be at least 3 characters.";
    }

    if (!cleanPhone) {
      nextErrors.phone = "Phone number is required.";
    } else if (!/^\+?\d{9,15}$/.test(cleanPhone)) {
      nextErrors.phone = "Phone number must be 9 to 15 digits and may start with +.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submit() {
    if (!validate()) {
      enqueueSnackbar("Please fix the highlighted client fields.", { variant: "warning" });
      return;
    }
    setLoading(true);
    try {
      const res = await api.post("/clients", {
        account: account.trim(),
        full_name: fullName.trim(),
        phone: phone.trim(),
      });
      enqueueSnackbar("Client created successfully.", { variant: "success" });
      const clientId = res.data.client_id;
      navigate(`/clients/${clientId}`);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to create client";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Create Client</Typography>
      </Box>
      <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, maxWidth: 720, borderRadius: 3 }}>
        <Stack spacing={2}>
          <TextField
            label="Account (unique)"
            placeholder="10001"
            value={account}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, "");
              setAccount(digitsOnly);
              setErrors((prev) => ({ ...prev, account: "" }));
            }}
            error={!!errors.account}
            helperText={errors.account || "Numbers only."}
            inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
          />
          <TextField
            label="Full Name"
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setErrors((prev) => ({ ...prev, fullName: "" }));
            }}
            error={!!errors.fullName}
            helperText={errors.fullName}
          />
          <TextField
            label="Phone"
            placeholder="0780000000"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setErrors((prev) => ({ ...prev, phone: "" }));
            }}
            error={!!errors.phone}
            helperText={errors.phone || "Use digits only, or start with +."}
            inputProps={{ inputMode: "tel" }}
          />
          <Button variant="contained" onClick={submit} disabled={loading} fullWidth={isMobile}>
            {loading ? "Saving..." : "Create Client"}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
