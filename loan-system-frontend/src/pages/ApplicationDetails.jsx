import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getAuth } from "../auth/auth";
import { calculateTermMonths } from "../utils/application";

import {
  Box, Typography, Grid, Paper, Stack, Button, Chip, Divider,
  CircularProgress, Alert, Table, TableHead, TableRow, TableCell,
  TableBody, TextField, MenuItem, Tabs, Tab, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip, IconButton, TableContainer,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

const DECISIONS = ["APPROVE", "REJECT", "REVIEW"];

function statusColor(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "REVIEW") return "warning";
  if (status === "SCORED") return "info";
  return "default";
}
function bandColor(band) {
  const b = (band || "").toLowerCase();
  if (b.includes("excellent")) return "success";
  if (b.includes("good")) return "success";
  if (b.includes("fair")) return "warning";
  if (b.includes("poor")) return "error";
  return "default";
}
function fmtMoney(x) {
  if (x === null || x === undefined || x === "") return "-";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toLocaleString();
}
function fmtDate(x) {
  if (!x) return "-";
  return String(x).replace("T", " ").replace(".000Z", "");
}

function DetailRow({ label, value }) {
  return (
    <Stack direction="row" spacing={1} alignItems="baseline">
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 110 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function ApplicationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const auth = getAuth();
  const role = auth?.role || "ANALYST";

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [tab, setTab] = useState(0);
  const [decision, setDecision] = useState("REVIEW");
  const [comment, setComment] = useState("");

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ amount_requested: "", payment_plan: "", purpose: "", term_requested: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete dialog
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const res = await api.get(`/applications/${id}/details`);
      setData(res.data);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Failed to load application";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const app = data?.application;
  const client = data?.client;
  const fin = data?.financials;
  const score = data?.latest_score;
  const decisionsHistory = data?.decisions || [];
  const displayPaymentPlan = app?.payment_plan ?? fin?.payment_plan ?? null;

  // normalize top factors
  const topFactors = useMemo(() => {
    if (!score) return [];
    const tf = score.top_factors;
    if (Array.isArray(tf)) return tf;
    if (tf && typeof tf === "object" && Array.isArray(tf.factors)) return tf.factors;
    return [];
  }, [score]);

  const isFinalized = useMemo(
    () => app?.status === "APPROVED" || app?.status === "REJECTED",
    [app?.status]
  );

  const canDecide = useMemo(
    () => !!score && !isFinalized,
    [score, isFinalized]
  );

  // Frontend rules matching backend
  const canEditApp = useMemo(() => app?.status === "SUBMITTED", [app?.status]);

  const canDeleteApp = useMemo(() => {
    if (!app) return false;
    if (app.status === "APPROVED" || app.status === "REJECTED") return false;
    if (role === "ADMIN") return app.status === "SUBMITTED" || app.status === "SCORED";
    return app.status === "SUBMITTED";
  }, [app, role]);

  async function scoreNow() {
    setErr("");
    setActionLoading(true);
    try {
      const res = await api.post(`/applications/${id}/score`, {});
      enqueueSnackbar(
        res.data?.cached ? "Score already up to date (cached)." : "Scoring completed successfully.",
        { variant: res.data?.cached ? "info" : "success" }
      );
      await load();
      setTab(1);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Scoring failed";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setActionLoading(false);
    }
  }

  async function submitDecision() {
    if (!comment.trim()) {
      enqueueSnackbar("Comment is required for audit trail.", { variant: "warning" });
      return;
    }

    setErr("");
    setActionLoading(true);
    try {
      await api.post(`/applications/${id}/decision`, {
        final_decision: decision,
        comment: comment.trim(),
      });
      enqueueSnackbar("Decision saved successfully.", { variant: "success" });
      setComment("");
      await load();
      setTab(2);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Decision failed";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setActionLoading(false);
    }
  }

  function openEdit() {
    setEditForm({
      amount_requested: app?.amount_requested ?? "",
      payment_plan: app?.payment_plan ?? "",
      purpose: app?.purpose ?? "",
      term_requested: calculateTermMonths(app?.amount_requested, app?.payment_plan) || (app?.term_requested ?? ""),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      await api.put(`/applications/${id}`, {
        amount_requested: Number(editForm.amount_requested),
        payment_plan: Number(editForm.payment_plan),
        purpose: String(editForm.purpose || ""),
        term_requested: Number(editForm.term_requested),
      });
      enqueueSnackbar("Application updated.", { variant: "success" });
      setEditOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Update failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await api.delete(`/applications/${id}`);
      enqueueSnackbar("Application deleted.", { variant: "success" });
      navigate("/applications");
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
      setDelOpen(false);
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
  if (!app) return <Alert severity="error">Application not found or data missing.</Alert>;

  return (
    <Box sx={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5">
            Application #{app.id}{" "}
            <Chip size="small" label={app.status} color={statusColor(app.status)} sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Submitted: {fmtDate(app.submitted_at)}
          </Typography>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", md: "auto" } }}>
          <Button variant="outlined" onClick={load} disabled={actionLoading}>Refresh</Button>

          <Button variant="contained" onClick={scoreNow} disabled={actionLoading || isFinalized}>
            Score
          </Button>

          <Tooltip title={canEditApp ? "Edit (SUBMITTED only)" : "Only SUBMITTED can be edited"}>
            <span>
              <IconButton onClick={openEdit} disabled={!canEditApp || actionLoading}>
                <EditIcon />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={canDeleteApp ? "Delete" : "Delete not allowed"}>
            <span>
              <IconButton color="error" onClick={() => setDelOpen(true)} disabled={!canDeleteApp || actionLoading}>
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {isFinalized && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Finalized ({app.status}). Analysts cannot add new decisions. Admin override only.
        </Alert>
      )}

      <Paper sx={{ mb: 2, overflow: "hidden" }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Overview" />
          <Tab label="Model Output" />
          <Tab label="Decisions" />
        </Tabs>
      </Paper>

      {/* OVERVIEW */}
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, height: "100%" }}>
              <Typography variant="h6">Client</Typography>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={1.25}>
                <DetailRow label="Account" value={client?.account || "-"} />
                <DetailRow label="Name" value={client?.full_name || "-"} />
                <DetailRow label="Phone" value={client?.phone || "-"} />
                <DetailRow label="Status" value={client?.status || "-"} />
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, height: "100%" }}>
              <Typography variant="h6">Application</Typography>
              <Divider sx={{ my: 1 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Requested Amount</Typography>
                    <Typography variant="h6">{fmtMoney(app.amount_requested)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Current Payment Plan</Typography>
                    <Typography variant="h6">{fmtMoney(displayPaymentPlan)}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Creditline</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{app.creditline || "-"}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Requested Term</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{app.term_requested ?? "-"}</Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Purpose</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{app.purpose || "-"}</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
              <Typography variant="h6">Financials</Typography>
              <Divider sx={{ my: 1 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Outstanding" value={fmtMoney(fin?.outstanding)} /></Grid>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Payment Plan" value={fmtMoney(fin?.payment_plan)} /></Grid>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Salary" value={fmtMoney(fin?.salary)} /></Grid>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Duration" value={fin?.duration ?? "-"} /></Grid>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Remaining" value={fin?.remaining_period ?? "-"} /></Grid>
                <Grid item xs={12} sm={6} md={4}><DetailRow label="Start" value={fmtDate(fin?.start_date)} /></Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* MODEL OUTPUT */}
      {tab === 1 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6">Model Output</Typography>
          <Divider sx={{ my: 1 }} />

          {!score ? (
            <Alert severity="info">No score yet. Click <b>Score</b>.</Alert>
          ) : (
            <>
              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
                <Chip size="small" label={`Score: ${score.credit_score}`} />
                <Chip size="small" label={`Band: ${score.risk_band}`} color={bandColor(score.risk_band)} />
                <Chip size="small" label={`PD: ${Number(score.probability_default).toFixed(3)}`} />
                <Chip size="small" label={`Suggested: ${score.decision_suggestion}`} />
              </Stack>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>Top Factors</Typography>

              {topFactors.length === 0 ? (
                <Alert severity="info">No explainability factors available.</Alert>
              ) : (
                <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: isMobile ? 520 : 0 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Feature</TableCell>
                        <TableCell align="right">Impact</TableCell>
                        <TableCell>Direction</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {topFactors.map((f, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{f.feature}</TableCell>
                          <TableCell align="right">{Number(f.impact).toFixed(3)}</TableCell>
                          <TableCell>{f.direction || (f.impact >= 0 ? "increases_risk" : "decreases_risk")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </Paper>
      )}

      {/* DECISIONS */}
      {tab === 2 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Make Decision</Typography>
              <Divider sx={{ my: 1 }} />

              {!score && <Alert severity="warning" sx={{ mb: 2 }}>Score required before decision.</Alert>}

              <Stack spacing={2}>
                <TextField
                  select
                  label="Final Decision"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  disabled={!canDecide || actionLoading}
                >
                  {DECISIONS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
                </TextField>

                <TextField
                  label="Comment (required)"
                  multiline
                  minRows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={!canDecide || actionLoading}
                />

                <Button variant="contained" onClick={submitDecision} disabled={!canDecide || actionLoading}>
                  Submit Decision
                </Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Decision History</Typography>
              <Divider sx={{ my: 1 }} />

              {decisionsHistory.length === 0 ? (
                <Typography variant="body2" color="text.secondary">No decisions yet.</Typography>
              ) : (
                <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: isMobile ? 640 : 0 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Decision</TableCell>
                        <TableCell>Analyst</TableCell>
                        <TableCell>Comment</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {decisionsHistory.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>{fmtDate(d.decided_at)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={d.final_decision}
                              color={d.final_decision === "APPROVE" ? "success" : d.final_decision === "REJECT" ? "error" : "warning"}
                            />
                          </TableCell>
                          <TableCell>{d.analyst?.name || "-"}</TableCell>
                          <TableCell>{d.comment || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Application</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Amount Requested"
              value={editForm.amount_requested}
              onChange={(e) => setEditForm(p => {
                const amountRequested = e.target.value;
                return {
                  ...p,
                  amount_requested: amountRequested,
                  term_requested: calculateTermMonths(amountRequested, p.payment_plan),
                };
              })}
            />
            <TextField
              label="Purpose"
              value={editForm.purpose}
              onChange={(e) => setEditForm(p => ({ ...p, purpose: e.target.value }))}
            />
            <TextField
              label="Payment Plan"
              value={editForm.payment_plan}
              onChange={(e) => setEditForm(p => {
                const paymentPlan = e.target.value;
                return {
                  ...p,
                  payment_plan: paymentPlan,
                  term_requested: calculateTermMonths(p.amount_requested, paymentPlan),
                };
              })}
            />
            <TextField
              label="Term Requested (months)"
              value={editForm.term_requested}
              InputProps={{ readOnly: true }}
              helperText="Auto-calculated from Amount Requested and Payment Plan."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={savingEdit}>
            {savingEdit ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE CONFIRM */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Application?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete application #{app.id}? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
