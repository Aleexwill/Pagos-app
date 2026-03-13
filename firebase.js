import { useState, useEffect, useCallback } from "react";
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs
} from "firebase/firestore";
import { db, messaging, getToken, onMessage, VAPID_KEY } from "./firebase.js";

// ─── ADMIN CREDENTIALS ───────────────────────────────────────────────────────
const ADMIN_USER = "admin";
const ADMIN_DEFAULT_PASS = "admin2026"; // solo usado la primera vez

async function fbGetAdminConfig() {
  try {
    const snap = await getDoc(doc(db, "config", "admin"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}
async function fbSetAdminConfig(data) {
  await setDoc(doc(db, "config", "admin"), data);
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "utilities",    label: "Servicios",    emoji: "💡" },
  { id: "internet",     label: "Internet/Tel", emoji: "📡" },
  { id: "rent",         label: "Alquiler",     emoji: "🏠" },
  { id: "insurance",    label: "Seguro",       emoji: "🛡️" },
  { id: "subscription", label: "Suscripción",  emoji: "📱" },
  { id: "credit",       label: "Crédito",      emoji: "💳" },
  { id: "taxes",        label: "Impuestos",    emoji: "🏛️" },
  { id: "other",        label: "Otro",         emoji: "📋" },
];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const getCatEmoji = id => CATEGORIES.find(c => c.id === id)?.emoji || "📋";
const getCatLabel = id => CATEGORIES.find(c => c.id === id)?.label || "Otro";
const formatCurrency = n => new Intl.NumberFormat("es-PY",{style:"currency",currency:"PYG",maximumFractionDigits:0}).format(n||0);
const formatDate = d => { if(!d) return "—"; const [y,m,dd]=d.split("-"); return `${dd}/${m}/${y}`; };

// ─── FIREBASE HELPERS ────────────────────────────────────────────────────────
async function fbGetUser(username) {
  try {
    const snap = await getDoc(doc(db, "users", username));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}
async function fbSetUser(username, data) {
  await setDoc(doc(db, "users", username), data);
}
async function fbGetBills(username) {
  try {
    const snap = await getDoc(doc(db, "bills", username));
    return snap.exists() ? (snap.data().list || []) : [];
  } catch { return []; }
}
async function fbSetBills(username, bills) {
  await setDoc(doc(db, "bills", username), { list: bills });
}
async function fbDeleteUser(username) {
  await deleteDoc(doc(db, "users", username));
  await deleteDoc(doc(db, "bills", username));
}
async function fbGetAllUsers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    return snap.docs.map(d => d.data());
  } catch { return []; }
}


// ─── NOTIFICATION HELPERS ─────────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!("Notification" in window)) return null;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;
  if (!messaging) return null;
  try {
    await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    return token;
  } catch(e) { console.warn("FCM token error:", e); return null; }
}

async function fbSaveFCMToken(username, token) {
  await setDoc(doc(db, "fcm_tokens", username), { token, updatedAt: new Date().toISOString() });
}

function checkAndScheduleReminders(bills) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = new Date(); today.setHours(0,0,0,0);
  const year = today.getFullYear(), month = today.getMonth()+1;
  bills.forEach(bill => {
    if (!bill.reminderDays || bill.reminderDays === 0) return;
    const payKey = `${year}-${month}`;
    if (bill.payments?.[payKey]) return;
    const dueDate = new Date(`${year}-${String(month).padStart(2,"0")}-${String(bill.dueDay||1).padStart(2,"0")}`);
    dueDate.setHours(0,0,0,0);
    const daysUntil = Math.round((dueDate - today) / 86400000);
    if (daysUntil === parseInt(bill.reminderDays) || daysUntil === 0) {
      const msg = daysUntil === 0
        ? `⚠️ ${bill.name} vence HOY`
        : `📅 ${bill.name} vence en ${daysUntil} día${daysUntil!==1?"s":""}`;
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification("💰 PagosApp — Recordatorio", {
          body: msg, icon: "/icon.svg", badge: "/icon.svg",
          tag: `reminder-${bill.id}-${payKey}`, data: { billId: bill.id },
          actions: [{ action: "open", title: "Ver cuentas" }]
        });
      }).catch(() => { new Notification("💰 PagosApp", { body: msg }); });
    }
  });
}

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#090d18;--surface:#101623;--surface2:#18203a;--border:#1e2d47;
  --accent:#00e5ff;--accent2:#7c3aed;--gold:#f59e0b;
  --success:#10b981;--warning:#f59e0b;--danger:#ef4444;
  --text:#e2e8f0;--muted:#64748b;
  --fh:'Syne',sans-serif;--fb:'DM Sans',sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--fb);min-height:100vh}
.app{min-height:100vh;display:flex;flex-direction:column}
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 25% 25%,#0b1e40 0%,var(--bg) 55%),radial-gradient(ellipse at 80% 75%,#1a0d3c 0%,transparent 50%)}
.auth-card{background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:40px;width:380px;max-width:95vw;box-shadow:0 0 80px rgba(0,229,255,.05);animation:fadeUp .5s ease}
.auth-logo{font-family:var(--fh);font-size:28px;font-weight:800;color:var(--accent);margin-bottom:4px}
.auth-sub{color:var(--muted);font-size:13px;margin-bottom:28px}
.auth-tabs{display:flex;gap:4px;margin-bottom:22px;background:var(--bg);border-radius:12px;padding:4px}
.auth-tab{flex:1;padding:9px;border:none;background:transparent;color:var(--muted);border-radius:9px;cursor:pointer;font-family:var(--fb);font-size:13px;font-weight:500;transition:all .2s}
.auth-tab.active{background:var(--surface2);color:var(--text)}
.auth-divider{display:flex;align-items:center;gap:10px;margin:18px 0;color:var(--muted);font-size:12px}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}
.admin-btn{width:100%;padding:11px;border-radius:12px;border:1px solid rgba(245,158,11,.3);background:rgba(245,158,11,.08);color:var(--gold);cursor:pointer;font-family:var(--fb);font-size:13px;font-weight:600;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
.admin-btn:hover{background:rgba(245,158,11,.18)}
.field{margin-bottom:16px}
.field label{display:block;font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.07em}
.field input,.field select{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--text);font-family:var(--fb);font-size:14px;outline:none;transition:border .2s}
.field input:focus,.field select:focus{border-color:var(--accent)}
.field select option{background:var(--bg)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:10px 20px;border-radius:10px;border:none;cursor:pointer;font-family:var(--fb);font-size:14px;font-weight:500;transition:all .2s}
.btn-primary{background:var(--accent);color:#000}.btn-primary:hover{background:#33eaff;transform:translateY(-1px);box-shadow:0 4px 20px rgba(0,229,255,.25)}
.btn-secondary{background:var(--surface2);color:var(--text);border:1px solid var(--border)}.btn-secondary:hover{border-color:var(--accent)}
.btn-danger{background:rgba(239,68,68,.12);color:var(--danger);border:1px solid rgba(239,68,68,.25)}.btn-danger:hover{background:rgba(239,68,68,.22)}
.btn-success{background:rgba(16,185,129,.12);color:var(--success);border:1px solid rgba(16,185,129,.25)}
.btn-gold{background:rgba(245,158,11,.12);color:var(--gold);border:1px solid rgba(245,158,11,.25)}.btn-gold:hover{background:rgba(245,158,11,.22)}
.btn-full{width:100%}.btn-sm{padding:6px 12px;font-size:12px;border-radius:8px}
.header{background:var(--surface);border-bottom:1px solid var(--border);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;backdrop-filter:blur(12px)}
.header-logo{font-family:var(--fh);font-size:18px;font-weight:800;color:var(--accent)}
.header-right{display:flex;align-items:center;gap:10px}
.avatar{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff}
.avatar-user{background:linear-gradient(135deg,var(--accent2),var(--accent))}.avatar-admin{background:linear-gradient(135deg,#b45309,var(--gold))}
.admin-badge{background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.3);color:var(--gold);font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;text-transform:uppercase;letter-spacing:.08em}
.nav{display:flex;gap:4px;padding:10px 20px;border-bottom:1px solid var(--border);background:var(--surface);overflow-x:auto}
.nav-btn{padding:7px 16px;border-radius:8px;border:none;background:transparent;color:var(--muted);cursor:pointer;font-family:var(--fb);font-size:13px;font-weight:500;white-space:nowrap;transition:all .2s}
.nav-btn.active{background:var(--surface2);color:var(--accent)}.nav-btn.admin-nav.active{color:var(--gold)}
.main{flex:1;padding:20px;max-width:960px;margin:0 auto;width:100%}
.dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin-bottom:24px}
.dash-card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;animation:fadeUp .4s ease}
.dash-card.gold{border-color:rgba(245,158,11,.2);background:linear-gradient(135deg,rgba(245,158,11,.04),var(--surface))}
.dash-label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.dash-value{font-family:var(--fh);font-size:26px;font-weight:700}
.c-accent{color:var(--accent)}.c-success{color:var(--success)}.c-warning{color:var(--warning)}.c-danger{color:var(--danger)}.c-gold{color:var(--gold)}
.ring-wrap{display:flex;align-items:center;justify-content:center;margin:4px 0 20px}
.bills-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.section-title{font-family:var(--fh);font-size:18px;font-weight:700}
.bill-item{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:15px;margin-bottom:10px;display:flex;align-items:center;gap:12px;transition:transform .15s;animation:fadeUp .3s ease}
.bill-item:hover{transform:translateX(2px)}.bill-item.paid{border-left:3px solid var(--success)}.bill-item.overdue{border-left:3px solid var(--danger)}.bill-item.upcoming{border-left:3px solid var(--warning)}
.bill-icon{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;background:var(--surface2)}
.bill-info{flex:1;min-width:0}.bill-name{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bill-meta{font-size:12px;color:var(--muted);margin-top:2px}.bill-amount{font-family:var(--fh);font-size:16px;font-weight:700;text-align:right;margin-right:8px;white-space:nowrap}
.bill-actions{display:flex;gap:5px;flex-shrink:0}
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.badge-paid{background:rgba(16,185,129,.15);color:var(--success)}.badge-overdue{background:rgba(239,68,68,.15);color:var(--danger)}
.badge-upcoming{background:rgba(245,158,11,.15);color:var(--warning)}.badge-pending{background:rgba(100,116,139,.15);color:var(--muted)}
.badge-suspended{background:rgba(239,68,68,.12);color:var(--danger)}.badge-active{background:rgba(16,185,129,.12);color:var(--success)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;animation:fadeIn .2s ease}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;animation:scaleIn .25s ease}
.modal-title{font-family:var(--fh);font-size:20px;font-weight:700;margin-bottom:20px}
.modal-footer{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}
.admin-banner{background:linear-gradient(135deg,rgba(245,158,11,.08),rgba(180,83,9,.04));border:1px solid rgba(245,158,11,.2);border-radius:16px;padding:20px;margin-bottom:24px;display:flex;align-items:center;gap:16px}
.admin-banner-title{font-family:var(--fh);font-size:20px;font-weight:800;color:var(--gold)}
.admin-banner-sub{font-size:13px;color:var(--muted);margin-top:2px}
.inner-tabs{display:flex;gap:4px;margin-bottom:20px;background:var(--bg);border-radius:10px;padding:4px;width:fit-content}
.inner-tab{padding:7px 16px;border:none;background:transparent;color:var(--muted);border-radius:8px;cursor:pointer;font-family:var(--fb);font-size:13px;font-weight:500;transition:all .2s}
.inner-tab.active{background:var(--surface2);color:var(--gold)}
.user-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:12px;animation:fadeUp .3s ease}
.user-card.suspended{opacity:.6;border-color:rgba(239,68,68,.2)}
.user-top{display:flex;align-items:center;gap:14px;margin-bottom:14px}
.user-av{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-weight:700;font-size:18px;color:#fff;flex-shrink:0}
.user-name-row{font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.user-since{font-size:12px;color:var(--muted);margin-top:2px}
.user-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.user-stat{background:var(--surface2);border-radius:10px;padding:10px;text-align:center}
.user-stat-val{font-family:var(--fh);font-size:17px;font-weight:700}
.user-stat-lbl{font-size:10px;color:var(--muted);margin-top:2px;text-transform:uppercase}
.user-actions{display:flex;gap:8px;flex-wrap:wrap}
.detail-bills{margin-top:14px;border-top:1px solid var(--border);padding-top:14px}
.detail-row{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(30,45,71,.5);font-size:13px}
.detail-row:last-child{border:none}
.month-group{margin-bottom:24px}
.month-title{font-family:var(--fh);font-size:14px;font-weight:700;color:var(--accent);padding:8px 0;border-bottom:1px solid var(--border);margin-bottom:12px;display:flex;justify-content:space-between}
.history-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(30,45,71,.5);font-size:14px}
.history-row:last-child{border:none}
.summary-bar{background:var(--surface2);border-radius:8px;height:9px;overflow:hidden;margin:7px 0 4px}
.summary-fill{height:100%;border-radius:8px;transition:width 1.2s ease}
.summary-row{display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
.empty{text-align:center;padding:60px 20px;color:var(--muted)}
.empty-icon{font-size:46px;margin-bottom:14px}.empty-title{font-family:var(--fh);font-size:17px;color:var(--text);margin-bottom:8px}
.toast{position:fixed;bottom:24px;right:24px;background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:12px 18px;font-size:14px;z-index:999;animation:fadeUp .3s ease;display:flex;align-items:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,.4)}
.search-bar{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:9px 14px;color:var(--text);font-family:var(--fb);font-size:14px;outline:none;width:100%;margin-bottom:16px;transition:border .2s}
.notif-banner{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(0,229,255,.04));border:1px solid rgba(124,58,237,.25);border-radius:14px;padding:16px;margin-bottom:20px;animation:fadeUp .4s ease}
.notif-banner-icon{font-size:28px;flex-shrink:0}
.notif-banner-title{font-family:var(--fh);font-size:14px;font-weight:700;color:var(--accent)}
.notif-banner-sub{font-size:12px;color:var(--muted);margin-top:2px}
.notif-status{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:20px;font-weight:600}
.notif-on{background:rgba(16,185,129,.12);color:var(--success)}
.notif-off{background:rgba(100,116,139,.12);color:var(--muted)}
.notif-blocked{background:rgba(239,68,68,.12);color:var(--danger)}
.reminder-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 8px;border-radius:20px;background:rgba(124,58,237,.15);color:#a78bfa;margin-left:6px}

.search-bar:focus{border-color:var(--accent)}
.spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(0,229,255,.3);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes scaleIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
@media(max-width:520px){.main{padding:12px}.dash-grid{grid-template-columns:1fr 1fr}.bill-actions{flex-direction:column}}
`;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function getBillStatus(bill, year, month) {
  const today = new Date();
  const key = `${year}-${month}`;
  if (bill.payments?.[key]) return "paid";
  const due = new Date(`${year}-${String(month).padStart(2,"0")}-${String(bill.dueDay||1).padStart(2,"0")}`);
  if (due < today) return "overdue";
  if ((due - today) / 86400000 <= 5) return "upcoming";
  return "pending";
}
function userColor(name) {
  const colors = ["linear-gradient(135deg,#7c3aed,#a78bfa)","linear-gradient(135deg,#0369a1,#38bdf8)","linear-gradient(135deg,#065f46,#34d399)","linear-gradient(135deg,#9d174d,#f472b6)","linear-gradient(135deg,#92400e,#fbbf24)","linear-gradient(135deg,#1e3a5f,#00e5ff)"];
  let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))%colors.length;
  return colors[h];
}

// ─── COMPONENTS ──────────────────────────────────────────────────────────────
function Toast({ msg, type="success" }) {
  return <div className="toast">{type==="success"?"✅":type==="error"?"❌":"ℹ️"} {msg}</div>;
}

function ProgressRing({ pct }) {
  const r=52, circ=2*Math.PI*r, offset=circ-(Math.min(pct,100)/100)*circ;
  const color=pct>=80?"#10b981":pct>=40?"#f59e0b":"#ef4444";
  return (
    <div className="ring-wrap">
      <svg width="130" height="130" viewBox="0 0 130 130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#1c2436" strokeWidth="11"/>
        <circle cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="11"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 65 65)" style={{transition:"stroke-dashoffset 1s ease"}}/>
        <text x="65" y="60" textAnchor="middle" style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:28,fill:"#e2e8f0"}}>{pct}%</text>
        <text x="65" y="77" textAnchor="middle" style={{fontFamily:"'DM Sans',sans-serif",fontSize:11,fill:"#64748b"}}>pagado</text>
      </svg>
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ username:"", password:"", name:"" });
  const [adminPass, setAdminPass] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);
  // first-login change password state
  const [mustChange, setMustChange] = useState(false);
  const [newPass1, setNewPass1] = useState("");
  const [newPass2, setNewPass2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError(""); setBusy(true);
    try {
      if (!form.username||!form.password) { setError("Completá todos los campos"); return; }
      if (tab==="register") {
        if (form.username.toLowerCase()===ADMIN_USER) { setError("Nombre de usuario reservado"); return; }
        const ex = await fbGetUser(form.username.toLowerCase());
        if (ex) { setError("Ese usuario ya existe"); return; }
        const userData = { username:form.username.toLowerCase(), name:form.name||form.username, password:form.password, createdAt:new Date().toISOString(), suspended:false };
        await fbSetUser(form.username.toLowerCase(), userData);
        onLogin({ username:userData.username, name:userData.name, isAdmin:false });
      } else {
        const u = await fbGetUser(form.username.toLowerCase());
        if (!u) { setError("Usuario no encontrado"); return; }
        if (u.password!==form.password) { setError("Contraseña incorrecta"); return; }
        if (u.suspended) { setError("Cuenta suspendida. Contactá al administrador."); return; }
        onLogin({ username:u.username, name:u.name, isAdmin:false });
      }
    } catch(e) { setError("Error de conexión: "+e.message); }
    finally { setBusy(false); }
  }

  async function handleAdminLogin() {
    setError(""); setBusy(true);
    try {
      // Check if a custom password has been saved in Firebase
      const config = await fbGetAdminConfig();
      const currentPass = config?.password || ADMIN_DEFAULT_PASS;
      const isFirstLogin = !config?.password;

      if (adminPass !== currentPass) { setError("Contraseña maestra incorrecta"); return; }

      if (isFirstLogin) {
        // First time — force password change before entering
        setMustChange(true);
      } else {
        onLogin({ username:ADMIN_USER, name:"Administrador", isAdmin:true });
      }
    } catch(e) { setError("Error: "+e.message); }
    finally { setBusy(false); }
  }

  async function handleChangeAdminPass() {
    setError("");
    if (!newPass1) { setError("Ingresá la nueva contraseña"); return; }
    if (newPass1.length < 6) { setError("Mínimo 6 caracteres"); return; }
    if (newPass1 !== newPass2) { setError("Las contraseñas no coinciden"); return; }
    setBusy(true);
    try {
      await fbSetAdminConfig({ password: newPass1, updatedAt: new Date().toISOString() });
      onLogin({ username:ADMIN_USER, name:"Administrador", isAdmin:true });
    } catch(e) { setError("Error al guardar: "+e.message); }
    finally { setBusy(false); }
  }

  // ── Pantalla de cambio obligatorio de contraseña ──
  if (mustChange) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:40,marginBottom:10}}>🔐</div>
            <div style={{fontFamily:"var(--fh)",fontSize:20,fontWeight:800,color:"var(--gold)"}}>Primer ingreso</div>
            <div style={{fontSize:13,color:"var(--muted)",marginTop:6}}>Establecé una contraseña maestra segura.<br/>No se mostrará en ningún lugar.</div>
          </div>
          <div style={{background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.2)",borderRadius:12,padding:"12px 16px",fontSize:12,color:"var(--gold)",marginBottom:20}}>
            ⚠️ Una vez que la cambies, la contraseña <strong>admin2026</strong> dejará de funcionar.
          </div>
          <div className="field">
            <label>Nueva contraseña maestra</label>
            <input type="password" value={newPass1} onChange={e=>setNewPass1(e.target.value)} placeholder="Mínimo 6 caracteres" style={{borderColor:"rgba(245,158,11,.4)"}}/>
          </div>
          <div className="field">
            <label>Repetir contraseña</label>
            <input type="password" value={newPass2} onChange={e=>setNewPass2(e.target.value)} placeholder="Repetí la contraseña"
              style={{borderColor:"rgba(245,158,11,.4)"}} onKeyDown={e=>e.key==="Enter"&&handleChangeAdminPass()}/>
          </div>
          {error&&<div style={{color:"var(--danger)",fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
          <button className="btn btn-gold btn-full" onClick={handleChangeAdminPass} disabled={busy}>
            {busy?<span className="spinner"/>:"✅ Guardar y entrar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">💰 PagosApp</div>
        <div className="auth-sub">Gestor de cuentas y recordatorios</div>
        {!showAdmin ? (
          <>
            <div className="auth-tabs">
              <button className={`auth-tab ${tab==="login"?"active":""}`} onClick={()=>setTab("login")}>Ingresar</button>
              <button className={`auth-tab ${tab==="register"?"active":""}`} onClick={()=>setTab("register")}>Registrarse</button>
            </div>
            {tab==="register"&&<div className="field"><label>Nombre</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Tu nombre"/></div>}
            <div className="field"><label>Usuario</label><input value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} placeholder="usuario"/></div>
            <div className="field"><label>Contraseña</label><input type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••" onKeyDown={e=>e.key==="Enter"&&handleSubmit()}/></div>
            {error&&<div style={{color:"var(--danger)",fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
            <button className="btn btn-primary btn-full" onClick={handleSubmit} disabled={busy} style={{marginBottom:16}}>
              {busy?<span className="spinner"/>:(tab==="login"?"Ingresar":"Crear cuenta")}
            </button>
            <div className="auth-divider">acceso especial</div>
            <button className="admin-btn" onClick={()=>{setShowAdmin(true);setError("")}}>🔐 Acceso Administrador</button>
          </>
        ) : (
          <>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:22,padding:"14px",background:"rgba(245,158,11,.06)",borderRadius:12,border:"1px solid rgba(245,158,11,.2)"}}>
              <span style={{fontSize:28}}>🔐</span>
              <div><div style={{fontFamily:"var(--fh)",fontWeight:700,fontSize:15,color:"var(--gold)"}}>Panel Administrador</div><div style={{fontSize:12,color:"var(--muted)"}}>Ingresá la contraseña maestra</div></div>
            </div>
            <div className="field"><label>Contraseña maestra</label><input type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&handleAdminLogin()} style={{borderColor:"rgba(245,158,11,.3)"}}/></div>
            {error&&<div style={{color:"var(--danger)",fontSize:13,marginBottom:12}}>⚠️ {error}</div>}
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-secondary" style={{flex:1}} onClick={()=>{setShowAdmin(false);setError("")}}>← Volver</button>
              <button className="btn btn-gold" style={{flex:1}} onClick={handleAdminLogin} disabled={busy}>{busy?<span className="spinner"/>:"Ingresar"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── BILL MODAL ───────────────────────────────────────────────────────────────
function BillModal({ bill, onSave, onClose, notifEnabled }) {
  const [form, setForm] = useState(bill||{name:"",category:"utilities",amount:"",dueDay:"1",recurrent:true,notes:"",reminderDays:3});
  function save() {
    if(!form.name||!form.amount) return;
    onSave({...form,amount:parseFloat(form.amount),dueDay:parseInt(form.dueDay)||1,reminderDays:parseInt(form.reminderDays)||0,id:form.id||Date.now().toString()});
  }
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-title">{bill?"✏️ Editar cuenta":"➕ Nueva cuenta"}</div>
        <div className="field"><label>Nombre</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ej: Luz, Internet..."/></div>
        <div className="field"><label>Categoría</label>
          <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
            {CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>
        <div className="field"><label>Monto estimado (Gs.)</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0"/></div>
        <div className="field"><label>Día de vencimiento</label><input type="number" min="1" max="31" value={form.dueDay} onChange={e=>setForm(f=>({...f,dueDay:e.target.value}))}/></div>
        <div className="field"><label>¿Recurrente mensual?</label>
          <select value={form.recurrent?"yes":"no"} onChange={e=>setForm(f=>({...f,recurrent:e.target.value==="yes"}))}>
            <option value="yes">Sí, todos los meses</option><option value="no">No, solo este mes</option>
          </select>
        </div>
        <div className="field">
          <label>🔔 Recordatorio</label>
          {!notifEnabled && <div style={{fontSize:11,color:"var(--warning)",marginBottom:6}}>⚠️ Activá las notificaciones para recibir recordatorios</div>}
          <select value={form.reminderDays||0} onChange={e=>setForm(f=>({...f,reminderDays:e.target.value}))} disabled={!notifEnabled}>
            <option value="0">Sin recordatorio</option>
            <option value="1">1 día antes</option>
            <option value="2">2 días antes</option>
            <option value="3">3 días antes</option>
            <option value="5">5 días antes</option>
            <option value="7">7 días antes</option>
            <option value="10">10 días antes</option>
          </select>
        </div>
        <div className="field"><label>Notas</label><input value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Opcional..."/></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ─── PAY MODAL ────────────────────────────────────────────────────────────────
function PayModal({ bill, year, month, onSave, onClose }) {
  const key=`${year}-${month}`, ex=bill.payments?.[key];
  const [amount,setAmount]=useState(ex?.amount||bill.amount||"");
  const [date,setDate]=useState(ex?.date||new Date().toISOString().slice(0,10));
  const [receipt,setReceipt]=useState(ex?.receipt||"");
  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-title">💳 Registrar pago</div>
        <div style={{color:"var(--muted)",fontSize:13,marginBottom:18}}>{getCatEmoji(bill.category)} {bill.name} — {MONTHS_FULL[month-1]} {year}</div>
        <div className="field"><label>Monto pagado (Gs.)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
        <div className="field"><label>Fecha de pago</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div className="field"><label>N° comprobante (opcional)</label><input value={receipt} onChange={e=>setReceipt(e.target.value)} placeholder="Opcional..."/></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-success" onClick={()=>onSave({amount:parseFloat(amount),date,receipt})}>✅ Confirmar pago</button>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({ showToast }) {
  const [users, setUsers] = useState([]);
  const [userBills, setUserBills] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState("");
  const [adminTab, setAdminTab] = useState("users");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [resetModal, setResetModal] = useState(null);
  const [newPass, setNewPass] = useState("");
  const [showChangePass, setShowChangePass] = useState(false);
  const [cp1, setCp1] = useState("");
  const [cp2, setCp2] = useState("");
  const [cpErr, setCpErr] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await fbGetAllUsers();
      setUsers(loaded);
      const bmap = {};
      for (const u of loaded) {
        try { bmap[u.username] = await fbGetBills(u.username); }
        catch(e) { bmap[u.username] = []; }
      }
      setUserBills(bmap);
    } catch(e) {
      console.error("loadAll error:", e);
      setLoadError("Error al cargar usuarios: " + e.message + ". Revisá las reglas de Firestore.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSuspend(u) {
    try {
      const upd = {...u, suspended: !u.suspended};
      await fbSetUser(u.username, upd);
      setUsers(prev => prev.map(x => x.username === u.username ? upd : x));
      showToast(upd.suspended ? "Usuario suspendido" : "Usuario reactivado", upd.suspended ? "error" : "success");
    } catch(e) { showToast("Error: " + e.message, "error"); }
  }

  async function deleteUser(u) {
    try {
      await fbDeleteUser(u.username);
      setUsers(prev => prev.filter(x => x.username !== u.username));
      const nb = {...userBills}; delete nb[u.username]; setUserBills(nb);
      showToast("Usuario eliminado", "info");
    } catch(e) { showToast("Error: " + e.message, "error"); }
  }

  async function resetPassword(u) {
    if (!newPass) return;
    try {
      const upd = {...u, password: newPass};
      await fbSetUser(u.username, upd);
      setUsers(prev => prev.map(x => x.username === u.username ? upd : x));
      setResetModal(null); setNewPass("");
      showToast("Contraseña actualizada ✅");
    } catch(e) { showToast("Error: " + e.message, "error"); }
  }

  const today = new Date();
  const ym = `${today.getFullYear()}-${today.getMonth()+1}`;
  const allBills = Object.values(userBills).flat();
  const totalPaidGlobal = allBills.reduce((s,b) => s + (b.payments?.[ym]?.amount || 0), 0);
  const totalEstGlobal = allBills.reduce((s,b) => s + (b.amount || 0), 0);
  const activeUsers = users.filter(u => !u.suspended).length;
  const filtered = users.filter(u =>
    u.username.includes(search.toLowerCase()) ||
    (u.name || "").toLowerCase().includes(search.toLowerCase())
  );

  function getStats(username) {
    const b = userBills[username] || [];
    return {
      total: b.length,
      paid: b.filter(x => x.payments?.[ym]).length,
      totalPaid: b.reduce((s,x) => s + (x.payments?.[ym]?.amount || 0), 0)
    };
  }

  if (loading) return (
    <div className="empty">
      <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
        <span className="spinner" style={{width:32,height:32,borderWidth:3}}/>
      </div>
      <div className="empty-title">Cargando panel...</div>
    </div>
  );

  if (loadError) return (
    <div>
      <div className="admin-banner">
        <span style={{fontSize:36}}>⚠️</span>
        <div>
          <div className="admin-banner-title" style={{color:"var(--danger)"}}>Error al cargar</div>
          <div className="admin-banner-sub">{loadError}</div>
        </div>
      </div>
      <div style={{marginBottom:16,padding:"16px",background:"var(--surface2)",borderRadius:12,fontSize:13,color:"var(--muted)"}}>
        <strong style={{color:"var(--text)"}}>Solución:</strong> En Firebase Console → Firestore → Reglas, asegurate de tener:
        <pre style={{marginTop:8,padding:"10px",background:"var(--bg)",borderRadius:8,fontSize:12,color:"var(--accent)",overflowX:"auto"}}>
{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}
        </pre>
      </div>
      <button className="btn btn-primary" onClick={loadAll}>🔄 Reintentar</button>
    </div>
  );

  return (
    <div>
      <div className="admin-banner">
        <span style={{fontSize:36}}>🔐</span>
        <div>
          <div className="admin-banner-title">Panel de Administración</div>
          <div className="admin-banner-sub">{MONTHS_FULL[today.getMonth()]} {today.getFullYear()} · Firebase 🔥</div>
        </div>
        <div style={{marginLeft:"auto", display:"flex", gap:8}}>
          <button className="btn btn-gold btn-sm" onClick={()=>setShowChangePass(true)}>🔑 Contraseña</button>
          <button className="btn btn-secondary btn-sm" onClick={loadAll}>🔄</button>
        </div>
      </div>

      <div className="inner-tabs">
        <button className={`inner-tab ${adminTab==="users"?"active":""}`} onClick={()=>setAdminTab("users")}>👥 Usuarios ({users.length})</button>
        <button className={`inner-tab ${adminTab==="global"?"active":""}`} onClick={()=>setAdminTab("global")}>📊 Global</button>
      </div>

      {adminTab==="global" && (
        <>
          <div className="dash-grid">
            <div className="dash-card gold"><div className="dash-label">Usuarios registrados</div><div className="dash-value c-gold">{users.length}</div></div>
            <div className="dash-card gold"><div className="dash-label">Usuarios activos</div><div className="dash-value c-success">{activeUsers}</div></div>
            <div className="dash-card gold"><div className="dash-label">Cuentas totales</div><div className="dash-value c-accent">{allBills.length}</div></div>
            <div className="dash-card gold"><div className="dash-label">Pagado este mes</div><div className="dash-value c-success" style={{fontSize:17}}>{formatCurrency(totalPaidGlobal)}</div></div>
            <div className="dash-card gold"><div className="dash-label">Monto estimado</div><div className="dash-value c-warning" style={{fontSize:17}}>{formatCurrency(totalEstGlobal)}</div></div>
          </div>
          <div className="section-title" style={{marginBottom:16}}>Actividad por usuario</div>
          {users.length === 0 ? (
            <div className="empty"><div className="empty-icon">👥</div><div className="empty-title">Sin usuarios aún</div></div>
          ) : users.map(u => {
            const s = getStats(u.username);
            const pct = s.total > 0 ? Math.round((s.paid/s.total)*100) : 0;
            return (
              <div key={u.username} style={{marginBottom:18}}>
                <div className="summary-row" style={{marginBottom:4}}>
                  <span style={{fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:u.suspended?"var(--danger)":"var(--success)",display:"inline-block"}}/>
                    {u.name} <span style={{color:"var(--muted)",fontWeight:400}}>@{u.username}</span>
                  </span>
                  <span style={{color:"var(--success)",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{formatCurrency(s.totalPaid)}</span>
                </div>
                <div className="summary-bar">
                  <div className="summary-fill" style={{width:`${pct}%`,background:"linear-gradient(90deg,var(--accent2),var(--gold))"}}/>
                </div>
                <div className="summary-row"><span>{s.paid}/{s.total} cuentas pagadas ({pct}%)</span></div>
              </div>
            );
          })}
        </>
      )}

      {adminTab==="users" && (
        <>
          <input className="search-bar" placeholder="🔍  Buscar usuario..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filtered.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">👤</div>
              <div className="empty-title">{search ? "Sin resultados" : "Sin usuarios registrados"}</div>
            </div>
          ) : filtered.map(u => {
            const s = getStats(u.username);
            const isExp = expanded === u.username;
            const bills = userBills[u.username] || [];
            return (
              <div key={u.username} className={`user-card ${u.suspended?"suspended":""}`}>
                <div className="user-top">
                  <div className="user-av" style={{background:userColor(u.username)}}>{(u.name||"?")[0].toUpperCase()}</div>
                  <div style={{flex:1}}>
                    <div className="user-name-row">
                      {u.name}
                      <span className={`badge ${u.suspended?"badge-suspended":"badge-active"}`}>{u.suspended?"Suspendido":"Activo"}</span>
                    </div>
                    <div className="user-since">@{u.username} · Desde {u.createdAt ? new Date(u.createdAt).toLocaleDateString("es-PY") : "—"}</div>
                  </div>
                </div>
                <div className="user-stats">
                  <div className="user-stat"><div className="user-stat-val c-accent">{s.total}</div><div className="user-stat-lbl">Cuentas</div></div>
                  <div className="user-stat"><div className="user-stat-val c-success">{s.paid}</div><div className="user-stat-lbl">Pagadas</div></div>
                  <div className="user-stat"><div className="user-stat-val" style={{color:"var(--warning)",fontSize:12}}>{formatCurrency(s.totalPaid)}</div><div className="user-stat-lbl">Total mes</div></div>
                </div>
                <div className="user-actions">
                  <button className="btn btn-secondary btn-sm" onClick={()=>setExpanded(isExp?null:u.username)}>{isExp?"▲ Ocultar":"▼ Ver cuentas"}</button>
                  <button className="btn btn-gold btn-sm" onClick={()=>{setResetModal(u);setNewPass("")}}>🔑 Pass</button>
                  <button className={`btn btn-sm ${u.suspended?"btn-success":"btn-danger"}`} onClick={()=>toggleSuspend(u)}>{u.suspended?"✅ Activar":"⛔ Suspender"}</button>
                  <button className="btn btn-danger btn-sm" onClick={()=>{if(window.confirm(`¿Eliminar a ${u.name}? No se puede deshacer.`)) deleteUser(u)}}>🗑</button>
                </div>
                {isExp && (
                  <div className="detail-bills">
                    <div style={{fontSize:11,color:"var(--muted)",marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Cuentas de {u.name}</div>
                    {bills.length === 0
                      ? <div style={{color:"var(--muted)",fontSize:13}}>Sin cuentas registradas</div>
                      : bills.map(b => {
                          const st = getBillStatus(b, today.getFullYear(), today.getMonth()+1);
                          const pay = b.payments?.[ym];
                          return (
                            <div key={b.id} className="detail-row">
                              <span>{getCatEmoji(b.category)} {b.name}</span>
                              <span style={{display:"flex",alignItems:"center",gap:8}}>
                                <span className={`badge badge-${st}`}>{st==="paid"?"Pagado":st==="overdue"?"Vencido":st==="upcoming"?"Próximo":"Pendiente"}</span>
                                <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:pay?"var(--success)":"var(--text)"}}>{formatCurrency(pay?pay.amount:b.amount)}</span>
                              </span>
                            </div>
                          );
                        })
                    }
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {showChangePass && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setShowChangePass(false)}>
          <div className="modal">
            <div className="modal-title">🔑 Cambiar contraseña maestra</div>
            <div style={{color:"var(--muted)",fontSize:13,marginBottom:18}}>La nueva contraseña se guardará en Firebase.</div>
            <div className="field"><label>Nueva contraseña</label><input type="password" value={cp1} onChange={e=>setCp1(e.target.value)} placeholder="Mínimo 6 caracteres" style={{borderColor:"rgba(245,158,11,.3)"}}/></div>
            <div className="field"><label>Repetir contraseña</label><input type="password" value={cp2} onChange={e=>setCp2(e.target.value)} placeholder="Repetí la contraseña" style={{borderColor:"rgba(245,158,11,.3)"}}/></div>
            {cpErr && <div style={{color:"var(--danger)",fontSize:13,marginBottom:12}}>⚠️ {cpErr}</div>}
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>{setShowChangePass(false);setCp1("");setCp2("");setCpErr("")}}>Cancelar</button>
              <button className="btn btn-gold" onClick={async()=>{
                setCpErr("");
                if (!cp1 || cp1.length < 6) { setCpErr("Mínimo 6 caracteres"); return; }
                if (cp1 !== cp2) { setCpErr("Las contraseñas no coinciden"); return; }
                try {
                  await fbSetAdminConfig({ password: cp1, updatedAt: new Date().toISOString() });
                  setShowChangePass(false); setCp1(""); setCp2("");
                  showToast("Contraseña maestra actualizada ✅");
                } catch(e) { setCpErr("Error al guardar: " + e.message); }
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {resetModal && (
        <div className="overlay" onClick={e=>e.target===e.currentTarget&&setResetModal(null)}>
          <div className="modal">
            <div className="modal-title">🔑 Resetear contraseña</div>
            <div style={{color:"var(--muted)",fontSize:13,marginBottom:18}}>Usuario: <strong style={{color:"var(--text)"}}>{resetModal.name} (@{resetModal.username})</strong></div>
            <div className="field"><label>Nueva contraseña</label><input type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Nueva contraseña"/></div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setResetModal(null)}>Cancelar</button>
              <button className="btn btn-gold" onClick={()=>resetPassword(resetModal)}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function App() {
  const [user,setUser]=useState(null);
  const [bills,setBills]=useState([]);
  const [tab,setTab]=useState("dashboard");
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [loading,setLoading]=useState(true);
  const [notifPerm,setNotifPerm]=useState(()=>{ try{ return "Notification" in window ? Notification.permission : "unsupported"; }catch(e){ return "unsupported"; } });
  const today=new Date();
  const [viewYear,setViewYear]=useState(today.getFullYear());
  const [viewMonth,setViewMonth]=useState(today.getMonth()+1);

  useEffect(()=>{
    const s=sessionStorage.getItem("pagos_user");
    if(s){
      const u=JSON.parse(s);
      setUser(u);
      setTab(u.isAdmin ? "admin" : "dashboard");
      if(!u.isAdmin) loadBillsFor(u.username);
    }
    setLoading(false);
  },[]);

  async function loadBillsFor(username) {
    const b = await fbGetBills(username);
    setBills(b);
    checkAndScheduleReminders(b);
  }

  function showToast(msg,type="success"){ setToast({msg,type}); setTimeout(()=>setToast(null),3000); }

  async function setupNotifications(username) {
    if (!("Notification" in window)) return;
    setNotifPerm(Notification.permission);
    if (Notification.permission === "granted" && messaging) {
      try {
        await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const reg = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
        if (token) await fbSaveFCMToken(username, token);
        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          const {title, body} = payload.notification || {};
          showToast(`🔔 ${body || title}`, "info");
        });
      } catch(e) { console.warn("Notification setup:", e); }
    }
  }

  async function enableNotifications() {
    const token = await requestNotificationPermission();
    setNotifPerm(Notification.permission);
    if (token && user) await fbSaveFCMToken(user.username, token);
    if (Notification.permission === "granted") {
      showToast("🔔 Notificaciones activadas ✅");
      checkAndScheduleReminders(bills);
    } else {
      showToast("Notificaciones bloqueadas — activalas desde configuración del navegador", "error");
    }
  }

  function handleLogin(u){ setUser(u); sessionStorage.setItem("pagos_user",JSON.stringify(u)); setTab(u.isAdmin?"admin":"dashboard"); if(!u.isAdmin){ loadBillsFor(u.username); setupNotifications(u.username); } }
  function handleLogout(){ setUser(null); sessionStorage.removeItem("pagos_user"); setBills([]); setTab("dashboard"); }

  async function saveBill(bill) {
    const exists=bills.find(b=>b.id===bill.id);
    const updated=exists?bills.map(b=>b.id===bill.id?bill:b):[...bills,bill];
    setBills(updated);
    await fbSetBills(user.username, updated);
    setModal(null); showToast(exists?"Cuenta actualizada":"Cuenta agregada ✨");
  }
  async function deleteBill(id) {
    const updated=bills.filter(b=>b.id!==id);
    setBills(updated); await fbSetBills(user.username, updated);
    showToast("Cuenta eliminada","info");
  }
  async function savePayment(bill,y,m,payData) {
    const key=`${y}-${m}`;
    const updated=bills.map(b=>b.id===bill.id?{...b,payments:{...b.payments,[key]:payData}}:b);
    setBills(updated); await fbSetBills(user.username, updated);
    setModal(null); showToast("Pago registrado ✅");
  }
  async function removePayment(bill,y,m) {
    const key=`${y}-${m}`, np={...bill.payments}; delete np[key];
    const updated=bills.map(b=>b.id===bill.id?{...b,payments:np}:b);
    setBills(updated); await fbSetBills(user.username, updated);
    showToast("Pago revertido","info");
  }

  const monthBills=bills.filter(b=>b.recurrent||b.payments?.[`${viewYear}-${viewMonth}`]);
  const totalEst=monthBills.reduce((s,b)=>s+(b.amount||0),0);
  const totalPaid=monthBills.reduce((s,b)=>s+(b.payments?.[`${viewYear}-${viewMonth}`]?.amount||0),0);
  const pct=totalEst>0?Math.round((totalPaid/totalEst)*100):0;
  const pendientes=monthBills.filter(b=>!b.payments?.[`${viewYear}-${viewMonth}`]).length;

  if (loading) return <><style>{CSS}</style><div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#090d18",color:"#00e5ff",fontFamily:"Syne,sans-serif",fontSize:20,gap:14}}><span className="spinner" style={{width:28,height:28,borderWidth:3}}/>Cargando...</div></>;
  if (!user) return <><style>{CSS}</style><AuthScreen onLogin={handleLogin}/></>;

  function renderHistory(){
    const all=[];
    bills.forEach(b=>Object.entries(b.payments||{}).forEach(([k,p])=>{ const [y,m]=k.split("-").map(Number); all.push({bill:b,year:y,month:m,pay:p}); }));
    all.sort((a,b)=>b.year-a.year||b.month-a.month);
    const grouped={};
    all.forEach(item=>{ const k=`${item.year}-${item.month}`; if(!grouped[k]) grouped[k]={year:item.year,month:item.month,items:[]}; grouped[k].items.push(item); });
    if(!Object.keys(grouped).length) return <div className="empty"><div className="empty-icon">📭</div><div className="empty-title">Sin historial aún</div></div>;
    return Object.values(grouped).map(g=>{
      const total=g.items.reduce((s,i)=>s+(i.pay.amount||0),0);
      return (
        <div className="month-group" key={`${g.year}-${g.month}`}>
          <div className="month-title"><span>{MONTHS_FULL[g.month-1]} {g.year}</span><span style={{color:"var(--success)"}}>{formatCurrency(total)}</span></div>
          {g.items.map(({bill,pay})=>(
            <div className="history-row" key={bill.id}>
              <div style={{display:"flex",alignItems:"center",gap:10}}><span>{getCatEmoji(bill.category)}</span><div><div style={{fontWeight:500}}>{bill.name}</div><div style={{fontSize:11,color:"var(--muted)"}}>Pagado el {formatDate(pay.date)}{pay.receipt?` · #${pay.receipt}`:""}</div></div></div>
              <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:"var(--success)"}}>{formatCurrency(pay.amount)}</span>
            </div>
          ))}
        </div>
      );
    });
  }

  function renderResumen(){
    const byMonth={};
    bills.forEach(b=>Object.entries(b.payments||{}).forEach(([k,p])=>{ if(!byMonth[k]) byMonth[k]={paid:0,count:0}; byMonth[k].paid+=p.amount||0; byMonth[k].count+=1; }));
    const sorted=Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,12);
    const max=Math.max(...sorted.map(([,v])=>v.paid),1);
    if(!sorted.length) return <div className="empty"><div className="empty-icon">📈</div><div className="empty-title">Sin datos aún</div></div>;
    return (
      <div>
        <div className="section-title" style={{marginBottom:20}}>📊 Resumen anual</div>
        {sorted.map(([key,val])=>{
          const [y,m]=key.split("-").map(Number);
          return (
            <div key={key} style={{marginBottom:18}}>
              <div className="summary-row" style={{marginBottom:4}}><span style={{fontWeight:600}}>{MONTHS_FULL[m-1]} {y}</span><span style={{color:"var(--success)",fontFamily:"'Syne',sans-serif",fontWeight:700}}>{formatCurrency(val.paid)}</span></div>
              <div className="summary-bar"><div className="summary-fill" style={{width:`${Math.round((val.paid/max)*100)}%`,background:"linear-gradient(90deg,var(--accent2),var(--accent))"}}/></div>
              <div className="summary-row"><span>{val.count} pago{val.count!==1?"s":""} registrado{val.count!==1?"s":""}</span></div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderMain(){
    return (
      <>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>{if(viewMonth===1){setViewMonth(12);setViewYear(y=>y-1)}else setViewMonth(m=>m-1)}}>‹</button>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:16,flex:1,textAlign:"center"}}>{MONTHS_FULL[viewMonth-1]} {viewYear}</span>
          <button className="btn btn-secondary btn-sm" onClick={()=>{if(viewMonth===12){setViewMonth(1);setViewYear(y=>y+1)}else setViewMonth(m=>m+1)}}>›</button>
        </div>
        {tab==="dashboard"&&(
          <>
            {/* Notification banner */}
            {notifPerm !== "unsupported" && (
              <div className="notif-banner">
                <div className="notif-banner-icon">🔔</div>
                <div style={{flex:1}}>
                  <div className="notif-banner-title">Recordatorios de pago</div>
                  <div className="notif-banner-sub">
                    {notifPerm==="granted" && <span className="notif-status notif-on">● Notificaciones activas</span>}
                    {notifPerm==="default" && <span className="notif-status notif-off">○ Notificaciones desactivadas</span>}
                    {notifPerm==="denied" && <span className="notif-status notif-blocked">✕ Bloqueadas en el navegador</span>}
                  </div>
                </div>
                {notifPerm!=="granted" && notifPerm!=="denied" && (
                  <button className="btn btn-secondary btn-sm" onClick={enableNotifications}>Activar</button>
                )}
                {notifPerm==="granted" && (
                  <button className="btn btn-secondary btn-sm" onClick={()=>checkAndScheduleReminders(bills)}>🔄 Verificar</button>
                )}
              </div>
            )}
            <ProgressRing pct={pct}/>
            <div className="dash-grid">
              <div className="dash-card"><div className="dash-label">Total estimado</div><div className="dash-value c-accent" style={{fontSize:19}}>{formatCurrency(totalEst)}</div></div>
              <div className="dash-card"><div className="dash-label">Total pagado</div><div className="dash-value c-success" style={{fontSize:19}}>{formatCurrency(totalPaid)}</div></div>
              <div className="dash-card"><div className="dash-label">Pendientes</div><div className={`dash-value ${pendientes>0?"c-warning":"c-success"}`}>{pendientes}</div></div>
              <div className="dash-card"><div className="dash-label">Cuentas totales</div><div className="dash-value">{bills.length}</div></div>
            </div>
          </>
        )}
        <div className="bills-header">
          <div className="section-title">{tab==="dashboard"?"Este mes":"Mis cuentas"}</div>
          <button className="btn btn-primary btn-sm" onClick={()=>setModal({type:"bill",data:null})}>+ Nueva</button>
        </div>
        {monthBills.length===0?(
          <div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Sin cuentas</div><p style={{marginBottom:20}}>Agregá tus cuentas para comenzar</p><button className="btn btn-primary" onClick={()=>setModal({type:"bill",data:null})}>+ Agregar cuenta</button></div>
        ):monthBills.map(bill=>{
          const status=getBillStatus(bill,viewYear,viewMonth), pay=bill.payments?.[`${viewYear}-${viewMonth}`];
          return (
            <div key={bill.id} className={`bill-item ${status}`}>
              <div className="bill-icon">{getCatEmoji(bill.category)}</div>
              <div className="bill-info">
                <div className="bill-name">{bill.name}</div>
                <div className="bill-meta">Vence día {bill.dueDay} · {getCatLabel(bill.category)}{pay&&<span style={{marginLeft:8,color:"var(--success)"}}>· Pagado {formatDate(pay.date)}</span>}{bill.reminderDays>0&&<span className="reminder-badge">🔔 {bill.reminderDays}d antes</span>}</div>
                <span className={`badge badge-${status}`}>{status==="paid"?"Pagado":status==="overdue"?"Vencido":status==="upcoming"?"Próximo":"Pendiente"}</span>
              </div>
              <div className="bill-amount" style={{color:status==="paid"?"var(--success)":status==="overdue"?"var(--danger)":"var(--text)"}}>{formatCurrency(pay?pay.amount:bill.amount)}</div>
              <div className="bill-actions">
                {status!=="paid"?<button className="btn btn-success btn-sm" onClick={()=>setModal({type:"pay",data:bill})}>Pagar</button>:<button className="btn btn-secondary btn-sm" onClick={()=>removePayment(bill,viewYear,viewMonth)}>↩</button>}
                <button className="btn btn-secondary btn-sm" onClick={()=>setModal({type:"bill",data:bill})}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={()=>deleteBill(bill.id)}>🗑</button>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  const navItems=user.isAdmin
    ?[{id:"admin",label:"🔐 Panel Admin",cls:"admin-nav"}]
    :[{id:"dashboard",label:"📊 Dashboard"},{id:"bills",label:"🧾 Cuentas"},{id:"history",label:"📖 Historial"},{id:"resumen",label:"📈 Resumen"}];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="header">
          <div className="header-logo">💰 PagosApp</div>
          <div className="header-right">
            {user.isAdmin&&<span className="admin-badge">Admin</span>}
            <div className={`avatar ${user.isAdmin?"avatar-admin":"avatar-user"}`}>{user.name[0].toUpperCase()}</div>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Salir</button>
          </div>
        </div>
        <div className="nav">
          {navItems.map(n=><button key={n.id} className={`nav-btn ${n.cls||""} ${tab===n.id?"active":""}`} onClick={()=>setTab(n.id)}>{n.label}</button>)}
        </div>
        <div className="main">
          {!user.isAdmin&&(tab==="dashboard"||tab==="bills")&&renderMain()}
          {!user.isAdmin&&tab==="history"&&renderHistory()}
          {!user.isAdmin&&tab==="resumen"&&renderResumen()}
          {user.isAdmin&&tab==="admin"&&<AdminPanel showToast={showToast}/>}
        </div>
      </div>
      {modal?.type==="bill"&&<BillModal bill={modal.data} onSave={saveBill} onClose={()=>setModal(null)} notifEnabled={notifPerm==="granted"}/>}
      {modal?.type==="pay"&&<PayModal bill={modal.data} year={viewYear} month={viewMonth} onSave={p=>savePayment(modal.data,viewYear,viewMonth,p)} onClose={()=>setModal(null)}/>}
      {toast&&<Toast msg={toast.msg} type={toast.type}/>}
    </>
  );
}
