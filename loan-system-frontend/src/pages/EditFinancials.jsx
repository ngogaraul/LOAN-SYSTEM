import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box, Paper, Typography, Grid, TextField, Button, Stack, CircularProgress
} from "@mui/material";

export default function EditFinancials() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [client, setClient] = useState(null);

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
    start_date: "", // YYYY-MM-DD
  });

  async function load() {
    setLoading(true);
    try {
      const res = await api.get(`/clients/${id}`);
      setClient(res.data);
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
        start_date: fin.start_date ? String(fin.start_date).slice(0, 10) : "",
      });
    } catch {
      enqueueSnackbar("Failed to load client.", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line

  function setField(k, v) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      // send only fields you want to update
      const payload = { ...form };

      // convert numeric fields safely (backend accepts numbers)
      const numericFields = [
        "outstanding", "payment_plan", "remaining_period", "periodicity", "class_value",
        "compulsory_saving", "voluntary_saving", "salary", "duration"
      ];
      for (const f of numericFields) {
        if (payload[f] === "") delete payload[f];
        else payload[f] = Number(payload[f]);
      }
      if (!payload.start_date) delete payload.start_date;

      await api.put(`/clients/${id}/financials`, payload);
      enqueueSnackbar("Financials updated.", { variant: "success" });

      // go create application
      navigate(`/applications/new?client_id=${id}`);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.message || "Failed to update financials";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 1 }}>Edit Financials</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Client: {client?.account} — {client?.full_name}
      </Typography>

      <Paper sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Outstanding" value={form.outstanding} onChange={(e) => setField("outstanding", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Payment Plan" value={form.payment_plan} onChange={(e) => setField("payment_plan", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Salary" value={form.salary} onChange={(e) => setField("salary", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Duration" value={form.duration} onChange={(e) => setField("duration", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Remaining Period" value={form.remaining_period} onChange={(e) => setField("remaining_period", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Periodicity" value={form.periodicity} onChange={(e) => setField("periodicity", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Class Value" value={form.class_value} onChange={(e) => setField("class_value", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Compulsory Saving" value={form.compulsory_saving} onChange={(e) => setField("compulsory_saving", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Voluntary Saving" value={form.voluntary_saving} onChange={(e) => setField("voluntary_saving", e.target.value)} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              InputLabelProps={{ shrink: true }}
              value={form.start_date}
              onChange={(e) => setField("start_date", e.target.value)}
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save & Continue"}
          </Button>
          <Button variant="outlined" onClick={() => navigate("/applications")}>Cancel</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
