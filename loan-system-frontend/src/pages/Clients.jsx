import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import { useSnackbar } from "notistack";
import { getAuth } from "../auth/auth";

import {
  Box, Paper, Typography, Stack, TextField, Button,
  Table, TableHead, TableRow, TableCell, TableBody,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Menu, MenuItem
} from "@mui/material";

import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";

function statusColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "success";
  if (s === "SUSPENDED") return "warning";
  if (s === "CLOSED") return "default";
  return "default";
}

export default function Clients() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const role = (getAuth()?.role || "ANALYST").toUpperCase();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // delete dialog
  const [delOpen, setDelOpen] = useState(false);
  const [delRow, setDelRow] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // status menu (admin)
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuClient, setMenuClient] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.get("/clients", {
        params: { search: search.trim() || undefined },
      });
      setItems(res.data || []);
    } catch {
      enqueueSnackbar("Failed to load clients.", { variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  function openDelete(c) {
    setDelRow(c);
    setDelOpen(true);
  }

  async function confirmDelete() {
    if (!delRow) return;
    setDeleting(true);
    try {
      await api.delete(`/clients/${delRow.id}`);
      enqueueSnackbar("Client deleted.", { variant: "success" });
      setDelOpen(false);
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Delete failed";
      enqueueSnackbar(msg, { variant: "error" });
    } finally {
      setDeleting(false);
    }
  }

  function openStatusMenu(e, c) {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
    setMenuClient(c);
  }

  function closeStatusMenu() {
    setMenuAnchor(null);
    setMenuClient(null);
  }

  async function setStatus(newStatus) {
    if (!menuClient) return;
    try {
      await api.patch(`/clients/${menuClient.id}/status`, { status: newStatus });
      enqueueSnackbar(`Status updated to ${newStatus}.`, { variant: "success" });
      closeStatusMenu();
      await load();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || "Status update failed";
      enqueueSnackbar(msg, { variant: "error" });
    }
  }

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2 }}>Clients</Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Search"
            placeholder="ACC001 / John"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button variant="contained" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Search"}
          </Button>
        </Stack>
      </Paper>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Account</TableCell>
              <TableCell>Full name</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {items.map((c) => (
              <TableRow
                key={c.id}
                hover
                sx={{ cursor: "pointer" }}
                onClick={() => navigate(`/clients/${c.id}`)}
              >
                <TableCell>{c.id}</TableCell>
                <TableCell>{c.account}</TableCell>
                <TableCell>{c.full_name}</TableCell>
                <TableCell>{c.phone}</TableCell>
                <TableCell>
                  <Chip size="small" label={c.status || "ACTIVE"} color={statusColor(c.status)} />
                </TableCell>

                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  {/* Admin status control */}
                  <Tooltip title={role === "ADMIN" ? "Change status" : "Admin only"}>
                    <span>
                      <IconButton
                        size="small"
                        disabled={role !== "ADMIN"}
                        onClick={(e) => openStatusMenu(e, c)}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>

                  {/* Delete */}
                  <Tooltip title={role === "ADMIN" ? "Delete client" : "Admin only"}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={role !== "ADMIN"}
                        onClick={() => openDelete(c)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}

            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ p: 2 }}>
                    No clients found.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Status menu */}
      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeStatusMenu}
      >
        <MenuItem onClick={() => setStatus("ACTIVE")}>Set ACTIVE</MenuItem>
        <MenuItem onClick={() => setStatus("SUSPENDED")}>Set SUSPENDED</MenuItem>
        <MenuItem onClick={() => setStatus("CLOSED")}>Set CLOSED</MenuItem>
      </Menu>

      {/* Delete dialog */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete client?</DialogTitle>
        <DialogContent>
          <Typography>
            Delete client <b>{delRow?.account}</b> ({delRow?.full_name})? This cannot be undone.
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