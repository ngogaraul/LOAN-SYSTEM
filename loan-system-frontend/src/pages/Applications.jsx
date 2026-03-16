import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getAuth } from "../auth/auth";

import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  TextField, MenuItem, Button, Stack, Chip, CircularProgress, IconButton,
  Tooltip, Dialog, DialogTitle, DialogContent, DialogActions
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

const STATUSES = ["", "SUBMITTED", "SCORED", "REVIEW", "APPROVED", "REJECTED"];

function statusColor(status) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  if (status === "REVIEW") return "warning";
  if (status === "SCORED") return "info";
  return "default";
}

function calculateTermMonths(amount, paymentPlan) {
  const parsedAmount = Number(amount);
  const parsedPaymentPlan = Number(paymentPlan);

  if (!parsedAmount || parsedAmount <= 0 || !parsedPaymentPlan || parsedPaymentPlan <= 0) {
    return "";
  }

  return String(Math.ceil(parsedAmount / parsedPaymentPlan));
}

export default function Applications() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const auth = getAuth();
  const role = auth?.role || "ANALYST";

  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // EDIT dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editForm, setEditForm] = useState({ amount_requested: "", payment_plan: "", purpose: "", term_requested: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // DELETE dialog
  const [delOpen, setDelOpen] = useState(false);
  const [delRow, setDelRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const rules = useMemo(() => {
    return {
      canEdit: (row) => row?.status === "SUBMITTED",
      canDelete: (row) => {
        if (!row) return false;
        if (row.status === "APPROVED" || row.status === "REJECTED") return false;
        if (role === "ADMIN") return row.status === "SUBMITTED" || row.status === "SCORED";
        return row.status === "SUBMITTED";
      },
    };
  }, [role]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const params = { page, page_size: pageSize };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();

      const res = await api.get("/applications", { params });
      setItems(res.data.items || []);
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        "Failed to load applications";
      setErr(msg);
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status, page]); // eslint-disable-line

  function onSearch() {
    setPage(1);
    load();
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      amount_requested: row.amount_requested ?? "",
      payment_plan: row.payment_plan ?? "",
      purpose: row.purpose ?? "",
      term_requested: calculateTermMonths(row.amount_requested, row.payment_plan) || (row.term_requested ?? ""),
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow) return;

    setSavingEdit(true);
    try {
      await api.put(`/applications/${editRow.id}`, {
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

  function openDelete(row) {
    setDelRow(row);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDeleting(true);
    try {
      await api.delete(`/applications/${delRow.id}`);
      enqueueSnackbar("Application deleted.", { variant: "success" });
      setDelOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Applications</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            sx={{ minWidth: 180 }}
          >
            {STATUSES.map(s => (
              <MenuItem key={s} value={s}>{s || "ALL"}</MenuItem>
            ))}
          </TextField>

          <TextField
            label="Search"
            placeholder="ACC001 / John / 7"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
          />

          <Button variant="contained" onClick={onSearch}>Search</Button>
        </Stack>

        {err && <Typography sx={{ mt: 2 }} color="error">{err}</Typography>}
      </Paper>

      <Paper>
        {loading ? (
          <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Account</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {items.map((a) => (
                <TableRow
                  key={a.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => navigate(`/applications/${a.id}`)}
                >
                  <TableCell>{a.id}</TableCell>
                  <TableCell>{a.client?.account || "-"}</TableCell>
                  <TableCell>{a.client?.full_name || "-"}</TableCell>
                  <TableCell>{Number(a.amount_requested || 0).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip size="small" label={a.status} color={statusColor(a.status)} />
                  </TableCell>
                  <TableCell>{a.submitted_at}</TableCell>

                  {/* ACTIONS */}
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={rules.canEdit(a) ? "Edit (SUBMITTED only)" : "Only SUBMITTED can be edited"}>
                      <span>
                        <IconButton size="small" disabled={!rules.canEdit(a)} onClick={() => openEdit(a)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>

                    <Tooltip title={rules.canDelete(a) ? "Delete" : "Delete not allowed"}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!rules.canDelete(a)}
                          onClick={() => openDelete(a)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="outlined" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
        <Typography sx={{ mt: 1 }}>Page {page}</Typography>
        <Button
          variant="outlined"
          disabled={items.length < pageSize}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </Button>
      </Stack>

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
            Are you sure you want to delete application #{delRow?.id}? This cannot be undone.
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
