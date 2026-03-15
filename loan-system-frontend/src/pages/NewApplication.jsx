import { useEffect, useState, useEffectEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { buildDefaultCreditline, calculateTermMonths } from "../utils/application";

import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  CircularProgress,
  MenuItem,
  Alert
} from "@mui/material";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function NewApplication() {
  const query = useQuery();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const preClientId = query.get("client_id") || "";

  const [clientSearch, setClientSearch] = useState("");
  const [clientOptions, setClientOptions] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState(preClientId);
  const [selectedClient, setSelectedClient] = useState(null);

  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingCreditlines, setLoadingCreditlines] = useState(false);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState("");
  const [paymentPlan, setPaymentPlan] = useState("");
  const [creditline, setCreditline] = useState("");
  const [creditlineOptions, setCreditlineOptions] = useState([]);
  const [creditlineSource, setCreditlineSource] = useState("generated");
  const [purpose, setPurpose] = useState("");
  const [term, setTerm] = useState("");

  const [searchError, setSearchError] = useState("");
  const [creditlineError, setCreditlineError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  /* ---------------------------
     CLIENT SEARCH
  ----------------------------*/

  const searchClients = useEffectEvent(async (text) => {
    if (!text || text.trim().length < 2) {
      setClientOptions([]);
      return;
    }

    setLoadingClients(true);
    setSearchError("");

    try {
      const res = await api.get("/clients", {
        params: { search: text.trim() }
      });

      // FIX: backend returns paginated response
      setClientOptions(res.data.items || []);
    } catch {
      setSearchError("Failed to search clients.");
      enqueueSnackbar("Failed to search clients.", { variant: "error" });
    } finally {
      setLoadingClients(false);
    }
  });

  /* ---------------------------
     AUTO SEARCH (DEBOUNCE)
  ----------------------------*/

  useEffect(() => {
    const timer = setTimeout(() => {
      searchClients(clientSearch);
    }, 400);

    return () => clearTimeout(timer);
  }, [clientSearch]);

  /* ---------------------------
     PREFILL CLIENT IF PROVIDED
  ----------------------------*/

  useEffect(() => {
    if (!preClientId) return;

    (async () => {
      try {
        const res = await api.get(`/clients/${preClientId}`);

        setClientOptions([
          {
            id: res.data.id,
            account: res.data.account,
            full_name: res.data.full_name,
            phone: res.data.phone
          }
        ]);

        setSelectedClient({
          id: res.data.id,
          account: res.data.account,
          full_name: res.data.full_name,
          phone: res.data.phone
        });
        setSelectedClientId(res.data.id);
      } catch {
        enqueueSnackbar("Failed to load client.", { variant: "error" });
      }
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    const client =
      clientOptions.find((option) => String(option.id) === String(selectedClientId)) || null;
    setSelectedClient(client);
  }, [clientOptions, selectedClientId]);

  useEffect(() => {
    async function loadCreditlines() {
      if (!selectedClientId) {
        setCreditlineOptions([]);
        setCreditline("");
        setCreditlineSource("generated");
        setCreditlineError("");
        return;
      }

      setLoadingCreditlines(true);
      setCreditlineError("");

      try {
        const res = await api.get(`/clients/${selectedClientId}/creditlines`);
        const rows = Array.isArray(res.data) ? res.data : [];
        const available = rows.filter((row) => row?.creditline && row?.is_available !== false);

        setCreditlineOptions(available);

        if (available.length > 0) {
          setCreditline(available[0].creditline);
          setCreditlineSource("existing");
        } else {
          setCreditline(buildDefaultCreditline(selectedClient || { id: selectedClientId }));
          setCreditlineSource("generated");
        }
      } catch {
        setCreditlineOptions([]);
        setCreditline(buildDefaultCreditline(selectedClient || { id: selectedClientId }));
        setCreditlineSource("generated");
        setCreditlineError("Failed to load client creditlines. A default creditline will be used.");
      } finally {
        setLoadingCreditlines(false);
      }
    }

    loadCreditlines();
  }, [selectedClient, selectedClientId]);

  useEffect(() => {
    setTerm(calculateTermMonths(amount, paymentPlan));
  }, [amount, paymentPlan]);

  /* ---------------------------
     SUBMIT APPLICATION
  ----------------------------*/

  async function submit() {
    const nextErrors = {};

    if (!selectedClientId) {
      nextErrors.client = "Please select a client.";
    }

    if (!amount || Number(amount) <= 0) {
      nextErrors.amount = "Amount must be greater than 0.";
    }

    if (!creditline.trim()) {
      nextErrors.creditline = "Creditline is required.";
    }

    if (!paymentPlan || Number(paymentPlan) <= 0) {
      nextErrors.paymentPlan = "Payment plan must be greater than 0.";
    }

    if (!purpose.trim()) {
      nextErrors.purpose = "Purpose is required.";
    }

    if (!term || Number(term) <= 0) {
      nextErrors.term = "Term must be greater than 0.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      enqueueSnackbar("Please fix the highlighted application fields.", { variant: "warning" });
      return;
    }

    setSaving(true);

    try {
      await api.post("/applications", {
        client_id: Number(selectedClientId),
        creditline: creditline.trim(),
        amount_requested: Number(amount),
        payment_plan: Number(paymentPlan),
        purpose: purpose.trim(),
        term_requested: Number(term),
      });

      enqueueSnackbar("Application created successfully.", { variant: "success" });

      navigate("/");
    } catch (e) {
      const msg =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        "Failed to create application";

      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------
     UI
  ----------------------------*/

  return (
    <Box>

      {/* PAGE HEADER */}

      <Typography variant="h5" sx={{ mb: 2 }}>
        Create New Application
      </Typography>

      <Paper sx={{ p: 3, maxWidth: 760 }}>

        <Stack spacing={3}>

          {/* CLIENT SELECTION */}

          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Select Client
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>

              <TextField
                label="Search client"
                placeholder="Type account or name..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                sx={{ flex: 1 }}
              />

              {loadingClients && (
                <CircularProgress size={24} sx={{ mt: 2 }} />
              )}

            </Stack>

            {searchError && (
              <Typography color="error" sx={{ mt: 1 }}>
                {searchError}
              </Typography>
            )}

            {fieldErrors.client && (
              <Typography color="error" sx={{ mt: 1 }}>
                {fieldErrors.client}
              </Typography>
            )}

            <TextField
              select
              fullWidth
              label="Client"
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              sx={{ mt: 2 }}
            >
              {clientOptions.length === 0 ? (
                <MenuItem value="">
                  {loadingClients
                    ? "Searching..."
                    : "Type at least 2 characters to search"}
                </MenuItem>
              ) : (
                clientOptions.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.account} — {c.full_name}
                  </MenuItem>
                ))
              )}
            </TextField>
          </Box>

          {!selectedClientId && (
            <Alert severity="info">
              Search and select a client before filling application details.
            </Alert>
          )}

          {/* APPLICATION DETAILS */}

          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Application Details
            </Typography>

            <Stack spacing={2}>

              <TextField
                label="Amount Requested"
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, amount: "", term: "" }));
                }}
                placeholder="2000000"
                fullWidth
                error={!!fieldErrors.amount}
                helperText={fieldErrors.amount}
              />

              {selectedClientId ? (
                <>
                  {creditlineOptions.length > 0 ? (
                    <TextField
                      select
                      label="Creditline"
                      value={creditline}
                      onChange={(e) => {
                        setCreditline(e.target.value);
                        setCreditlineSource("existing");
                        setFieldErrors((prev) => ({ ...prev, creditline: "" }));
                      }}
                      fullWidth
                      error={!!fieldErrors.creditline}
                      helperText={
                        fieldErrors.creditline ||
                        "Available creditlines for this client."
                      }
                      disabled={loadingCreditlines}
                    >
                      {creditlineOptions.map((option) => (
                        <MenuItem key={option.id || option.creditline} value={option.creditline}>
                          {option.creditline}
                        </MenuItem>
                      ))}
                    </TextField>
                  ) : (
                    <TextField
                      label="Creditline"
                      value={creditline}
                      fullWidth
                      InputProps={{ readOnly: true }}
                      error={!!fieldErrors.creditline}
                      helperText={
                        fieldErrors.creditline ||
                        "No existing creditline found. A default one will be created automatically."
                      }
                    />
                  )}

                  {creditlineError && (
                    <Alert severity="warning">{creditlineError}</Alert>
                  )}

                  {creditlineSource === "generated" && !creditlineError && (
                    <Alert severity="info">
                      This client has no available creditline yet. The application will create and use `{creditline}`.
                    </Alert>
                  )}
                </>
              ) : (
                <Alert severity="info">
                  Select a client to load available creditlines.
                </Alert>
              )}

              <TextField
                label="Payment Plan"
                type="number"
                value={paymentPlan}
                onChange={(e) => {
                  setPaymentPlan(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, paymentPlan: "", term: "" }));
                }}
                placeholder="150000"
                fullWidth
                error={!!fieldErrors.paymentPlan}
                helperText={fieldErrors.paymentPlan}
              />

              <TextField
                label="Purpose"
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, purpose: "" }));
                }}
                placeholder="Business expansion"
                fullWidth
                error={!!fieldErrors.purpose}
                helperText={fieldErrors.purpose}
              />

              <TextField
                label="Term Requested (months)"
                type="number"
                value={term}
                InputProps={{ readOnly: true }}
                placeholder="12"
                fullWidth
                error={!!fieldErrors.term}
                helperText={
                  fieldErrors.term ||
                  "Auto-calculated as Amount Requested divided by Payment Plan."
                }
              />

            </Stack>
          </Box>

          {/* SUBMIT BUTTON */}

          <Button
            variant="contained"
            size="large"
            onClick={submit}
            disabled={saving}
          >
            {saving ? "Creating Application..." : "Create Application"}
          </Button>

        </Stack>

      </Paper>

    </Box>
  );
}
