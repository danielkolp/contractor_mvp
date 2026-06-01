// Euroflo dashboard — screens
const { useState: useS, useEffect: useE } = React;

const NAV = [
  { id: "today", name: "Today", icon: "calendar-check-2" },
  { id: "estimates", name: "Estimates", icon: "file-text" },
  { id: "invoices", name: "Invoices", icon: "receipt" },
  { id: "clients", name: "Clients", icon: "users-round" },
  { id: "requests", name: "Job Requests", icon: "clipboard-list" },
  { id: "recovery", name: "Recovery", icon: "rotate-ccw" },
  { id: "settings", name: "Settings", icon: "settings" },
];

function Sidebar({ route, setRoute }) {
  const D = window.EF_DATA;
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <img src="../../assets/euroflo-mark.svg" alt="" />
        <span className="wm">Euroflo</span>
      </div>
      <nav className="side-nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={"nav-item" + (route === n.id ? " active" : "")}
            onClick={() => setRoute(n.id)}
          >
            <Icon name={n.icon} />
            <span>{n.name}</span>
            {n.id === "requests" && <span className="nav-count">{D.jobRequests.length}</span>}
          </button>
        ))}
      </nav>
      <div className="side-promo">
        <div className="h"><Icon name="shield-check" />You stay in control</div>
        <p>Every follow-up is drafted for your review. Nothing sends without your approval.</p>
      </div>
    </aside>
  );
}

function TopBar({ title }) {
  const D = window.EF_DATA;
  return (
    <header className="topbar">
      <span className="page-t">{title}</span>
      <div className="spacer"></div>
      <button className="icon-btn"><Icon name="search" /></button>
      <button className="icon-btn"><Icon name="bell" /></button>
      <div className="avatar">{D.user.initials}</div>
    </header>
  );
}

// ── Follow-up drawer ──
function FollowUpDrawer({ item, onClose, onSend }) {
  const open = !!item;
  const [text, setText] = useS("");
  useE(() => { if (item) setText(item.draft || ""); }, [item]);
  return (
    <>
      <div className={"drawer-scrim" + (open ? " open" : "")} onClick={onClose}></div>
      <div className={"drawer" + (open ? " open" : "")}>
        {item && (
          <>
            <div className="drawer-head">
              <div>
                <h3>Follow-up · {item.name}</h3>
                <p>{item.ref} · {money(item.amount)}</p>
              </div>
              <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
            </div>
            <div className="drawer-body">
              <div className="msg-label"><Icon name="sparkles" />Drafted for your review</div>
              <textarea
                className="msg-box"
                style={{ width: "100%", minHeight: 180, resize: "vertical", fontFamily: "var(--font-sans)" }}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p style={{ fontSize: 13, color: "var(--ef-500)", marginTop: 14, lineHeight: 1.5 }}>
                Sent as a friendly text and email. We'll schedule a check-back and route any reply
                straight back here.
              </p>
            </div>
            <div className="drawer-foot">
              <Btn variant="accent" icon="send" onClick={() => onSend(item)}>Approve &amp; send</Btn>
              <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SectionHead({ color, label, count }) {
  return (
    <div className="section-head">
      <span className="dot" style={{ background: color }}></span>
      <span className="lbl">{label}</span>
      <span className="c">{count}</span>
      <span className="ln"></span>
    </div>
  );
}

function QueueCard({ item, actions }) {
  return (
    <div className={"qcard s-" + item.status}>
      <div className={"qic i-" + item.status}><Icon name={item.icon} /></div>
      <div className="qbody">
        <div className="qtop">
          <span className="qname">{item.name}</span>
          <span className={"tag t-" + item.status}>{item.tag}</span>
        </div>
        <div className="qmeta">{item.ref} · <b className="tnum">{money(item.amount)}</b> · {item.note}</div>
      </div>
      <div className="qacts">{actions}</div>
    </div>
  );
}

function TodayScreen() {
  const D = window.EF_DATA;
  const [needs, setNeeds] = useS(D.needsAction);
  const [ready, setReady] = useS(D.messageReady);
  const [waiting, setWaiting] = useS(D.waiting);
  const [drawerItem, setDrawerItem] = useS(null);

  const atRisk =
    [...needs, ...ready, ...waiting].reduce((s, i) => s + i.amount, 0);
  const actionCount = needs.length + ready.length;

  function sendFollowUp(item) {
    setNeeds((n) => n.filter((x) => x.id !== item.id));
    setReady((r) => r.filter((x) => x.id !== item.id));
    setWaiting((w) => [{ ...item, status: "waiting", icon: "rotate-ccw", note: "Follow-up sent · check back in 5 days", tag: "waiting" }, ...w]);
    setDrawerItem(null);
    toast("Follow-up sent to " + item.name + ".");
  }
  function markPaid(item) {
    setNeeds((n) => n.filter((x) => x.id !== item.id));
    toast(item.name + " marked as paid.");
  }
  function markWon(item) {
    setNeeds((n) => n.filter((x) => x.id !== item.id));
    toast(item.name + " marked as won.");
  }

  const allClear = actionCount === 0;

  return (
    <div className="content reveal">
      <div className="hero">
        <div className="wash"></div>
        <div className="row">
          <div>
            <div className="hero-count" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span className="count">
                <span className="n">{actionCount}</span>
              </span>
              <h2>Today's follow-ups</h2>
            </div>
            <p className="sub">
              {actionCount === 0 ? "You're all caught up." : `${actionCount} ${actionCount === 1 ? "person needs" : "people need"} attention.`}{" "}
              <b className="tnum">{money(atRisk)}</b> still on the table.
            </p>
          </div>
          <div className="actions">
            <Btn variant="primary" icon="trending-up">Start with highest value</Btn>
            <Btn variant="outline" icon="plus">Add recovery</Btn>
          </div>
        </div>
      </div>

      {allClear && (
        <div style={{ marginTop: 22 }} className="caughtup reveal">
          <div className="ring"><Icon name="check" /></div>
          <h3>You're all caught up for today.</h3>
          <p><b className="tnum">{money(atRisk)}</b> is being tracked. {waiting.length} item{waiting.length === 1 ? "" : "s"} waiting for a reply. Come back tomorrow.</p>
        </div>
      )}

      {needs.length > 0 && (
        <>
          <SectionHead color="var(--ef-due)" label="Needs action now" count={needs.length} />
          {needs.map((item) => (
            <QueueCard key={item.id} item={item} actions={
              item.kind === "estimate" ? (
                <>
                  <Btn variant="primary" size="sm" onClick={() => markWon(item)}>They said yes</Btn>
                  <Btn variant="accent" size="sm" icon="send" onClick={() => setDrawerItem(item)}>Follow up</Btn>
                  <Btn variant="ghost" size="sm" onClick={() => markWon(item)}>Not interested</Btn>
                </>
              ) : (
                <>
                  <Btn variant="accent" size="sm" icon="send" onClick={() => setDrawerItem(item)}>Generate follow-up</Btn>
                  <Btn variant="outline" size="sm" onClick={() => markPaid(item)}>Mark paid</Btn>
                </>
              )
            } />
          ))}
        </>
      )}

      {ready.length > 0 && (
        <>
          <SectionHead color="var(--ef-paid)" label="Message ready" count={ready.length} />
          {ready.map((item) => (
            <QueueCard key={item.id} item={item} actions={
              <>
                <Btn variant="accent" size="sm" icon="send" onClick={() => setDrawerItem(item)}>Review &amp; send</Btn>
                <Btn variant="ghost" size="sm" onClick={() => { setReady((r) => r.filter((x) => x.id !== item.id)); toast("Snoozed until tomorrow."); }}>Snooze</Btn>
              </>
            } />
          ))}
        </>
      )}

      {waiting.length > 0 && (
        <>
          <SectionHead color="var(--ef-waiting)" label="Waiting for reply" count={waiting.length} />
          {waiting.map((item) => (
            <QueueCard key={item.id} item={item} actions={
              <Btn variant="ghost" size="sm" icon="rotate-ccw">Follow up again</Btn>
            } />
          ))}
        </>
      )}

      <FollowUpDrawer item={drawerItem} onClose={() => setDrawerItem(null)} onSend={sendFollowUp} />
    </div>
  );
}

// ── Invoices ──
function InvoicesScreen() {
  const D = window.EF_DATA;
  const [filter, setFilter] = useS("all");
  const rows = D.invoices.filter((r) => filter === "all" ? true : filter === "open" ? r.status !== "paid" : r.status === "paid");
  const outstanding = D.invoices.filter((r) => r.status !== "paid").reduce((s, r) => s + r.amount, 0);
  const overdue = D.invoices.filter((r) => r.status === "overdue").reduce((s, r) => s + r.amount, 0);
  const paid = D.invoices.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount, 0);
  return (
    <div className="content reveal">
      <div className="page-head">
        <div><h1>Invoices</h1><p>Track what's been billed and what's still owed.</p></div>
        <Btn variant="primary" icon="plus">New invoice</Btn>
      </div>
      <div className="stats">
        <div className="stat"><div className="k"><Icon name="circle-dollar-sign" />Outstanding</div><div className="v tnum">{money(outstanding)}</div><div className="d" style={{ color: "var(--ef-500)" }}>across {D.invoices.filter(r=>r.status!=="paid").length} invoices</div></div>
        <div className="stat"><div className="k"><Icon name="alert-circle" />Overdue</div><div className="v tnum" style={{ color: "var(--ef-overdue)" }}>{money(overdue)}</div><div className="d" style={{ color: "var(--ef-overdue)" }}>needs follow-up</div></div>
        <div className="stat"><div className="k"><Icon name="check-circle-2" />Paid this month</div><div className="v tnum" style={{ color: "var(--ef-paid)" }}>{money(paid)}</div><div className="d" style={{ color: "var(--ef-paid)" }}>2 invoices cleared</div></div>
      </div>
      <div className="card card-pad">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
          <div className="seg">
            {[["all", "All"], ["open", "Open"], ["paid", "Paid"]].map(([k, l]) => (
              <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
        </div>
        <table className="table">
          <thead><tr><th>Invoice</th><th>Client</th><th>Due</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ref} className="clickable">
                <td className="ef-mono" style={{ color: "var(--ef-600)" }}>{r.ref}</td>
                <td className="strong">{r.client}</td>
                <td>{r.due}</td>
                <td><span className={"tag t-" + r.status}>{r.tag}</span></td>
                <td className="strong tnum" style={{ textAlign: "right" }}>{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Estimates ──
function EstimatesScreen() {
  const D = window.EF_DATA;
  return (
    <div className="content reveal">
      <div className="page-head">
        <div><h1>Estimates</h1><p>Every quote, and which ones have gone quiet.</p></div>
        <Btn variant="primary" icon="plus">New estimate</Btn>
      </div>
      <div className="card card-pad">
        <table className="table">
          <thead><tr><th>Estimate</th><th>Client</th><th>Sent</th><th>Status</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
          <tbody>
            {D.estimates.map((r) => (
              <tr key={r.ref} className="clickable">
                <td className="ef-mono" style={{ color: "var(--ef-600)" }}>{r.ref}</td>
                <td className="strong">{r.client}</td>
                <td>{r.sent}</td>
                <td><span className={"tag t-" + r.status}>{r.tag}</span></td>
                <td className="strong tnum" style={{ textAlign: "right" }}>{money(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Clients ──
const RELIABILITY = {
  great: { tag: "t-paid", label: "Great payer" },
  good: { tag: "t-accepted", label: "Reliable" },
  watch: { tag: "t-due", label: "Watch" },
};
function ClientsScreen() {
  const D = window.EF_DATA;
  return (
    <div className="content reveal">
      <div className="page-head">
        <div><h1>Clients</h1><p>Your customers, their history, and what they owe.</p></div>
        <Btn variant="primary" icon="plus">Add client</Btn>
      </div>
      <div className="card card-pad">
        <table className="table">
          <thead><tr><th>Client</th><th>Contact</th><th>Trade</th><th>Jobs</th><th>Reliability</th><th style={{ textAlign: "right" }}>Outstanding</th></tr></thead>
          <tbody>
            {D.clients.map((c) => (
              <tr key={c.name} className="clickable">
                <td className="strong">{c.name}</td>
                <td>{c.contact}</td>
                <td style={{ color: "var(--ef-500)" }}>{c.trade}</td>
                <td className="tnum">{c.jobs}</td>
                <td><span className={"tag " + RELIABILITY[c.reliability].tag}>{RELIABILITY[c.reliability].label}</span></td>
                <td className="strong tnum" style={{ textAlign: "right", color: c.outstanding ? "var(--ef-overdue)" : "var(--ef-400)" }}>
                  {c.outstanding ? money(c.outstanding) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Job Requests ──
function JobRequestsScreen() {
  const D = window.EF_DATA;
  const [reqs, setReqs] = useS(D.jobRequests);
  function estimate(r) { setReqs((x) => x.filter((q) => q !== r)); toast("Estimate started for " + r.name + "."); }
  function decline(r) { setReqs((x) => x.filter((q) => q !== r)); toast("Request archived."); }
  return (
    <div className="content reveal">
      <div className="page-head">
        <div><h1>Job Requests</h1><p>New leads from your request link — reply fast to win them.</p></div>
        <Btn variant="outline" icon="link">Copy request link</Btn>
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {reqs.length === 0 && (
          <div className="caughtup"><div className="ring"><Icon name="check" /></div><h3>No new requests.</h3><p>New job requests from your link will land here.</p></div>
        )}
        {reqs.map((r, i) => (
          <div className="card card-pad" key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div className="qic i-accepted" style={{ width: 44, height: 44 }}><Icon name="hard-hat" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="qname" style={{ fontSize: 16 }}>{r.name}</span>
                {r.isNew && <span className="tag t-overdue">New</span>}
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ef-400)" }}>{r.when}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ef-ocean)", margin: "4px 0 6px" }}>{r.trade}</div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--ef-600)", lineHeight: 1.55 }}>{r.desc}</p>
              <div style={{ display: "flex", gap: 14, marginTop: 12, alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--ef-500)", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="phone" />{r.phone}</span>
                <div style={{ flex: 1 }}></div>
                <Btn variant="accent" size="sm" icon="file-text" onClick={() => estimate(r)}>Send estimate</Btn>
                <Btn variant="ghost" size="sm" onClick={() => decline(r)}>Archive</Btn>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Placeholder for Recovery/Settings (reuse) ──
function SimpleScreen({ title, sub, children }) {
  return (
    <div className="content reveal">
      <div className="page-head"><div><h1>{title}</h1><p>{sub}</p></div></div>
      {children}
    </div>
  );
}

Object.assign(window, {
  Sidebar, TopBar, TodayScreen, InvoicesScreen, EstimatesScreen,
  ClientsScreen, JobRequestsScreen, SimpleScreen, NAV,
});
