import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box,
  Typography,
  Paper,
  Divider,
  Grid,
  Stack,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";

function statusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "success";
  if (s === "SUSPENDED") return "warning";
  if (s === "CLOSED") return "default";
  return "default";
}

function fmtMoney(x) {
  if (x === null || x === undefined || x === "") return "-";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}

function toNum(v) {
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function mode(values) {
  const cleaned = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!cleaned.length) return 0;
  const counts = new Map();
  for (const v of cleaned) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = cleaned[0];
  let bestCount = 0;
  for (const [k, c] of counts.entries()) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

function earliestDate(values) {
  const dates = values
    .map((v) => (v ? new Date(v) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!dates.length) return "";
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  return min.toISOString().slice(0, 10);
}

function aggregateCreditlines(rows) {
  if (!rows || rows.length === 0) {
    return {
      outstanding: "",
      payment_plan: "",
      remaining_period: "",
      periodicity: "",
      class_value: "",
      compulsory_saving: "",
      voluntary_saving: "",
      salary: "",
      duration: "",
      start_date: "",
    };
  }

  return {
    outstanding: rows.reduce((s, r) => s + toNum(r.outstanding), 0),
    payment_plan: rows.reduce((s, r) => s + toNum(r.payment_plan), 0),
    remaining_period: Math.max(...rows.map((r) => toNum(r.remaining_period))),
    periodicity: mode(rows.map((r) => r.periodicity ?? 0)),
    class_value: mode(rows.map((r) => r.class_value ?? 0)),
    compulsory_saving: rows.reduce((s, r) => s + toNum(r.compulsory_saving), 0),
    voluntary_saving: rows.reduce((s, r) => s + toNum(r.voluntary_saving), 0),
    salary: Math.max(...rows.map((r) => toNum(r.salary))),
    duration: Math.max(...rows.map((r) => toNum(r.duration))),
    start_date: earliestDate(rows.map((r) => r.start_date)),
  };
}

export default function ClientDetails() {
  const { id } = useParams();
  const { enqueueSnackbar } = useSnackbar();

  const [tab, setTab] = useState(0);

  const [data, setData] = useState(null);
  const [creditlines, setCreditlines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [creditlinesLoading, setCreditlinesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // aggregated financial form
  const [form, setForm] = useState({
    outstanding: "",
    payment_plan: "",
    remaining_period: "",
    periodicity: "",
    class_value: "",
    compulsory_saving: "",
    voluntary_saving: "",
    salary: "",
    duration: "",
    start_date: "",
  });

  // profile edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [profile, setProfile] = useState({ full_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  async function loadClient() {
    const res = await api.get(`/clients/${id}`);
    setData(res.data);

    setProfile({
      full_name: res.data.full_name || "",
      phone: res.data.phone || "",
    });

    // keep backend aggregated financials if they exist,
    // but we will overwrite with derived creditline aggregation if creditlines load
    const fin = res.data.financials || {};
    setForm({
      outstanding: fin.outstanding ?? "",
      payment_plan: fin.payment_plan ?? "",
      remaining_period: fin.remaining_period ?? "",
      periodicity: fin.periodicity ?? "",
      class_value: fin.class_value ?? "",
      compulsory_saving: fin.compulsory_saving ?? "",
      voluntary_saving: fin.voluntary_saving ?? "",
      salary: fin.salary ?? "",
      duration: fin.duration ?? "",
      start_date: fin.start_date ?? "",
    });
  }

  async function loadCreditlines() {
    setCreditlinesLoading(true);
    try {
      const res = await api.get(`/clients/${id}/creditlines`);
      const rows = res.data || [];
      setCreditlines(rows);

      // ✅ fill aggregated financials from raw creditlines
      const agg = aggregateCreditlines(rows);
      setForm(agg);
    } catch (e) {
      setCreditlines([]);
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Failed to load creditlines";
      enqueueSnackbar(msg, { variant: "warning" });
    } finally {
      setCreditlinesLoading(false);
    }
  }

  async function loadAll() {
    setErr("");
    setLoading(true);
    try {
      await loadClient();
      await loadCreditlines();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Failed to load client";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveFinancials() {
    setSaving(true);
    try {
      await api.put(`/clients/${id}/financials`, form);
      enqueueSnackbar("Financials updated.", { variant: "success" });
      await loadAll();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await api.put(`/clients/${id}`, profile);
      enqueueSnackbar("Client profile updated.", { variant: "success" });
      setEditOpen(false);
      await loadAll();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (err && !data) return <Alert severity="error">{err}</Alert>;

  return (
    <Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5">
            Client: {data.account} — {data.full_name}{" "}
            <Chip
              size="small"
              label={data.status || "ACTIVE"}
              color={statusColor(data.status)}
              sx={{ ml: 1 }}
            />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Phone: {data.phone || "-"}
          </Typography>
        </Box>

        <Tooltip title="Edit profile">
          <IconButton onClick={() => setEditOpen(true)}>
            <EditIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Profile" />
          <Tab label="Aggregated Financials" />
          <Tab label="Creditlines" />
        </Tabs>
      </Paper>

      {/* PROFILE */}
      {tab === 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Profile</Typography>
          <Divider sx={{ my: 1 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Typography><b>Account:</b> {data.account}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography><b>Name:</b> {data.full_name}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography><b>Phone:</b> {data.phone || "-"}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography><b>Status:</b> {data.status || "ACTIVE"}</Typography>
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* AGGREGATED FINANCIALS */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Aggregated Financials</Typography>
          <Typography variant="body2" color="text.secondary">
            These fields are what the model uses to score the client.
          </Typography>
          <Divider sx={{ my: 1 }} />

          <Grid container spacing={2}>
            {Object.entries(form).map(([k, v]) => (
              <Grid item xs={12} md={4} key={k}>
                <TextField
                  fullWidth
                  label={k.replaceAll("_", " ")}
                  value={v}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, [k]: e.target.value }))
                  }
                />
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button variant="outlined" onClick={loadAll} disabled={saving}>
              Reset
            </Button>
            <Button variant="contained" onClick={saveFinancials} disabled={saving}>
              {saving ? "Saving..." : "Save Financials"}
            </Button>
          </Stack>
        </Paper>
      )}

      {/* CREDITLINES */}
      {tab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Creditlines (Raw)</Typography>
            <Button variant="outlined" onClick={loadCreditlines} disabled={creditlinesLoading}>
              {creditlinesLoading ? "Loading..." : "Refresh"}
            </Button>
          </Stack>
          <Divider sx={{ my: 1 }} />

          {creditlines.length === 0 ? (
            <Alert severity="info">No creditlines found for this client.</Alert>
          ) : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" sx={{ minWidth: 1500 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Account</TableCell>
                    <TableCell>Creditline</TableCell>
                    <TableCell align="right">Outstanding</TableCell>
                    <TableCell align="right">Principal Arrears</TableCell>
                    <TableCell align="right">Interest Arrears</TableCell>
                    <TableCell align="right">Payment plan</TableCell>
                    <TableCell align="right">Days in arrears</TableCell>
                    <TableCell>Start date</TableCell>
                    <TableCell align="right">Duration</TableCell>
                    <TableCell align="right">Remaining</TableCell>
        
                    <TableCell align="right">Periodicity</TableCell>
                    <TableCell align="right">Class</TableCell>
                    <TableCell align="right">Compulsory saving</TableCell>
                    <TableCell align="right">Voluntary saving</TableCell>
                    <TableCell align="right">Salary</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {creditlines.map((cl, idx) => (
                    <TableRow key={cl.id || `${cl.creditline}-${idx}`}>
                      <TableCell>{data.account || "-"}</TableCell>
                      <TableCell>{cl.creditline || "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.outstanding)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.principal_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.interest_arrears)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.payment_plan)}</TableCell>
                      <TableCell align="right">{cl.days_in_arrears ?? "-"}</TableCell>
                      <TableCell>{cl.start_date || "-"}</TableCell>
                      <TableCell align="right">{cl.duration ?? "-"}</TableCell>
                      <TableCell align="right">{cl.remaining_period ?? "-"}</TableCell>
                    
                      <TableCell align="right">{cl.periodicity ?? "-"}</TableCell>
                      <TableCell align="right">{cl.class_value ?? "-"}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.compulsory_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.voluntary_saving)}</TableCell>
                      <TableCell align="right">{fmtMoney(cl.salary)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Raw creditlines are loaded from the dataset. Aggregated Financials above are derived from these rows and used for ML scoring.
          </Typography>
        </Paper>
      )}

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Client Profile</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Full name"
              value={profile.full_name}
              onChange={(e) =>
                setProfile((p) => ({ ...p, full_name: e.target.value }))
              }
            />
            <TextField
              label="Phone"
              value={profile.phone}
              onChange={(e) =>
                setProfile((p) => ({ ...p, phone: e.target.value }))
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}