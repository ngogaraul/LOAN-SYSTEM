import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";

import {
  Box,
  Typography,
  Grid,
  Paper,
  Stack,
  Button,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  MenuItem,
  Tabs,
  Tab,
} from "@mui/material";

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

export default function ApplicationDetails() {
  const { id } = useParams();
  const { enqueueSnackbar } = useSnackbar();

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [tab, setTab] = useState(0);
  const [decision, setDecision] = useState("REVIEW");
  const [comment, setComment] = useState("");

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
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5">
            Application #{app.id}{" "}
            <Chip size="small" label={app.status} color={statusColor(app.status)} sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Submitted: {fmtDate(app.submitted_at)}
          </Typography>
        </Box>

        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={load} disabled={actionLoading}>
            Refresh
          </Button>
          <Button variant="contained" onClick={scoreNow} disabled={actionLoading || isFinalized}>
            Score
          </Button>
        </Stack>
      </Stack>

      {isFinalized && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Finalized ({app.status}). Analysts cannot add new decisions. Admin override only.
        </Alert>
      )}

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
          <Tab label="Overview" />
          <Tab label="Model Output" />
          <Tab label="Decisions" />
        </Tabs>
      </Paper>

      {/* OVERVIEW */}
      {tab === 0 && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Client</Typography>
              <Divider sx={{ my: 1 }} />
              <Typography><b>Account:</b> {client?.account || "-"}</Typography>
              <Typography><b>Name:</b> {client?.full_name || "-"}</Typography>
              <Typography><b>Phone:</b> {client?.phone || "-"}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Application</Typography>
              <Divider sx={{ my: 1 }} />
              <Typography><b>Amount:</b> {fmtMoney(app.amount_requested)}</Typography>
              <Typography><b>Term:</b> {app.term_requested ?? "-"}</Typography>
              <Typography><b>Purpose:</b> {app.purpose || "-"}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6">Financial Snapshot Used for Scoring</Typography>
              <Typography variant="body2" color="text.secondary">
                These are the financial inputs used by the model for this client.
              </Typography>
              <Divider sx={{ my: 1 }} />

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Outstanding:</b> {fmtMoney(fin?.outstanding)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Payment Plan:</b> {fmtMoney(fin?.payment_plan)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Remaining Period:</b> {fin?.remaining_period ?? "-"}</Typography>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Periodicity:</b> {fin?.periodicity ?? "-"}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Class Value:</b> {fin?.class_value ?? "-"}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Compulsory Saving:</b> {fmtMoney(fin?.compulsory_saving)}</Typography>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Voluntary Saving:</b> {fmtMoney(fin?.voluntary_saving)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Salary:</b> {fmtMoney(fin?.salary)}</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Duration:</b> {fin?.duration ?? "-"}</Typography>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                  <Typography><b>Start Date:</b> {fmtDate(fin?.start_date)}</Typography>
                </Grid>
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

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Top Factors
              </Typography>

              {topFactors.length === 0 ? (
                <Alert severity="info">No explainability factors available.</Alert>
              ) : (
                <Table size="small">
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
                        <TableCell>
                          {f.direction || (f.impact >= 0 ? "increases_risk" : "decreases_risk")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

              {!score && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Score required before decision.
                </Alert>
              )}

              <Stack spacing={2}>
                <TextField
                  select
                  label="Final Decision"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  disabled={!canDecide || actionLoading}
                >
                  {DECISIONS.map((d) => (
                    <MenuItem key={d} value={d}>{d}</MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="Comment (required)"
                  multiline
                  minRows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={!canDecide || actionLoading}
                />

                <Button
                  variant="contained"
                  onClick={submitDecision}
                  disabled={!canDecide || actionLoading}
                >
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
                <Typography variant="body2" color="text.secondary">
                  No decisions yet.
                </Typography>
              ) : (
                <Table size="small">
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
                            color={
                              d.final_decision === "APPROVE"
                                ? "success"
                                : d.final_decision === "REJECT"
                                ? "error"
                                : "warning"
                            }
                          />
                        </TableCell>
                        <TableCell>{d.analyst?.name || "-"}</TableCell>
                        <TableCell>{d.comment || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}