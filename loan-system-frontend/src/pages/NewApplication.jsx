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
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  Grid,
  Chip,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function NewApplication() {
  const query = useQuery();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

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
  const [interestRate, setInterestRate] = useState("");
  const [creditline, setCreditline] = useState("");
  const [creditlineOptions, setCreditlineOptions] = useState([]);
  const [creditlineMode, setCreditlineMode] = useState("existing");
  const [purpose, setPurpose] = useState("");
  const [term, setTerm] = useState("");

  const [searchError, setSearchError] = useState("");
  const [creditlineError, setCreditlineError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const searchClients = useEffectEvent(async (text) => {
    if (!text || text.trim().length < 2) {
      setClientOptions([]);
      return;
    }

    setLoadingClients(true);
    setSearchError("");

    try {
      const res = await api.get("/clients", {
        params: { search: text.trim() },
      });
      setClientOptions(res.data.items || []);
    } catch {
      setSearchError("Failed to search clients.");
      enqueueSnackbar("Failed to search clients.", { variant: "error" });
    } finally {
      setLoadingClients(false);
    }
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      searchClients(clientSearch);
    }, 400);

    return () => clearTimeout(timer);
  }, [clientSearch]);

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
            phone: res.data.phone,
          },
        ]);

        setSelectedClient({
          id: res.data.id,
          account: res.data.account,
          full_name: res.data.full_name,
          phone: res.data.phone,
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
        setCreditlineMode("existing");
        setInterestRate("");
        setCreditlineError("");
        return;
      }

      setLoadingCreditlines(true);
      setCreditlineError("");

      try {
        const res = await api.get(`/clients/${selectedClientId}/creditlines`);
        const rows = Array.isArray(res.data) ? res.data : [];
        const available = rows.filter((row) => row?.creditline);

        setCreditlineOptions(available);

        const firstAvailable = available.find((row) => row?.is_available !== false) || available[0];

        if (firstAvailable) {
          setCreditline(firstAvailable.creditline);
          setCreditlineMode("existing");
          setInterestRate("");
        } else {
          setCreditline(buildDefaultCreditline(selectedClient || { id: selectedClientId }, rows));
          setCreditlineMode("new");
        }
      } catch {
        setCreditlineOptions([]);
        setCreditline(buildDefaultCreditline(selectedClient || { id: selectedClientId }));
        setCreditlineMode("new");
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

    if (creditlineMode === "new" && (!interestRate || Number(interestRate) <= 0)) {
      nextErrors.interestRate = "Interest rate must be greater than 0.";
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
        creditline_mode: creditlineMode,
        amount_requested: Number(amount),
        payment_plan: Number(paymentPlan),
        interest_rate: creditlineMode === "new" ? Number(interestRate) : 0,
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

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>
          Create New Application
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Build the application in the right order: select a borrower, choose the correct creditline, then capture the requested terms.
        </Typography>
      </Box>

      <Paper sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: 980, borderRadius: 3 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
              1. Select Client
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
                <CircularProgress size={24} sx={{ mt: { xs: 0, sm: 2 } }} />
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
                  {loadingClients ? "Searching..." : "Type at least 2 characters to search"}
                </MenuItem>
              ) : (
                clientOptions.map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.account} - {client.full_name}
                  </MenuItem>
                ))
              )}
            </TextField>
          </Box>

          {selectedClient ? (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 3,
                backgroundColor: theme.palette.mode === "dark" ? "rgba(59, 130, 246, 0.06)" : "rgba(239, 246, 255, 0.74)",
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {selectedClient.full_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Account {selectedClient.account} {selectedClient.phone ? `- ${selectedClient.phone}` : ""}
                  </Typography>
                </Box>
                <Chip label="Client selected" color="success" variant="outlined" />
              </Stack>
            </Paper>
          ) : (
            <Alert severity="info">
              Search and select a client before filling application details.
            </Alert>
          )}

          <Box>
            <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 700 }}>
              2. Application Details
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
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
              </Grid>

              <Grid item xs={12} md={6}>
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
              </Grid>

              {selectedClientId ? (
                <>
                  <Grid item xs={12}>
                    <Stack spacing={1}>
                      <Typography variant="body2" color="text.secondary">
                        Creditline Mode
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        value={creditlineMode}
                        onChange={(_, value) => {
                          if (!value) return;
                          setCreditlineMode(value);
                          setFieldErrors((prev) => ({ ...prev, creditline: "", interestRate: "" }));

                          if (value === "existing") {
                            const firstAvailable = creditlineOptions.find((row) => row?.is_available !== false) || creditlineOptions[0];
                            setCreditline(firstAvailable?.creditline || "");
                            setInterestRate("");
                          } else {
                            setCreditline(buildDefaultCreditline(selectedClient || { id: selectedClientId }, creditlineOptions));
                          }
                        }}
                        size="small"
                        orientation={isMobile ? "vertical" : "horizontal"}
                        fullWidth={isMobile}
                      >
                        <ToggleButton value="existing">Use Existing</ToggleButton>
                        <ToggleButton value="new">Create New</ToggleButton>
                      </ToggleButtonGroup>
                    </Stack>
                  </Grid>

                  {creditlineMode === "existing" ? (
                    <Grid item xs={12}>
                      <TextField
                        select
                        label="Existing Creditline"
                        value={creditline}
                        onChange={(e) => {
                          setCreditline(e.target.value);
                          setFieldErrors((prev) => ({ ...prev, creditline: "" }));
                        }}
                        fullWidth
                        error={!!fieldErrors.creditline}
                        helperText={fieldErrors.creditline || "Choose one of the client's creditlines."}
                        disabled={loadingCreditlines || creditlineOptions.length === 0}
                      >
                        {creditlineOptions.length === 0 ? (
                          <MenuItem value="">No creditlines found</MenuItem>
                        ) : (
                          creditlineOptions.map((option) => (
                            <MenuItem
                              key={option.id || option.creditline}
                              value={option.creditline}
                              disabled={option.is_available === false}
                            >
                              {option.creditline}
                              {option.is_available === false ? " (already linked)" : ""}
                            </MenuItem>
                          ))
                        )}
                      </TextField>
                    </Grid>
                  ) : (
                    <>
                      <Grid item xs={12} md={6}>
                        <TextField
                          label="New Creditline"
                          value={creditline}
                          onChange={(e) => {
                            setCreditline(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, creditline: "" }));
                          }}
                          fullWidth
                          error={!!fieldErrors.creditline}
                          helperText={fieldErrors.creditline || "A new creditline will be created for this application."}
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          label="Interest Rate"
                          type="number"
                          value={interestRate}
                          onChange={(e) => {
                            setInterestRate(e.target.value);
                            setFieldErrors((prev) => ({ ...prev, interestRate: "" }));
                          }}
                          placeholder="18"
                          fullWidth
                          error={!!fieldErrors.interestRate}
                          helperText={fieldErrors.interestRate || "Required when creating a new creditline."}
                        />
                      </Grid>
                    </>
                  )}

                  {creditlineError && (
                    <Grid item xs={12}>
                      <Alert severity="warning">{creditlineError}</Alert>
                    </Grid>
                  )}
                </>
              ) : (
                <Grid item xs={12}>
                  <Alert severity="info">
                    Select a client to load available creditlines.
                  </Alert>
                </Grid>
              )}

              <Grid item xs={12} md={7}>
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
              </Grid>

              <Grid item xs={12} md={5}>
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
              </Grid>
            </Grid>
          </Box>

          <Button
            variant="contained"
            size="large"
            onClick={submit}
            disabled={saving}
            fullWidth={isMobile}
          >
            {saving ? "Creating Application..." : "Create Application"}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
