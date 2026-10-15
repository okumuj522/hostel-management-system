import { useEffect, useState } from "react";
import "./App.css";
import StudentPortal from "./StudentPortal.jsx";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const TOKEN_KEY = "haven-admin-token";

const resources = {
  halls: {
    label: "Halls", singular: "hall", endpoint: "halls", icon: "⌂",
    fields: [
      { name: "name", label: "Hall name", required: true },
      { name: "location", label: "Location" },
      { name: "gender_policy", label: "Gender policy", type: "select", required: true, defaultValue: "mixed", options: [["male", "Male"], ["female", "Female"], ["mixed", "Mixed"]] }
    ],
    columns: ["name", "location", "gender_policy"]
  },
  rooms: {
    label: "Rooms", singular: "room", endpoint: "rooms", icon: "▦",
    fields: [
      { name: "hall", label: "Hall", type: "reference", reference: "halls", required: true },
      { name: "room_number", label: "Room number", required: true },
      { name: "room_type", label: "Room type", type: "select", required: true, defaultValue: "single", options: [["single", "Single"], ["double", "Double"], ["shared", "Shared"]] },
      { name: "capacity", label: "Capacity", type: "number", min: 1, required: true, defaultValue: 1 },
      { name: "is_available", label: "Available", type: "checkbox", defaultValue: true }
    ],
    columns: ["room_number", "hall", "room_type", "capacity", "is_available"]
  },
  students: {
    label: "Students", singular: "student", endpoint: "students", icon: "♙",
    fields: [
      { name: "student_number", label: "Student number", required: true },
      { name: "full_name", label: "Full name", required: true },
      { name: "gender", label: "Gender" },
      { name: "year_of_study", label: "Year of study", type: "number", min: 1, required: true, defaultValue: 1 },
      { name: "phone_number", label: "Phone number" }
    ],
    columns: ["student_number", "full_name", "gender", "year_of_study", "phone_number"]
  },
  semesters: {
    label: "Semesters", singular: "semester", endpoint: "semesters", icon: "▣",
    fields: [
      { name: "name", label: "Semester name", required: true },
      { name: "start_date", label: "Start date", type: "date", required: true },
      { name: "end_date", label: "End date", type: "date", required: true },
      { name: "application_deadline", label: "Application deadline", type: "date", required: true }
    ],
    columns: ["name", "start_date", "end_date", "application_deadline"]
  },
  applications: {
    label: "Applications", singular: "application", endpoint: "applications", icon: "▤",
    fields: [
      { name: "student", label: "Student", type: "reference", reference: "students", required: true },
      { name: "semester", label: "Semester", type: "reference", reference: "semesters", required: true },
      { name: "preferred_hall", label: "Preferred hall", type: "reference", reference: "halls", nullable: true },
      { name: "preferred_room_type", label: "Preferred room type", type: "select", required: true, defaultValue: "single", options: [["single", "Single"], ["double", "Double"], ["shared", "Shared"]] },
      { name: "preferred_roommate", label: "Preferred roommate", type: "reference", reference: "students", nullable: true },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "pending", options: [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["allocated", "Allocated"]] }
    ],
    columns: ["student", "semester", "preferred_hall", "preferred_room_type", "status"]
  },
  allocations: {
    label: "Allocations", singular: "allocation", endpoint: "allocations", icon: "⌑",
    fields: [
      { name: "student", label: "Student", type: "reference", reference: "students", required: true },
      { name: "room", label: "Room", type: "reference", reference: "rooms", required: true },
      { name: "semester", label: "Semester", type: "reference", reference: "semesters", required: true },
      { name: "confirmation_deadline", label: "Confirmation deadline", type: "datetime-local", nullable: true },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "pending", options: [["pending", "Pending confirmation"], ["confirmed", "Confirmed"], ["expired", "Expired"], ["vacated", "Vacated"], ["cancelled", "Cancelled"]] }
    ],
    columns: ["student", "room", "semester", "confirmation_deadline", "status"]
  },
  transfers: {
    label: "Transfers", singular: "transfer request", endpoint: "transfers", icon: "⇄",
    fields: [
      { name: "allocation", label: "Allocation", type: "reference", reference: "allocations", required: true },
      { name: "requested_room", label: "Requested room", type: "reference", reference: "rooms", required: true },
      { name: "reason", label: "Reason", type: "textarea" },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "pending", options: [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]] }
    ],
    columns: ["allocation", "requested_room", "reason", "request_date", "status"]
  },
  maintenance: {
    label: "Maintenance", singular: "maintenance record", endpoint: "maintenance", icon: "⚒",
    fields: [
      { name: "room", label: "Room", type: "reference", reference: "rooms", required: true },
      { name: "description", label: "Description", type: "textarea", required: true },
      { name: "status", label: "Status", type: "select", required: true, defaultValue: "reported", options: [["reported", "Reported"], ["in_progress", "In progress"], ["completed", "Completed"]] }
    ],
    columns: ["room", "description", "reported_date", "status"]
  }
};

const navigation = ["overview", ...Object.keys(resources)];
const emptyData = () => Object.fromEntries(Object.keys(resources).map((key) => [key, []]));

function explainError(payload) {
  if (!payload) return "The server returned an unexpected response.";
  if (typeof payload === "string") return payload;
  if (payload.detail) return payload.detail;
  return Object.entries(payload)
    .map(([field, messages]) => `${field.replaceAll("_", " ")}: ${Array.isArray(messages) ? messages.join(" ") : messages}`)
    .join(" · ");
}

function recordLabel(type, record, data) {
  if (!record) return "Unknown record";
  if (type === "halls") return record.name;
  if (type === "rooms") return `${record.room_number} · ${recordLabel("halls", data.halls.find((item) => item.id === record.hall), data)}`;
  if (type === "students") return `${record.student_number} · ${record.full_name}`;
  if (type === "semesters") return record.name;
  if (type === "allocations") return `#${record.id} · ${recordLabel("students", data.students.find((item) => item.id === record.student), data)}`;
  return `#${record.id}`;
}

function cellValue(resourceKey, column, record, data) {
  const definition = resources[resourceKey].fields.find((field) => field.name === column);
  const value = record[column];
  if (value === null || value === undefined || value === "") return "—";
  if (definition?.type === "reference") {
    return recordLabel(definition.reference, data[definition.reference].find((item) => item.id === value), data);
  }
  if (column === "allocation") {
    const allocation = data.allocations.find((item) => item.id === value);
    return allocation ? recordLabel("allocations", allocation, data) : `#${value}`;
  }
  if (["request_date", "reported_date", "confirmation_deadline"].includes(column)) return new Date(value).toLocaleString();
  if (["start_date", "end_date", "application_deadline"].includes(column)) return new Date(`${value}T00:00:00`).toLocaleDateString();
  if (column === "is_available") return value ? "Available" : "Unavailable";
  if (column === "status" || column.endsWith("_type") || column === "gender_policy") return String(value).replaceAll("_", " ");
  return String(value);
}

function recordIdentity(resourceKey, record) {
  if (resourceKey === "halls" || resourceKey === "semesters") return record.name;
  if (resourceKey === "rooms") return `Room ${record.room_number}`;
  if (resourceKey === "students") return `${record.student_number} · ${record.full_name}`;
  return `${resources[resourceKey].singular} #${record.id}`;
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || "");
  const [username, setUsername] = useState(() => sessionStorage.getItem("haven-admin-name") || "Administrator");
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem(TOKEN_KEY)));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginMode, setLoginMode] = useState("admin");
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  async function request(path, options = {}, activeToken = token) {
    const headers = { ...options.headers };
    if (options.body) headers["Content-Type"] = "application/json";
    if (activeToken) headers.Authorization = `Token ${activeToken}`;
    const response = await fetch(`${API}/${path}`, { ...options, headers });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.status === 401 && activeToken) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem("haven-admin-name");
      setToken("");
    }
    if (!response.ok) throw new Error(explainError(body));
    return body;
  }

  async function loadData(activeToken = token, updateLoading = true) {
    if (updateLoading) setLoading(true);
    setError("");
    try {
      const pairs = await Promise.all(Object.entries(resources).map(async ([key, definition]) => [
        key,
        await request(`${definition.endpoint}/`, {}, activeToken)
      ]));
      setData(Object.fromEntries(pairs));
    } catch (loadError) {
      setError(loadError.message || "Unable to load hostel records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) Promise.resolve().then(() => loadData(token, false));
  }, [token]);

  async function signIn(event) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await request("auth/login/", {
        method: "POST",
        body: JSON.stringify({ username: form.get("username"), password: form.get("password") })
      }, "");
      sessionStorage.setItem(TOKEN_KEY, result.token);
      sessionStorage.setItem("haven-admin-name", result.username);
      sessionStorage.setItem("haven-account-kind", "admin");
      setUsername(result.username);
      setLoading(true);
      setToken(result.token);
    } catch (loginFailure) {
      setLoginError(loginFailure.message || "Unable to sign in.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function signOut() {
    try {
      await request("auth/logout/", { method: "POST" });
    } catch {
      // Clear the local session even if the server is unreachable.
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem("haven-admin-name");
    sessionStorage.removeItem("haven-account-kind");
    setToken("");
    setData(emptyData());
    setPage("overview");
  }

  function openEditor(resourceKey, item = null) {
    setError("");
    setEditor({ resourceKey, item });
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!editor) return;
    const { resourceKey, item } = editor;
    const definition = resources[resourceKey];
    const form = new FormData(event.currentTarget);
    const payload = {};
    definition.fields.forEach((field) => {
      const input = event.currentTarget.elements[field.name];
      if (field.type === "checkbox") {
        payload[field.name] = input.checked;
      } else {
        let value = form.get(field.name);
        if (field.type === "number") value = value === "" ? null : Number(value);
        if (field.type === "reference") value = value === "" ? null : Number(value);
        if (field.type === "datetime-local" && value) value = new Date(value).toISOString();
        if (field.nullable && value === "") value = null;
        payload[field.name] = value;
      }
    });

    setSaving(true);
    setError("");
    try {
      await request(`${definition.endpoint}/${item ? `${item.id}/` : ""}`, {
        method: item ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      await loadData();
      setEditor(null);
      setNotice(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} ${item ? "updated" : "created"}.`);
      window.setTimeout(() => setNotice(""), 3500);
    } catch (saveError) {
      setError(saveError.message || "Unable to save this record.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecord(resourceKey, item) {
    const definition = resources[resourceKey];
    if (!window.confirm(`Delete ${recordIdentity(resourceKey, item)}? This action cannot be undone.`)) return;
    setError("");
    try {
      await request(`${definition.endpoint}/${item.id}/`, { method: "DELETE" });
      await loadData();
      setNotice(`${definition.singular[0].toUpperCase()}${definition.singular.slice(1)} deleted.`);
      window.setTimeout(() => setNotice(""), 3500);
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this record.");
    }
  }

  function completeStudentLogin(result) {
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem("haven-admin-name", result.username);
    sessionStorage.setItem("haven-account-kind", "student");
    setUsername(result.username);
    setLoading(true);
    setToken(result.token);
  }

  if (token && sessionStorage.getItem("haven-account-kind") === "student") {
    return <StudentPortal token={token} onLogout={signOut} />;
  }

  if (!token && loginMode === "student") {
    return <StudentPortal token="" onAuthenticated={completeStudentLogin} onSwitchAdmin={() => setLoginMode("admin")} />;
  }

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-visual">
          <div className="login-brand"><span className="brand-mark">H</span><span>Haven <small>HOSTEL MANAGER</small></span></div>
          <div className="login-message"><p className="eyebrow">ADMINISTRATOR ACCESS</p><h1>Accommodation<br />in good order.</h1><p>Manage halls, students, room assignments, and service requests from one workspace.</p></div>
          <span className="login-watermark">H</span>
        </section>
        <section className="login-form-wrap">
          <form className="login-form" onSubmit={signIn}>
            <p className="eyebrow">SECURE WORKSPACE</p><h2>Administrator sign in</h2><p className="login-description">Use your Django staff or superuser account.</p>
            <div className="auth-switch"><span>Need student access?</span><button type="button" onClick={() => setLoginMode("student")}>Student sign in / register</button></div>
            <label>Username<input name="username" autoComplete="username" required autoFocus /></label>
            <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
            {loginError && <div className="error-notice" role="alert">{loginError}</div>}
            <button className="primary-button login-submit" type="submit" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in"}</button>
          </form>
        </section>
      </main>
    );
  }

  const pageTitle = page === "overview" ? "Overview" : resources[page].label;
  const pendingApplications = data.applications.filter((item) => item.status === "pending").length;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">H</div><div><h2>Haven</h2><span>HOSTEL MANAGER</span></div></div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Workspace sections">
          {navigation.map((key) => {
            const label = key === "overview" ? "Overview" : resources[key].label;
            return <button key={key} className={`nav-item ${page === key ? "active" : ""}`} onClick={() => { setPage(key); setSearch(""); setError(""); }}>
              <span className="nav-icon">{key === "overview" ? "◫" : resources[key].icon}</span><span>{label}</span>
              {key === "applications" && pendingApplications > 0 && <span className="nav-count">{pendingApplications}</span>}
            </button>;
          })}
        </nav>
        <div className="sidebar-bottom"><div className="user-profile"><div className="avatar">{username.slice(0, 1).toUpperCase()}</div><div className="user-info"><strong>{username}</strong><span>Administrator</span></div><button className="logout-button" title="Sign out" aria-label="Sign out" onClick={signOut}>↪</button></div></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{pageTitle}</strong></div><div className="topbar-right"><span className="connection-dot" /><span className="connection-text">Admin session</span></div></header>
        <div className="content">
          <div className="page-heading"><div><p className="eyebrow">ACCOMMODATION MANAGEMENT</p><h1>{page === "overview" ? "Dashboard overview" : pageTitle}</h1><p className="subtitle">{page === "overview" ? "A live view of hostel operations and records." : `Manage ${resources[page].label.toLowerCase()} and their details.`}</p></div>
            <button className="refresh-button" onClick={() => loadData()} disabled={loading}>↻ <span>{loading ? "Refreshing" : "Refresh data"}</span></button>
          </div>
          {error && <div className="error-notice page-alert" role="alert">{error}</div>}
          {notice && <div className="success-notice page-alert" role="status">{notice}</div>}
          {loading && <div className="notice">Loading hostel records…</div>}
          {!loading && page === "overview" && <Dashboard data={data} setPage={setPage} onEdit={(item) => openEditor("applications", item)} />}
          {!loading && page !== "overview" && <ResourceSection resourceKey={page} data={data} search={search} setSearch={setSearch} onCreate={() => openEditor(page)} onEdit={(item) => openEditor(page, item)} onDelete={(item) => deleteRecord(page, item)} />}
          <footer><span>Haven Hostel Manager</span><span>Authenticated Django REST Framework API</span></footer>
        </div>
      </main>
      {editor && <RecordEditor editor={editor} data={data} saving={saving} error={error} onClose={() => { setEditor(null); setError(""); }} onSubmit={saveRecord} />}
    </div>
  );
}

function Dashboard({ data, setPage, onEdit }) {
  const stats = [
    { label: "Halls", value: data.halls.length, note: "Accommodation buildings", color: "green" },
    { label: "Rooms", value: data.rooms.length, note: `${data.rooms.filter((room) => room.is_available).length} available`, color: "blue" },
    { label: "Students", value: data.students.length, note: "Registered records", color: "teal" },
    { label: "Pending applications", value: data.applications.filter((item) => item.status === "pending").length, note: "Awaiting review", color: "orange" },
    { label: "Allocations", value: data.allocations.length, note: "Room assignments", color: "blue" },
    { label: "Transfer requests", value: data.transfers.length, note: `${data.transfers.filter((item) => item.status === "pending").length} awaiting review`, color: "orange" },
    { label: "Open maintenance", value: data.maintenance.filter((item) => item.status !== "completed").length, note: "Reported or in progress", color: "green" },
    { label: "Semesters", value: data.semesters.length, note: "Configured terms", color: "teal" }
  ];
  const recent = [...data.applications].sort((a, b) => b.id - a.id).slice(0, 5);
  return <>
    <section className="stats-grid">{stats.map((stat) => <article className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><span className={`stat-mark ${stat.color}`} /></div><strong className="stat-value">{stat.value}</strong><span className="stat-note">{stat.note}</span></article>)}</section>
    <section className="overview-columns">
      <div className="section-block"><div className="section-heading"><div><h2>Recent applications</h2><p>Latest application records</p></div><button className="text-button" onClick={() => setPage("applications")}>View all →</button></div>
        <div className="data-panel">{recent.length ? <RecordTable resourceKey="applications" items={recent} data={data} onEdit={onEdit} compact /> : <EmptyState label="No applications yet" />}</div>
      </div>
      <div className="section-block"><div className="section-heading"><div><h2>Workspace</h2><p>Resource totals</p></div></div>
        <div className="workspace-list">{Object.entries(resources).map(([key, definition]) => <button key={key} onClick={() => setPage(key)}><span className="workspace-icon">{definition.icon}</span><span>{definition.label}</span><strong>{data[key].length}</strong><span className="quick-arrow">›</span></button>)}</div>
      </div>
    </section>
  </>;
}

function ResourceSection({ resourceKey, data, search, setSearch, onCreate, onEdit, onDelete }) {
  const definition = resources[resourceKey];
  const filtered = data[resourceKey].filter((item) => {
    const values = [...Object.values(item), ...definition.columns.map((column) => cellValue(resourceKey, column, item, data))];
    return values.join(" ").toLowerCase().includes(search.toLowerCase());
  });
  return <section className="data-panel">
    <div className="panel-toolbar"><div><strong>{filtered.length} {filtered.length === 1 ? "record" : "records"}</strong><p>Search, edit, or add {definition.label.toLowerCase()}.</p></div>
      <div className="toolbar-actions"><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${definition.label.toLowerCase()}…`} aria-label={`Search ${definition.label}`} /><button className="primary-button" onClick={onCreate}>＋ Add {definition.singular}</button></div>
    </div>
    {filtered.length ? <RecordTable resourceKey={resourceKey} items={filtered} data={data} onEdit={onEdit} onDelete={onDelete} /> : <EmptyState label={search ? "No matching records" : `No ${definition.label.toLowerCase()} yet`} />}
  </section>;
}

function RecordTable({ resourceKey, items, data, onEdit, onDelete, compact = false }) {
  const definition = resources[resourceKey];
  const columns = compact ? ["student", "semester", "status"] : definition.columns;
  return <div className="table-scroll"><table>
    <thead><tr><th>ID</th>{columns.map((column) => <th key={column}>{definition.fields.find((field) => field.name === column)?.label || column.replaceAll("_", " ")}</th>)}<th className="actions-heading">Actions</th></tr></thead>
    <tbody>{items.map((item) => <tr key={item.id}><td className="record-id">#{item.id}</td>
      {columns.map((column) => <td key={column}>{column === "status" ? <span className={`status-pill ${item.status}`}>{cellValue(resourceKey, column, item, data)}</span> : cellValue(resourceKey, column, item, data)}</td>)}
      <td><div className="row-actions"><button onClick={() => onEdit(item)} title="Edit record" aria-label={`Edit record ${item.id}`}>✎</button>{!compact && <button className="delete-action" onClick={() => onDelete(item)} title="Delete record" aria-label={`Delete record ${item.id}`}>×</button>}</div></td>
    </tr>)}</tbody>
  </table></div>;
}

function EmptyState({ label }) {
  return <div className="empty-state"><span>⌕</span><strong>{label}</strong><p>Records will appear here when available in the system.</p></div>;
}

function fieldValue(field, item) {
  const value = item?.[field.name];
  if (field.type === "checkbox") return Boolean(value);
  if (field.type === "datetime-local" && value) {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  return value === null || value === undefined ? "" : String(value);
}

function RecordEditor({ editor, data, saving, error, onClose, onSubmit }) {
  const { resourceKey, item } = editor;
  const definition = resources[resourceKey];
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-heading"><div><p className="eyebrow">{item ? "UPDATE RECORD" : "NEW RECORD"}</p><h2 id="editor-title">{item ? "Edit" : "Add"} {definition.singular}</h2></div><button className="modal-close" onClick={onClose} aria-label="Close form">×</button></div>
      <form onSubmit={onSubmit}><div className="form-grid">{definition.fields.map((field) => {
        const value = fieldValue(field, item);
        if (field.type === "checkbox") return <label className="checkbox-field" key={field.name}><input type="checkbox" name={field.name} defaultChecked={item ? value : field.defaultValue === true} /><span>{field.label}</span></label>;
        return <label className={field.type === "textarea" ? "form-field full-width" : "form-field"} key={field.name}><span>{field.label}{field.required && <b> *</b>}</span>
          {field.type === "select" || field.type === "reference" ? <select name={field.name} defaultValue={value || field.defaultValue || ""} required={field.required}>
            {field.nullable && <option value="">Not specified</option>}
            {field.type === "select" ? field.options.map(([optionValue, optionLabel]) => <option value={optionValue} key={optionValue}>{optionLabel}</option>) : data[field.reference].map((record) => <option value={record.id} key={record.id}>{recordLabel(field.reference, record, data)}</option>)}
          </select> : field.type === "textarea" ? <textarea name={field.name} defaultValue={value} required={field.required} rows={3} /> : <input name={field.name} type={field.type || "text"} defaultValue={value || field.defaultValue || ""} required={field.required} min={field.min} />}
        </label>;
      })}</div>
      {error && <div className="error-notice form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : item ? "Save changes" : "Create record"}</button></div>
      </form>
    </section>
  </div>;
}

export default App;
