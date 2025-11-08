"use client";

import { useEffect, useMemo, useState } from "react";

type Contractor = {
  id: string;
  name: string;
  note?: string;
};

type Labour = {
  id: string;
  contractorId: string;
  name: string;
  dailyRate: number; // in local currency
};

type AttendanceRecord = {
  id: string; // `${labourId}:${yyyy-mm-dd}`
  labourId: string;
  date: string; // yyyy-mm-dd
  present: boolean;
};

type AppData = {
  contractors: Contractor[];
  labours: Labour[];
  attendance: AttendanceRecord[];
};

const STORAGE_KEY = "plumb_agent_data_v1";

function newId(prefix: string = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toFixed(0)}`;
  }
}

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
function endOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth() + 1, 0); }
function addMonths(date: Date, count: number): Date { return new Date(date.getFullYear(), date.getMonth() + count, 1); }

function getMonthGrid(dateInMonth: Date): Array<Array<Date | null>> {
  const first = startOfMonth(dateInMonth);
  const last = endOfMonth(dateInMonth);
  const startDay = first.getDay(); // 0=Sun
  const daysInMonth = last.getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

export default function Page() {
  const [data, setData] = usePersistentState<AppData>(STORAGE_KEY, {
    contractors: [],
    labours: [],
    attendance: [],
  });

  const [tab, setTab] = useState<"dashboard" | "attendance" | "reports">("dashboard");
  const [selectedContractorId, setSelectedContractorId] = useState<string | "all">("all");

  const contractors = data.contractors;
  const labours = useMemo(() => data.labours.filter(l => selectedContractorId === "all" ? true : l.contractorId === selectedContractorId), [data.labours, selectedContractorId]);

  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const monthRows = useMemo(() => getMonthGrid(month), [month]);

  function upsertContractor(name: string, note?: string) {
    setData(prev => ({ ...prev, contractors: [...prev.contractors, { id: newId("ctr"), name, note }] }));
  }
  function removeContractor(id: string) {
    setData(prev => ({
      ...prev,
      contractors: prev.contractors.filter(c => c.id !== id),
      labours: prev.labours.filter(l => l.contractorId !== id),
      attendance: prev.attendance.filter(a => prev.labours.find(l => l.id === a.labourId)?.contractorId !== id)
    }));
  }

  function upsertLabour(contractorId: string, name: string, dailyRate: number) {
    setData(prev => ({ ...prev, labours: [...prev.labours, { id: newId("lab"), contractorId, name, dailyRate }] }));
  }
  function removeLabour(id: string) {
    setData(prev => ({
      ...prev,
      labours: prev.labours.filter(l => l.id !== id),
      attendance: prev.attendance.filter(a => a.labourId !== id),
    }));
  }

  function setAttendance(labourId: string, ymd: string, present: boolean) {
    setData(prev => {
      const id = `${labourId}:${ymd}`;
      const exists = prev.attendance.find(a => a.id === id);
      const attendance = exists
        ? prev.attendance.map(a => a.id === id ? { ...a, present } : a)
        : [...prev.attendance, { id, labourId, date: ymd, present }];
      return { ...prev, attendance };
    });
  }

  function daysPresentFor(labourId: string, monthDate: Date) {
    const first = startOfMonth(monthDate);
    const last = endOfMonth(monthDate);
    const ymdFirst = toYMD(first);
    const ymdLast = toYMD(last);
    const list = data.attendance.filter(a => a.labourId === labourId && a.date >= ymdFirst && a.date <= ymdLast && a.present);
    return list.length;
  }

  const totals = useMemo(() => {
    const byContractor: Record<string, { days: number; amount: number; labourCount: number }> = {};
    for (const labour of data.labours) {
      const days = daysPresentFor(labour.id, month);
      const amount = days * labour.dailyRate;
      const key = labour.contractorId;
      byContractor[key] ||= { days: 0, amount: 0, labourCount: 0 };
      byContractor[key].days += days;
      byContractor[key].amount += amount;
      byContractor[key].labourCount += 1;
    }
    const grand = Object.values(byContractor).reduce((acc, v) => ({ days: acc.days + v.days, amount: acc.amount + v.amount, labourCount: acc.labourCount + v.labourCount }), { days: 0, amount: 0, labourCount: 0 });
    return { byContractor, grand };
  }, [data.labours, data.attendance, month]);

  const [ctrName, setCtrName] = useState("");
  const [ctrNote, setCtrNote] = useState("");

  const [labName, setLabName] = useState("");
  const [labRate, setLabRate] = useState<string>("");
  const [labCtr, setLabCtr] = useState<string>("");

  useEffect(() => {
    if (!labCtr && contractors[0]) setLabCtr(contractors[0].id);
  }, [contractors, labCtr]);

  function MonthHeader() {
    const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
    return (
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <button className="button secondary" onClick={() => setMonth(addMonths(month, -1))}>?</button>
          <div className="badge">{monthLabel}</div>
          <button className="button secondary" onClick={() => setMonth(addMonths(month, +1))}>?</button>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="button ghost" onClick={() => setMonth(startOfMonth(new Date()))}>This month</button>
        </div>
      </div>
    );
  }

  function AttendanceCalendar() {
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return (
      <div className="panel">
        <MonthHeader />
        <div className="calendar">
          <div className="calendar-head">
            {weekdays.map(d => (<span key={d}>{d}</span>))}
          </div>
          {monthRows.map((row, i) => (
            <div className="calendar-row" key={i}>
              {row.map((date, j) => (
                <div className="calendar-cell" key={j}>
                  {date && (
                    <div>
                      <div className="cell-date">{date.getDate()}</div>
                      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                        {labours.map(l => {
                          const ymd = toYMD(date);
                          const id = `${l.id}:${ymd}`;
                          const present = data.attendance.find(a => a.id === id)?.present ?? false;
                          return (
                            <label key={l.id} className="toggle" title={`${l.name} - ${present ? "Present" : "Absent"}`}>
                              <input
                                type="checkbox"
                                checked={present}
                                onChange={e => setAttendance(l.id, ymd, e.target.checked)}
                                style={{ accentColor: present ? "var(--accent-2)" : "var(--border)" }}
                              />
                              <span style={{ fontSize: 12 }}>{l.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Dashboard() {
    return (
      <div className="grid">
        <div className="panel" style={{ gridColumn: "span 5" }}>
          <h2>Add Contractor</h2>
          <div className="row" style={{ flexDirection: "column", gap: 10 }}>
            <input className="input" placeholder="Contractor name" value={ctrName} onChange={e => setCtrName(e.target.value)} />
            <input className="input" placeholder="Note (optional)" value={ctrNote} onChange={e => setCtrNote(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="button" onClick={() => { if (!ctrName.trim()) return; upsertContractor(ctrName.trim(), ctrNote.trim() || undefined); setCtrName(""); setCtrNote(""); }}>Add contractor</button>
            </div>
          </div>
        </div>

        <div className="panel" style={{ gridColumn: "span 7" }}>
          <h2>Contractors</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Labours</th>
                <th>Month Days</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contractors.map(c => {
                const t = totals.byContractor[c.id] || { days: 0, amount: 0, labourCount: 0 };
                return (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <strong>{c.name}</strong>
                        {c.note && <span className="badge" style={{ marginTop: 6 }}>{c.note}</span>}
                      </div>
                    </td>
                    <td>{t.labourCount}</td>
                    <td>{t.days}</td>
                    <td>{formatCurrency(t.amount)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="button danger" onClick={() => removeContractor(c.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {contractors.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No contractors yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{ gridColumn: "span 5" }}>
          <h2>Add Labour</h2>
          <div className="row" style={{ flexDirection: "column", gap: 10 }}>
            <select className="select" value={labCtr} onChange={e => setLabCtr(e.target.value)}>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="input" placeholder="Labour name" value={labName} onChange={e => setLabName(e.target.value)} />
            <input className="input" placeholder="Daily rate (e.g. 800)" value={labRate} onChange={e => setLabRate(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="button" onClick={() => {
                const rate = Number(labRate);
                if (!labCtr || !labName.trim() || !Number.isFinite(rate) || rate <= 0) return;
                upsertLabour(labCtr, labName.trim(), Math.round(rate));
                setLabName(""); setLabRate("");
              }}>Add labour</button>
            </div>
          </div>
        </div>

        <div className="panel" style={{ gridColumn: "span 7" }}>
          <h2>Labours</h2>
          <div className="row" style={{ marginBottom: 10, gap: 8 }}>
            <span className="badge">Filter:</span>
            <select className="select" value={selectedContractorId} onChange={e => setSelectedContractorId(e.target.value)} style={{ maxWidth: 280 }}>
              <option value="all">All contractors</option>
              {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contractor</th>
                <th>Rate</th>
                <th>Days ({month.toLocaleString(undefined, { month: "short" })})</th>
                <th>Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {labours.map(l => {
                const ctr = contractors.find(c => c.id === l.contractorId);
                const days = daysPresentFor(l.id, month);
                const amount = days * l.dailyRate;
                return (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>{ctr?.name || "-"}</td>
                    <td>{formatCurrency(l.dailyRate)}</td>
                    <td>{days}</td>
                    <td>{formatCurrency(amount)}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="button danger" onClick={() => removeLabour(l.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })}
              {labours.length === 0 && (
                <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No labours yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function Reports() {
    return (
      <div className="panel">
        <MonthHeader />
        <table className="table">
          <thead>
            <tr>
              <th>Contractor</th>
              <th>Labours</th>
              <th>Days</th>
              <th>Total Amount</th>
            </tr>
          </thead>
          <tbody>
            {contractors.map(c => {
              const t = totals.byContractor[c.id] || { days: 0, amount: 0, labourCount: 0 };
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{t.labourCount}</td>
                  <td>{t.days}</td>
                  <td>{formatCurrency(t.amount)}</td>
                </tr>
              );
            })}
            {contractors.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No data</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th style={{ textAlign: "right" }}>Grand total:</th>
              <th>{totals.grand.labourCount}</th>
              <th>{totals.grand.days}</th>
              <th>{formatCurrency(totals.grand.amount)}</th>
            </tr>
          </tfoot>
        </table>
        <div className="footer">
          Tip: Use the Attendance tab to mark who is present on each day.
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div className="title">Plumbing Attendance Agent</div>
        <div className="tabs">
          <div className={`tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>Dashboard</div>
          <div className={`tab ${tab === "attendance" ? "active" : ""}`} onClick={() => setTab("attendance")}>Attendance</div>
          <div className={`tab ${tab === "reports" ? "active" : ""}`} onClick={() => setTab("reports")}>Reports</div>
        </div>
      </div>

      {tab === "dashboard" && <Dashboard />}
      {tab === "attendance" && (
        <div className="grid">
          <div className="panel" style={{ gridColumn: "span 12" }}>
            <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span className="badge">Labours filter:</span>
              <select className="select" value={selectedContractorId} onChange={e => setSelectedContractorId(e.target.value)} style={{ maxWidth: 280 }}>
                <option value="all">All contractors</option>
                {contractors.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <AttendanceCalendar />
          </div>
        </div>
      )}
      {tab === "reports" && <Reports />}

      <div className="footer">Data is stored in your browser on this device.</div>
    </div>
  );
}
