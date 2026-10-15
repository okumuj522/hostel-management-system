import { useCallback, useEffect, useState } from "react";
import "./StudentPortal.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
const navigation = [
  ["overview", "Overview", "◫"],
  ["browse", "Browse rooms", "▦"],
  ["apply", "Apply", "＋"],
  ["applications", "My applications", "▤"],
  ["stay", "My accommodation", "⌂"],
  ["transfers", "Transfers", "⇄"],
  ["maintenance", "Maintenance", "⚒"],
  ["profile", "Profile", "♙"]
];

const emptyData = () => ({ profile: null, halls: [], rooms: [], semesters: [], openSemesters: [], applications: [], allocations: [], transfers: [], maintenance: [] });

function responseError(data) {
  if (!data) return "The server returned an unexpected response.";
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  return Object.entries(data).map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(" ") : value}`).join(" · ");
}

function roomAvailableBeds(room) {
  if (!room.is_available) return 0;
  return Number.isFinite(room.available_beds) ? room.available_beds : room.capacity;
}

function dateLabel(value, includeTime = false) {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, includeTime ? undefined : { dateStyle: "medium" });
}

function statusLabel(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function StudentPortal({ token, onAuthenticated, onSwitchAdmin, onLogout }) {
  const [authMode, setAuthMode] = useState("login");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState("overview");
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const request = useCallback(async (path, options = {}) => {
    const headers = { ...options.headers };
    if (options.body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Token ${token}`;
    const response = await fetch(`${API}/${path}`, { ...options, headers });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.status === 401 && token) onLogout();
    if (!response.ok) throw new Error(responseError(payload));
    return payload;
  }, [token, onLogout]);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const results = await Promise.all([
        request("student-profile/"),
        request("halls/"),
        request("rooms/"),
        request("semesters/"),
        request("semesters/?open_for_applications=true"),
        request("applications/"),
        request("allocations/"),
        request("transfers/"),
        request("maintenance/")
      ]);
      setData({ profile: results[0], halls: results[1], rooms: results[2], semesters: results[3], openSemesters: results[4], applications: results[5], allocations: results[6], transfers: results[7], maintenance: results[8] });
    } catch (loadError) {
      setError(loadError.message || "Unable to load your hostel information.");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    if (token) Promise.resolve().then(() => loadData(false));
  }, [token, loadData]);

  async function submitAuth(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const register = authMode === "register";
    const payload = register
      ? {
          student_number: form.get("student_number"),
          phone_number: form.get("phone_number"),
          password: form.get("password"),
          password_confirm: form.get("password_confirm")
        }
      : { student_number: form.get("student_number"), password: form.get("password") };
    try {
      const response = await fetch(`${API}/auth/student/${register ? "register" : "login"}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(result));
      onAuthenticated(result);
    } catch (authFailure) {
      setAuthError(authFailure.message || "Unable to sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function submitRecord(path, payload, successMessage, event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(path, { method: "POST", body: JSON.stringify(payload) });
      await loadData(false);
      setNotice(successMessage);
      return true;
    } catch (saveError) {
      setError(saveError.message || "Unable to submit this request.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitApplication(event) {
    const form = new FormData(event.currentTarget);
    const payload = {
      semester: Number(form.get("semester")),
      preferred_hall: form.get("preferred_hall") ? Number(form.get("preferred_hall")) : null,
      preferred_room_type: form.get("preferred_room_type")
    };
    if (await submitRecord("applications/", payload, "Application submitted. Its status will update here after review.", event)) setPage("applications");
  }

  async function submitTransfer(event) {
    const form = new FormData(event.currentTarget);
    const payload = { allocation: Number(form.get("allocation")), requested_room: Number(form.get("requested_room")), reason: form.get("reason") };
    if (await submitRecord("transfers/", payload, "Transfer request submitted for administrator review.", event)) setPage("transfers");
  }

  async function submitMaintenance(event) {
    const form = new FormData(event.currentTarget);
    const payload = { room: Number(form.get("room")), description: form.get("description") };
    if (await submitRecord("maintenance/", payload, "Maintenance request submitted.", event)) setPage("maintenance");
  }

  async function updateProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const profile = await request("student-profile/", {
        method: "PATCH",
        body: JSON.stringify({ full_name: form.get("full_name"), gender: form.get("gender"), year_of_study: Number(form.get("year_of_study")), phone_number: form.get("phone_number") })
      });
      setData((current) => ({ ...current, profile }));
      setNotice("Profile updated.");
    } catch (saveError) {
      setError(saveError.message || "Unable to update your profile.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <main className="student-auth-page">
      <section className="student-auth-banner">
        <div className="student-brand"><span className="student-brand-mark">H</span><span>Haven <small>STUDENT PORTAL</small></span></div>
        <div><p className="portal-eyebrow">HOSTEL ACCOMMODATION</p><h1>Your campus stay,<br />all in one place.</h1><p>Browse rooms, submit your application, and keep track of your accommodation requests.</p></div>
      </section>
      <section className="student-auth-wrap">
        <form className="student-auth-form" onSubmit={submitAuth}>
          <div className="student-auth-heading"><p className="portal-eyebrow">STUDENT ACCESS</p><h2>{authMode === "register" ? "Create your account" : "Student sign in"}</h2></div>
          <label>Student number<input name="student_number" autoComplete="username" required /></label>
          {authMode === "register" && <>
            <label>Phone number on your student record<input name="phone_number" type="tel" autoComplete="tel" required /></label>
            <p className="student-form-note">Registration matches your details to a student record created by the hostel administrator.</p>
          </>}
          <label>Password<input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={8} required /></label>
          {authMode === "register" && <label>Confirm password<input name="password_confirm" type="password" autoComplete="new-password" minLength={8} required /></label>}
          {authError && <div className="student-alert error" role="alert">{authError}</div>}
          <button className="student-primary" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}</button>
          <div className="student-auth-links"><span>{authMode === "register" ? "Already registered?" : "New to the portal?"}</span><button type="button" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setAuthError(""); }}>{authMode === "register" ? "Sign in" : "Create an account"}</button></div>
          <button type="button" className="admin-switch" onClick={onSwitchAdmin}>Administrator sign in</button>
        </form>
      </section>
    </main>;
  }

  const profile = data.profile;
  const activeAllocations = data.allocations.filter((item) => ["pending", "confirmed"].includes(item.status));
  const openApplications = data.applications.filter((item) => ["pending", "approved"].includes(item.status));
  const availableRooms = data.rooms.filter((room) => roomAvailableBeds(room) > 0);
  const appliedSemesters = new Set(data.applications.map((item) => item.semester));
  const availableSemesters = data.openSemesters.filter((semester) => !appliedSemesters.has(semester.id));
  const roomById = (id) => data.rooms.find((room) => room.id === id);
  const hallById = (id) => data.halls.find((hall) => hall.id === id);
  const semesterById = (id) => data.semesters.find((semester) => semester.id === id);
  const roomName = (room) => room ? `${hallById(room.hall)?.name || "Hall"} · Room ${room.room_number}` : "Room not found";
  const pageTitle = navigation.find(([key]) => key === page)?.[1] || "Overview";

  function submitStatusClass(value) {
    return `student-status ${String(value).replaceAll(" ", "_")}`;
  }

  function renderOverview() {
    const current = activeAllocations.find((item) => item.status === "confirmed") || activeAllocations[0];
    const currentRoom = current && roomById(current.room);
    const cards = [
      { label: "Applications", value: data.applications.length, note: `${openApplications.length} in progress`, tone: "green" },
      { label: "Available rooms", value: availableRooms.length, note: "Across all halls", tone: "blue" },
      { label: "Accommodation", value: current ? "Assigned" : "Not assigned", note: current ? roomName(currentRoom) : "No active allocation", tone: "amber" }
    ];
    return <>
      <div className="student-welcome"><div><p className="portal-eyebrow">STUDENT DASHBOARD</p><h2>Welcome, {profile?.full_name || "Student"}</h2><p>{profile?.student_number} · Year {profile?.year_of_study}</p></div><span className="welcome-monogram">{profile?.full_name?.slice(0, 1).toUpperCase() || "S"}</span></div>
      <section className="student-stat-grid">{cards.map((card) => <article className="student-stat" key={card.label}><span className="student-stat-label">{card.label}</span><strong className={card.value === "Assigned" ? "word-value" : ""}>{card.value}</strong><small>{card.note}</small><i className={card.tone} /></article>)}</section>
      <section className="student-overview-grid">
        <div className="student-section"><div className="student-section-heading"><div><h2>Application progress</h2><p>Your latest accommodation applications</p></div><button className="student-link" onClick={() => setPage("applications")}>All applications →</button></div>
          <div className="student-list">{[...data.applications].sort((a, b) => b.id - a.id).slice(0, 4).map((application) => <div className="student-list-row" key={application.id}><div><strong>{semesterById(application.semester)?.name || "Semester"}</strong><small>Submitted {dateLabel(application.application_date)}</small></div><span className={submitStatusClass(application.status)}>{statusLabel(application.status)}</span></div>)}{data.applications.length === 0 && <StudentEmpty title="No applications yet" detail="Choose an open semester when you are ready to apply." />}</div>
        </div>
        <div className="student-section current-stay"><div className="student-section-heading"><div><h2>Current accommodation</h2><p>Your active room allocation</p></div></div>
          {current ? <div className="stay-summary"><span className="stay-icon">⌂</span><div><strong>{roomName(currentRoom)}</strong><small>{semesterById(current.semester)?.name || "Current semester"}</small></div><span className={submitStatusClass(current.status)}>{statusLabel(current.status)}</span></div> : <StudentEmpty title="No active allocation" detail="Room allocations are made by the hostel administrator." />}
        </div>
      </section>
    </>;
  }

  function renderBrowse() {
    const filteredHalls = data.halls.filter((hall) => `${hall.name} ${hall.location} ${hall.gender_policy}`.toLowerCase().includes(search.toLowerCase()));
    const filteredRooms = availableRooms.filter((room) => `${room.room_number} ${room.room_type} ${hallById(room.hall)?.name || ""}`.toLowerCase().includes(search.toLowerCase()));
    return <>
      <div className="student-toolbar"><div><strong>{filteredRooms.length} available rooms</strong><small>{filteredHalls.length} halls match your search</small></div><input className="student-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search halls or rooms" aria-label="Search halls or rooms" /></div>
      <div className="hall-grid">{filteredHalls.map((hall) => <article className="hall-card" key={hall.id}><div className="hall-card-top"><span className="hall-symbol">⌂</span><span className="hall-policy">{hall.gender_policy} hall</span></div><h2>{hall.name}</h2><p>{hall.location || "Campus accommodation"}</p><div className="hall-room-count">{filteredRooms.filter((room) => room.hall === hall.id).length} rooms available</div></article>)}</div>
      <div className="student-room-grid">{filteredRooms.map((room) => <article className="room-card" key={room.id}><div className="room-card-heading"><div><span>{hallById(room.hall)?.name || "Hostel hall"}</span><h3>Room {room.room_number}</h3></div><span className="availability-label">Available</span></div><div className="room-details"><span>{room.room_type} room</span><span>Capacity {room.capacity}</span><span>{roomAvailableBeds(room)} bed{roomAvailableBeds(room) === 1 ? "" : "s"} open</span></div></article>)}</div>
      {filteredHalls.length === 0 && filteredRooms.length === 0 && <StudentEmpty title="No rooms match" detail="Try another hall, room number, or room type." />}
    </>;
  }

  function renderApplications() {
    return <section className="student-panel"><div className="student-panel-heading"><div><h2>My applications</h2><p>{data.applications.length} submitted</p></div><button className="student-primary compact" onClick={() => setPage("apply")}>＋ New application</button></div>
      {data.applications.length ? <div className="student-table-wrap"><table className="student-table"><thead><tr><th>Semester</th><th>Preferred hall</th><th>Room type</th><th>Submitted</th><th>Status</th></tr></thead><tbody>{[...data.applications].sort((a, b) => b.id - a.id).map((item) => <tr key={item.id}><td><strong>{semesterById(item.semester)?.name || `Semester #${item.semester}`}</strong></td><td>{hallById(item.preferred_hall)?.name || "No preference"}</td><td>{statusLabel(item.preferred_room_type)}</td><td>{dateLabel(item.application_date)}</td><td><span className={submitStatusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></table></div> : <StudentEmpty title="No applications yet" detail="Start an application for an open semester." />}
    </section>;
  }

  function renderStay() {
    return <section className="student-panel"><div className="student-panel-heading"><div><h2>My accommodation</h2><p>Room assignments and confirmation status</p></div></div>
      {activeAllocations.length ? <div className="stay-grid">{activeAllocations.map((item) => { const room = roomById(item.room); return <article className="allocation-card" key={item.id}><span className="allocation-label">{semesterById(item.semester)?.name || "Semester"}</span><h3>{roomName(room)}</h3><p>{room?.room_type || "Room"} · Capacity {room?.capacity ?? "—"}</p><div className="allocation-meta"><span>Allocated {dateLabel(item.allocation_date)}</span><span className={submitStatusClass(item.status)}>{statusLabel(item.status)}</span></div>{item.confirmation_deadline && <small className="deadline-note">Confirm by {dateLabel(item.confirmation_deadline, true)}</small>}</article>; })}</div> : <StudentEmpty title="No current accommodation" detail="Your room allocation will appear here after it is made by an administrator." />}
    </section>;
  }

  function renderTransfers() {
    const eligible = activeAllocations.filter((item) => ["pending", "confirmed"].includes(item.status));
    const pendingAllocationIds = new Set(data.transfers.filter((item) => item.status === "pending").map((item) => item.allocation));
    const availableAllocations = eligible.filter((item) => !pendingAllocationIds.has(item.id));
    const transferRooms = availableRooms.filter((room) => !availableAllocations.some((allocation) => allocation.room === room.id));
    return <div className="student-two-column"><section className="student-panel student-form-panel"><div className="student-panel-heading"><div><h2>Request a transfer</h2><p>Transfer decisions are reviewed by the hostel administrator.</p></div></div>
      {availableAllocations.length && transferRooms.length ? <form className="student-form-grid" onSubmit={submitTransfer}>
        <label>Current allocation<select name="allocation" required>{availableAllocations.map((item) => <option key={item.id} value={item.id}>{roomName(roomById(item.room))} · {semesterById(item.semester)?.name}</option>)}</select></label>
        <label>Requested room<select name="requested_room" required>{transferRooms.map((room) => <option key={room.id} value={room.id}>{roomName(room)} · {roomAvailableBeds(room)} beds open</option>)}</select></label>
        <label className="field-wide">Reason<textarea name="reason" rows={3} placeholder="Add a reason for your request" /></label>
        <button className="student-primary" type="submit" disabled={busy}>Submit transfer request</button>
      </form> : <StudentEmpty title="No transfer available" detail="You need an active allocation and an available alternative room to request a transfer." />}
    </section><section className="student-panel"><div className="student-panel-heading"><div><h2>Transfer history</h2><p>{data.transfers.length} requests</p></div></div>
      <div className="student-request-list">{data.transfers.map((item) => <article className="request-row" key={item.id}><div><strong>To {roomName(roomById(item.requested_room))}</strong><small>{dateLabel(item.request_date)} · {item.reason || "No reason provided"}</small></div><span className={submitStatusClass(item.status)}>{statusLabel(item.status)}</span></article>)}{data.transfers.length === 0 && <StudentEmpty title="No transfer requests" detail="Your submitted requests and decisions will appear here." />}</div>
    </section></div>;
  }

  function renderMaintenance() {
    const allocatedRooms = [...new Map(activeAllocations.map((allocation) => [allocation.room, roomById(allocation.room)]).filter(([, room]) => room)).values()];
    return <div className="student-two-column"><section className="student-panel student-form-panel"><div className="student-panel-heading"><div><h2>Report a maintenance issue</h2><p>Report an issue in your current accommodation.</p></div></div>
      {allocatedRooms.length ? <form className="student-form-grid" onSubmit={submitMaintenance}><label>Room<select name="room" required>{allocatedRooms.map((room) => <option key={room.id} value={room.id}>{roomName(room)}</option>)}</select></label><label className="field-wide">Issue description<textarea name="description" required rows={4} minLength={5} placeholder="Describe the issue" /></label><button className="student-primary" type="submit" disabled={busy}>Submit maintenance request</button></form> : <StudentEmpty title="No current room" detail="Maintenance can be reported for rooms currently allocated to you." />}
    </section><section className="student-panel"><div className="student-panel-heading"><div><h2>Maintenance history</h2><p>{data.maintenance.length} requests</p></div></div>
      <div className="student-request-list">{data.maintenance.map((item) => <article className="request-row" key={item.id}><div><strong>{roomName(roomById(item.room))}</strong><small>{dateLabel(item.reported_date)} · {item.description}</small></div><span className={submitStatusClass(item.status)}>{statusLabel(item.status)}</span></article>)}{data.maintenance.length === 0 && <StudentEmpty title="No maintenance requests" detail="Requests you submit will be listed here." />}</div>
    </section></div>;
  }

  function renderProfile() {
    return <section className="student-panel profile-panel"><div className="student-panel-heading"><div><h2>Personal details</h2><p>Update your contact and study information.</p></div></div>
      {profile && <form className="student-form-grid" onSubmit={updateProfile}><label>Student number<input value={profile.student_number} readOnly /></label><label>Full name<input name="full_name" defaultValue={profile.full_name} required maxLength={150} /></label><label>Gender<input name="gender" defaultValue={profile.gender} maxLength={10} /></label><label>Year of study<input name="year_of_study" type="number" min="1" defaultValue={profile.year_of_study} required /></label><label className="field-wide">Phone number<input name="phone_number" type="tel" defaultValue={profile.phone_number} maxLength={20} /></label><button className="student-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form>}
    </section>;
  }

  function renderApply() {
    const roomTypes = [["single", "Single"], ["double", "Double"], ["shared", "Shared"]];
    return <section className="student-panel student-form-panel apply-panel"><div className="student-panel-heading"><div><h2>Accommodation application</h2><p>Applications are reviewed by the hostel administrator.</p></div></div>
      {availableSemesters.length ? <form className="student-form-grid" onSubmit={submitApplication}><label>Semester<select name="semester" required>{availableSemesters.map((item) => <option value={item.id} key={item.id}>{item.name} · closes {dateLabel(item.application_deadline)}</option>)}</select></label><label>Preferred hall<select name="preferred_hall" defaultValue=""><option value="">No preference</option>{data.halls.map((hall) => <option value={hall.id} key={hall.id}>{hall.name}</option>)}</select></label><label>Preferred room type<select name="preferred_room_type" defaultValue="single" required>{roomTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button className="student-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button></form> : <StudentEmpty title="No semester applications are open" detail="An application option will appear when the hostel administrator opens a semester." />}
    </section>;
  }

  const renderers = { overview: renderOverview, browse: renderBrowse, apply: renderApply, applications: renderApplications, stay: renderStay, transfers: renderTransfers, maintenance: renderMaintenance, profile: renderProfile };

  return <div className="student-app">
    <aside className="student-sidebar"><div className="student-brand"><span className="student-brand-mark">H</span><span>Haven <small>STUDENT PORTAL</small></span></div><p className="student-nav-label">MY HOSTEL</p><nav aria-label="Student portal navigation">{navigation.map(([key, label, icon]) => <button className={`student-nav-item ${page === key ? "active" : ""}`} key={key} onClick={() => { setPage(key); setSearch(""); setError(""); }}><span>{icon}</span>{label}</button>)}</nav>
      <div className="student-account"><span className="student-avatar">{profile?.full_name?.slice(0, 1).toUpperCase() || "S"}</span><div><strong>{profile?.full_name || "Student"}</strong><small>{profile?.student_number}</small></div><button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out">↪</button></div>
    </aside>
    <main className="student-main"><header className="student-topbar"><div><span>Student portal</span><b>/</b><strong>{pageTitle}</strong></div><button type="button" className="student-refresh" onClick={() => loadData()} disabled={loading}>↻ Refresh</button></header>
      <div className="student-content"><div className="student-page-heading"><div><p className="portal-eyebrow">ACCOMMODATION SERVICES</p><h1>{pageTitle}</h1><p>{page === "overview" ? "Your application and accommodation at a glance." : `Student record · ${profile?.student_number || ""}`}</p></div></div>
        {error && <div className="student-alert error" role="alert">{error}</div>}{notice && <div className="student-alert success" role="status">{notice}</div>}{loading ? <div className="student-loading">Loading your information…</div> : renderers[page]()}
        <footer className="student-footer"><span>Haven Hostel Manager</span><span>Student records are visible only to you and hostel administrators</span></footer>
      </div>
    </main>
  </div>;
}

function StudentEmpty({ title, detail }) {
  return <div className="student-empty"><span>⌕</span><strong>{title}</strong><p>{detail}</p></div>;
}

export default StudentPortal;
