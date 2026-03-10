import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDoc, getDocs, doc, setDoc,
  updateDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCL04pwmGHAEOXpJ82NyJ3enX3e2wdDTRE",
  authDomain: "scemdatabase.firebaseapp.com",
  databaseURL: "https://scemdatabase-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scemdatabase",
  storageBucket: "scemdatabase.firebasestorage.app",
  messagingSenderId: "666834093209",
  appId: "1:666834093209:web:aa15cc4d6ba0ffdeebe408",
  measurementId: "G-C67TCPV7NV"
};

const app    = initializeApp(firebaseConfig);
const db     = getFirestore(app);
const auth   = getAuth(app);
const annCol = collection(db, "announcements");

let userRole = "", userEmail = "", userName = "", userBirthday = "", currentUid = "";
let announcements    = [];
let editingId        = null;
let filters          = { dash: "All", ann: "All", manage: "All" };
let manageSideFilter = "All";
let calViewDate      = new Date();
let fullCalViewDate  = new Date();
let managePage       = 1;
const PER_PAGE       = 4;
let selectedManageId  = null;
let uploadedImageData = null;
let unsubscribeAnn    = null;

const MONTHS     = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["S","M","T","W","T","F","S"];
const DAYS_FULL  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ===== AUTH TABS =====
window.switchTab = function(tab) {
  document.getElementById("tabSignIn").classList.toggle("active", tab === "signin");
  document.getElementById("tabSignUp").classList.toggle("active", tab === "signup");
  document.getElementById("signinPanel").classList.toggle("active", tab === "signin");
  document.getElementById("signupPanel").classList.toggle("active", tab === "signup");
  clearAuthErrors();
};

function clearAuthErrors() {
  ["signinError","signupError","signupSuccess"].forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove("show");
    el.querySelector("span").textContent = "";
  });
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.querySelector("span").textContent = msg;
  el.classList.add("show");
}

function showAuthSuccess(id, msg) {
  const el = document.getElementById(id);
  el.querySelector("span").textContent = msg;
  el.classList.add("show");
}

window.togglePw = function(inputId, iconId) {
  const p = document.getElementById(inputId);
  const i = document.getElementById(iconId);
  p.type = p.type === "password" ? "text" : "password";
  i.classList.toggle("fa-eye"); i.classList.toggle("fa-eye-slash");
};

window.doSignIn = async function() {
  const email = document.getElementById("siEmail").value.trim();
  const pwd   = document.getElementById("siPassword").value;
  clearAuthErrors();
  if (!email) { showAuthError("signinError", "Please enter your email address."); return; }
  if (!email.endsWith("@gfis.edu.ph")) { showAuthError("signinError", "Only @gfis.edu.ph email addresses are allowed."); return; }
  if (!pwd)   { showAuthError("signinError", "Please enter your password."); return; }
  const btn = document.getElementById("signinBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Signing in...';
  try {
    await signInWithEmailAndPassword(auth, email, pwd);
  } catch(err) {
    const msgs = {
      "auth/invalid-credential": "Incorrect email or password.",
      "auth/user-not-found": "No account found with this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/too-many-requests": "Too many failed attempts. Please try again later.",
      "auth/invalid-email": "Invalid email address."
    };
    showAuthError("signinError", msgs[err.code] || "Sign in failed. Please try again.");
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
  }
};

window.doSignUp = async function() {
  const firstName = document.getElementById("suFirstName").value.trim();
  const lastName  = document.getElementById("suLastName").value.trim();
  const email     = document.getElementById("suEmail").value.trim();
  const birthday  = document.getElementById("suBirthday").value;
  const pwd       = document.getElementById("suPassword").value;
  const confirm   = document.getElementById("suConfirm").value;
  clearAuthErrors();
  if (!firstName || !lastName) { showAuthError("signupError", "Please enter your first and last name."); return; }
  if (!email)    { showAuthError("signupError", "Please enter your school email."); return; }
  if (!email.endsWith("@gfis.edu.ph")) { showAuthError("signupError", "Only @gfis.edu.ph email addresses are allowed."); return; }
  if (!birthday) { showAuthError("signupError", "Please enter your birthday."); return; }
  if (!pwd)      { showAuthError("signupError", "Please enter a password."); return; }
  if (pwd.length < 6) { showAuthError("signupError", "Password must be at least 6 characters."); return; }
  if (pwd !== confirm) { showAuthError("signupError", "Passwords do not match."); return; }
  const btn = document.getElementById("signupBtn");
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating account...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pwd);
    const uid  = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      name: `${firstName} ${lastName}`, email, birthday, role: "student", createdAt: serverTimestamp()
    });
    showAuthSuccess("signupSuccess", `Account created! Welcome, ${firstName}! Signing you in...`);
  } catch(err) {
    const msgs = {
      "auth/email-already-in-use": "An account with this email already exists.",
      "auth/invalid-email": "Invalid email address.",
      "auth/weak-password": "Password is too weak."
    };
    showAuthError("signupError", msgs[err.code] || "Sign up failed. Please try again.");
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
  }
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const profileSnap = await getDoc(doc(db, "users", user.uid));
      if (profileSnap.exists()) {
        const p = profileSnap.data();
        userRole     = p.role     || "student";
        userName     = p.name     || user.email.split("@")[0];
        userBirthday = p.birthday || "";
        userEmail    = user.email;
        currentUid   = user.uid;
        initDashboard();
      } else {
        await signOut(auth);
        showLoading(false);
      }
    } catch(e) {
      console.error("Profile load error:", e);
      showLoading(false);
    }
  } else {
    showLoading(false);
  }
});

function showLoading(show) {
  document.getElementById("loadingScreen").style.display = show ? "flex" : "none";
  if (!show) {
    const user = auth.currentUser;
    document.getElementById("authPage").style.display    = user ? "none" : "flex";
    document.getElementById("dashboard").style.display   = user ? "block" : "none";
  }
}

function initDashboard() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("authPage").style.display      = "none";
  document.getElementById("dashboard").style.display     = "block";
  const initial   = userName.charAt(0).toUpperCase();
  const roleLabel = userRole.charAt(0).toUpperCase() + userRole.slice(1);
  const bdFormatted = userBirthday ? formatBirthday(userBirthday) : "Not set";
  document.getElementById("sidebarAvatar").textContent       = initial;
  document.getElementById("sidebarName").textContent         = userName;
  document.getElementById("sidebarEmail").textContent        = userEmail;
  document.getElementById("dashWelcome").textContent         = `Welcome back, ${userName.split(" ")[0]}!`;
  document.getElementById("createPostNav").style.display     = userRole === "admin" ? "flex" : "none";
  document.getElementById("profileAvatar").textContent       = initial;
  document.getElementById("profileNameDisplay").textContent  = userName;
  document.getElementById("profileRoleDisplay").textContent  = roleLabel;
  document.getElementById("pName").textContent               = userName;
  document.getElementById("pEmail").textContent              = userEmail;
  document.getElementById("pRole").textContent               = roleLabel;
  document.getElementById("pBirthday").textContent           = bdFormatted;
  document.getElementById("pUid").textContent                = currentUid;
  document.getElementById("postedHint").textContent          = `Posted on ${new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;
  enforceDateMin();
  if (unsubscribeAnn) unsubscribeAnn();
  const q = query(annCol, orderBy("createdAt","desc"));
  unsubscribeAnn = onSnapshot(q, snapshot => {
    announcements = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
  }, error => {
    console.error("Firestore error:", error);
    showToast("⚠️ Database error.");
  });
  setTimeout(checkAllBirthdays, 1200);
}

function formatBirthday(iso) {
  if (!iso) return "Not set";
  const [y, m, d] = iso.split("-");
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[parseInt(m,10)-1]} ${parseInt(d,10)}, ${y}`;
}

function isBirthdayToday(isoDate) {
  if (!isoDate) return false;
  const today = new Date();
  const [, m, d] = isoDate.split("-");
  return parseInt(m,10) === today.getMonth()+1 && parseInt(d,10) === today.getDate();
}

function showBirthdayModal(name) {
  document.getElementById("bdModalName").textContent = name;
  document.getElementById("birthdayModal").classList.add("open");
  document.body.style.overflow = "hidden";
}
window.closeBirthdayModal = function() {
  document.getElementById("birthdayModal").classList.remove("open");
  document.body.style.overflow = "";
};

async function checkAllBirthdays() {
  try {
    const usersSnap = await getDocs(collection(db, "users"));
    const todayBirthdays = [];
    usersSnap.forEach(d => {
      const p = d.data();
      if (p.birthday && isBirthdayToday(p.birthday)) todayBirthdays.push(p.name || p.email.split("@")[0]);
    });
    if (todayBirthdays.length > 0) {
      const banner = document.getElementById("birthdayBanner");
      const bannerText = document.getElementById("bdBannerNames");
      const isCurrentUserBday = isBirthdayToday(userBirthday);
      const names = todayBirthdays.join(", ");
      bannerText.textContent = isCurrentUserBday
        ? `It's your birthday today! 🎈 Celebrating: ${names}`
        : `Let's celebrate ${names} — send them some love! 💕`;
      banner.style.display = "block";
      if (isCurrentUserBday) setTimeout(() => showBirthdayModal(userName.split(" ")[0]), 800);
    }
  } catch(e) {
    console.error("Birthday check error:", e);
    if (isBirthdayToday(userBirthday)) setTimeout(() => showBirthdayModal(userName.split(" ")[0]), 800);
  }
}

window.logout = async function() {
  if (unsubscribeAnn) { unsubscribeAnn(); unsubscribeAnn = null; }
  await signOut(auth);
  document.getElementById("dashboard").style.display = "none";
  document.getElementById("authPage").style.display  = "flex";
  document.getElementById("siEmail").value    = "";
  document.getElementById("siPassword").value = "";
};

window.openFeaturesModal  = function() { document.getElementById("featuresModal").classList.add("open"); document.body.style.overflow = "hidden"; };
window.closeFeaturesModal = function() { document.getElementById("featuresModal").classList.remove("open"); document.body.style.overflow = ""; };
window.handleModalOverlayClick = function(e) { if (e.target === document.getElementById("featuresModal")) closeFeaturesModal(); };

window.openLightbox = function(src, caption) {
  document.getElementById("lightboxImg").src = src;
  document.getElementById("lightboxCaption").textContent = caption || "";
  document.getElementById("lightboxOverlay").classList.add("open");
  document.body.style.overflow = "hidden";
};
window.closeLightbox = function(e) {
  if (e && e.target !== document.getElementById("lightboxOverlay")) return;
  document.getElementById("lightboxOverlay").classList.remove("open");
  document.body.style.overflow = "";
  setTimeout(() => { document.getElementById("lightboxImg").src = ""; }, 350);
};
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.getElementById("lightboxOverlay").classList.remove("open");
    document.getElementById("featuresModal").classList.remove("open");
    document.body.style.overflow = "";
  }
});

// ===== HELPERS =====
function getTodayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}`;
}
function enforceDateMin() {
  const el = document.getElementById("dateInput");
  if (el) el.min = getTodayISO();
}
function catIcon(cat) {
  return {
    Academic: "fa-solid fa-book",
    Event: "fa-solid fa-calendar-star",
    OutsideCampus: "fa-solid fa-map-location-dot",
    General: "fa-solid fa-info-circle"
  }[cat] || "fa-solid fa-info-circle";
}
function catLabel(cat) {
  return cat === "OutsideCampus" ? "Outside Campus" : cat;
}
function todayGB() { return new Date().toLocaleDateString("en-GB"); }
function parseGB(str) { const p = str.split("/"); return p.length===3 ? new Date(`${p[2]}-${p[1]}-${p[0]}`) : new Date(str); }

// =============================================================
// FIX: fmtPosted now accepts a Firestore Timestamp (createdAt)
//      instead of the event date string.
//      - If it's a Firestore Timestamp  → use .toDate()
//      - If it's a plain JS Date/string → use new Date()
//      - If null/undefined              → return "—"
// =============================================================
function fmtPosted(createdAt) {
  if (!createdAt) return "—";
  let d;
  if (typeof createdAt.toDate === "function") {
    // Firestore Timestamp object
    d = createdAt.toDate();
  } else {
    d = new Date(createdAt);
  }
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h%12||12}:${String(m).padStart(2,"0")} ${ampm}`;
}
window.showToast = function(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
};

window.openSidebar = function() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("mobOverlay").classList.add("show");
  document.getElementById("mobMenuBtn").classList.add("is-open");
  document.body.style.overflow = "hidden";
};
window.closeSidebar = function() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("mobOverlay").classList.remove("show");
  document.getElementById("mobMenuBtn").classList.remove("is-open");
  document.body.style.overflow = "";
};
window.showPage = function(pageId, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById(pageId).classList.add("active");
  if (btn) btn.classList.add("active");
  closeSidebar();
  renderAll();
  const topSearch = document.getElementById("topSearch");
  if (pageId !== "announcementsPage" && pageId !== "dashboardPage") {
    topSearch.value = "";
    document.getElementById("topSearchClear").style.display = "none";
    document.getElementById("dashSearch").value = "";
    document.getElementById("annSearch").value  = "";
  }
};

// ===== PIN TOGGLE =====
window.togglePinInput = function() {
  const cb = document.getElementById("pinInput");
  cb.checked = !cb.checked;
  syncPinToggleRow();
};
window.syncPinToggleRow = function() {
  const cb = document.getElementById("pinInput");
  document.getElementById("pinToggleRow").classList.toggle("active", cb.checked);
};

// ===== IMAGE UPLOAD =====
window.handleImageUpload = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) { showToast("⚠️ Please select an image file"); return; }
  if (file.size > 5 * 1024 * 1024)    { showToast("⚠️ Image must be under 5 MB"); return; }
  const reader = new FileReader();
  reader.onload = e => {
    uploadedImageData = e.target.result;
    document.getElementById("imagePreviewImg").src           = uploadedImageData;
    document.getElementById("imagePreviewName").textContent  = file.name;
    document.getElementById("imagePreviewBox").style.display = "block";
    showToast("✅ Image attached!");
  };
  reader.readAsDataURL(file);
};
window.clearImage = function() {
  uploadedImageData = null;
  document.getElementById("imageUploadInput").value           = "";
  document.getElementById("imagePreviewImg").src              = "";
  document.getElementById("imagePreviewName").textContent     = "";
  document.getElementById("imagePreviewBox").style.display    = "none";
};

// ===== CRUD =====
window.addAnnouncement = async function() {
  const title    = document.getElementById("titleInput").value.trim();
  const desc     = document.getElementById("descInput").value.trim();
  const category = document.getElementById("categoryInput").value;
  const dateVal  = document.getElementById("dateInput").value;
  const timeVal  = document.getElementById("timeInput").value;
  const venue    = document.getElementById("venueInput").value.trim();
  const pic      = document.getElementById("picInput").value.trim();
  const pinned   = document.getElementById("pinInput").checked;

  if (!title)   { showToast("Please enter a title"); return; }
  if (!dateVal) { showToast("Please select a date"); return; }

  const selectedDate  = new Date(dateVal);
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);
  if (selectedDate < todayMidnight) { showToast("❌ Cannot set announcements in the past!"); enforceDateMin(); return; }

  const formattedDate = new Date(dateVal).toLocaleDateString("en-GB");
  const postBtn = document.getElementById("postBtn");
  postBtn.disabled = true;

  try {
    const data = { title, desc, category, date: formattedDate, time: timeVal||"", venue: venue||"", pic: pic||"", image: uploadedImageData||null, pinned: pinned };
    if (editingId !== null) {
      const docRef = doc(db, "announcements", editingId);
      const existing = await getDoc(docRef);
      data.image     = uploadedImageData || (existing.exists() ? existing.data().image : null);
      data.updatedAt = serverTimestamp();
      // Preserve original createdAt — do NOT overwrite it on edit
      await updateDoc(docRef, data);
      editingId = null;
      document.getElementById("postBtnText").textContent     = "Post Announcement";
      document.getElementById("cancelEditBtn").style.display = "none";
      document.getElementById("createPageTitle").textContent = "Create Announcement";
      showToast("✅ Announcement updated!");
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(annCol, data);
      showToast(pinned ? "📌 Announcement pinned & posted!" : "✅ Announcement posted!");
    }
    ["titleInput","descInput","dateInput","timeInput","venueInput","picInput"].forEach(id => { document.getElementById(id).value = ""; });
    document.getElementById("pinInput").checked = false;
    syncPinToggleRow();
    clearImage(); enforceDateMin();
  } catch(err) {
    console.error("Error saving:", err);
    showToast("❌ Error saving. Try again.");
  } finally { postBtn.disabled = false; }
};

window.editAnnouncement = function(id) {
  const a = announcements.find(x => x.id === id); if (!a) return;
  document.getElementById("titleInput").value    = a.title;
  document.getElementById("descInput").value     = a.desc;
  document.getElementById("categoryInput").value = a.category;
  document.getElementById("timeInput").value     = a.time  || "";
  document.getElementById("venueInput").value    = a.venue || "";
  document.getElementById("picInput").value      = a.pic   || "";
  document.getElementById("pinInput").checked    = a.pinned || false;
  syncPinToggleRow();
  const p = a.date.split("/");
  document.getElementById("dateInput").value = `${p[2]}-${p[1]}-${p[0]}`;
  enforceDateMin();
  if (a.image) {
    uploadedImageData = a.image;
    document.getElementById("imagePreviewImg").src           = a.image;
    document.getElementById("imagePreviewName").textContent  = "Existing image";
    document.getElementById("imagePreviewBox").style.display = "block";
  } else { clearImage(); }
  editingId = id;
  document.getElementById("postBtnText").textContent     = "Update Announcement";
  document.getElementById("cancelEditBtn").style.display = "block";
  document.getElementById("createPageTitle").textContent = "Edit Announcement";
  showPage("createPage", document.querySelector('[onclick*="createPage"]'));
  document.querySelector(".create-form-panel").scrollIntoView({ behavior: "smooth" });
};

window.cancelEdit = function() {
  editingId = null;
  ["titleInput","descInput","dateInput","timeInput","venueInput","picInput"].forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("pinInput").checked = false;
  syncPinToggleRow();
  clearImage(); enforceDateMin();
  document.getElementById("postBtnText").textContent     = "Post Announcement";
  document.getElementById("cancelEditBtn").style.display = "none";
  document.getElementById("createPageTitle").textContent = "Create Announcement";
};

window.deleteAnnouncement = async function(id) {
  if (!confirm("Delete this announcement?")) return;
  try {
    await deleteDoc(doc(db, "announcements", id));
    if (selectedManageId === id) selectedManageId = null;
    showToast("🗑️ Deleted!");
  } catch(err) { console.error("Error deleting:", err); showToast("❌ Error deleting."); }
};

window.togglePin = async function(id) {
  const a = announcements.find(x => x.id === id); if (!a) return;
  const newPinned = !a.pinned;
  try {
    await updateDoc(doc(db, "announcements", id), { pinned: newPinned });
    showToast(newPinned ? "📌 Announcement pinned!" : "📌 Announcement unpinned.");
  } catch(err) { console.error("Pin error:", err); showToast("❌ Error updating pin."); }
};

// ===== FILTERS =====
window.setFilter = function(scope, val, btn) {
  filters[scope] = val;
  const tabIds = { dash:"dashFilterTabs", ann:"annFilterTabs", manage:"manageFilterTabs" };
  document.querySelectorAll(`#${tabIds[scope]} .filter-tab`).forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (scope === "dash")     renderDashList();
  else if (scope === "ann") renderAnnList();
  else { managePage = 1; renderManageGrid(); }
};
window.setManageSideFilter = function(val, btn) {
  manageSideFilter = val;
  document.querySelectorAll(".manage-filter-row .manage-filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active"); managePage = 1; renderManageGrid();
};

function getFiltered(filter, sortVal, searchVal) {
  let list = [...announcements];
  if (filter !== "All") list = list.filter(a => a.category === filter);
  if (searchVal && searchVal.trim()) {
    const q = searchVal.trim().toLowerCase();
    list = list.filter(a =>
      (a.title  || "").toLowerCase().includes(q) ||
      (a.desc   || "").toLowerCase().includes(q) ||
      (a.venue  || "").toLowerCase().includes(q) ||
      (a.pic    || "").toLowerCase().includes(q) ||
      catLabel(a.category).toLowerCase().includes(q)
    );
  }
  if (sortVal === "oldest")  list.sort((a,b) => parseGB(a.date)-parseGB(b.date));
  else if (sortVal === "az") list.sort((a,b) => a.title.localeCompare(b.title));
  else                       list.sort((a,b) => parseGB(b.date)-parseGB(a.date));
  list.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return list;
}

// ===== BUILD ANN ITEM =====
function buildExtraChips(a) {
  const chips = [];
  if (a.time)  chips.push(`<span class="ann-extra-chip"><i class="fa-solid fa-clock"></i>${fmtTime(a.time)}</span>`);
  if (a.venue) chips.push(`<span class="ann-extra-chip"><i class="fa-solid fa-location-dot"></i>${a.venue}</span>`);
  if (a.pic)   chips.push(`<span class="ann-extra-chip"><i class="fa-solid fa-user-tie"></i>${a.pic}</span>`);
  return chips.length ? `<div class="ann-extra">${chips.join("")}</div>` : "";
}

function buildAnnItem(a, showCatBadge) {
  const isToday  = a.date === todayGB();
  const isPinned = a.pinned || false;
  const pinBadge = isPinned ? `<div class="pin-badge"><i class="fa-solid fa-thumbtack"></i> Pinned</div>` : "";
  const adminBtns = userRole === "admin"
    ? `<div class="ann-actions">
        <button class="btn-pin ${isPinned ? 'pinned' : ''}" onclick="togglePin('${a.id}')">
          <i class="fa-solid fa-thumbtack"></i>${isPinned ? 'Unpin' : 'Pin'}
        </button>
        <button class="btn-edit" onclick="editAnnouncement('${a.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteAnnouncement('${a.id}')">Delete</button>
      </div>` : "";
  const catBadge = showCatBadge ? `<span class="ann-cat-badge ${a.category}">${catLabel(a.category)}</span>` : "";
  const imgHtml  = a.image ? `<div class="ann-img-wrap" onclick="openLightbox('${a.image}','${a.title.replace(/'/g,"\\'")}')"><img src="${a.image}" alt="${a.title}"><div class="ann-img-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i> Click to zoom</div></div>` : "";

  // FIX: use a.createdAt (when posted) instead of a.date (the event date)
  const postedLabel = `Posted on ${fmtPosted(a.createdAt)}`;

  const div = document.createElement("div");
  div.className = "ann-item" + (isPinned ? " pinned-item" : "");
  div.innerHTML = `
    ${pinBadge}
    <div class="ann-cat-icon ${a.category}"><i class="${catIcon(a.category)}"></i></div>
    <div class="ann-body">
      ${imgHtml}
      <div class="ann-title">${a.title}${isToday ? '<span class="today-badge">Today</span>' : ''}</div>
      <div class="ann-desc">${a.desc}</div>
      ${buildExtraChips(a)}
      <div class="ann-meta"><span class="ann-date"><i class="fa-regular fa-clock"></i> ${a.date}</span>${catBadge}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
      <span class="ann-posted">${postedLabel}</span>${adminBtns}
    </div>`;
  return div;
}

function renderAll() { updateStats(); renderDashList(); renderMiniCal(); renderUpcoming(); renderAnnList(); renderManageGrid(); renderFullCal(); }

function updateStats() {
  const now = new Date(), today = todayGB();
  document.getElementById("statTotal").textContent    = announcements.length;
  document.getElementById("statToday").textContent    = announcements.filter(a => a.date === today).length;
  document.getElementById("statUpcoming").textContent = announcements.filter(a => parseGB(a.date) > now).length;
  document.getElementById("statPinned").textContent   = announcements.filter(a => a.pinned).length;
}

function renderListWithPinnedSection(container, list, showCatBadge) {
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No announcements found</p></div>';
    return;
  }
  const pinned   = list.filter(a => a.pinned);
  const unpinned = list.filter(a => !a.pinned);

  if (pinned.length > 0) {
    const section = document.createElement("div");
    section.className = "pinned-section";
    section.innerHTML = `<div class="pinned-section-header"><i class="fa-solid fa-thumbtack"></i><span>📌 Pinned Announcements</span></div>`;
    const innerList = document.createElement("div");
    innerList.className = "ann-list";
    pinned.forEach(a => innerList.appendChild(buildAnnItem(a, showCatBadge)));
    section.appendChild(innerList);
    container.appendChild(section);
  }

  if (unpinned.length > 0) {
    const innerList = document.createElement("div");
    innerList.className = "ann-list";
    unpinned.forEach(a => innerList.appendChild(buildAnnItem(a, showCatBadge)));
    container.appendChild(innerList);
  }
}

function renderDashList() {
  const list = getFiltered(filters.dash, document.getElementById("dashSortSelect").value, document.getElementById("dashSearch").value);
  renderListWithPinnedSection(document.getElementById("dashAnnList"), list, false);
}

function renderAnnList() {
  const list = getFiltered(filters.ann, document.getElementById("annSortSelect").value, document.getElementById("annSearch").value);
  renderListWithPinnedSection(document.getElementById("annListContainer"), list, true);
}

function renderManageGrid() {
  const search = document.getElementById("manageSideSearch").value.toLowerCase();
  const dateF  = document.getElementById("manageDateFilter").value;
  const sort   = document.getElementById("manageSortSelect").value;
  const cf     = filters.manage !== "All" ? filters.manage : manageSideFilter;
  let list = [...announcements];
  if (cf !== "All") list = list.filter(a => a.category === cf);
  if (search) list = list.filter(a => a.title.toLowerCase().includes(search) || a.desc.toLowerCase().includes(search));
  if (dateF)  { const df = new Date(dateF).toLocaleDateString("en-GB"); list = list.filter(a => a.date === df); }
  list.sort(sort === "oldest" ? (a,b) => parseGB(a.date)-parseGB(b.date) : (a,b) => parseGB(b.date)-parseGB(a.date));
  list.sort((a,b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const totalPages = Math.max(1, Math.ceil(list.length/PER_PAGE));
  if (managePage > totalPages) managePage = totalPages;
  const paged = list.slice((managePage-1)*PER_PAGE, managePage*PER_PAGE);
  document.getElementById("pageInfo").textContent = `Page ${managePage} of ${totalPages}`;
  const grid = document.getElementById("manageAnnGrid"); grid.innerHTML = "";
  if (!paged.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:span 2"><i class="fa-solid fa-inbox"></i><p>No announcements</p></div>'; return; }
  paged.forEach(a => {
    const card = document.createElement("div");
    card.className = "manage-ann-card" + (selectedManageId===a.id?" selected":"") + (a.pinned?" is-pinned":"");
    card.onclick = () => { selectedManageId = a.id; renderManageGrid(); };
    const imgThumb = a.image ? `<div class="manage-thumb-wrap" onclick="event.stopPropagation();openLightbox('${a.image}','${a.title.replace(/'/g,"\\'")}')"><img src="${a.image}" alt="${a.title}"><div class="ann-img-zoom-hint"><i class="fa-solid fa-magnifying-glass-plus"></i></div></div>` : "";
    const chipParts = [];
    if (a.time)  chipParts.push(`<div class="manage-chip"><i class="fa-solid fa-clock"></i>${fmtTime(a.time)}</div>`);
    if (a.venue) chipParts.push(`<div class="manage-chip"><i class="fa-solid fa-location-dot"></i>${a.venue}</div>`);
    if (a.pic)   chipParts.push(`<div class="manage-chip"><i class="fa-solid fa-user-tie"></i>${a.pic}</div>`);
    const pinIndicator = a.pinned ? `<div class="manage-pin-indicator" title="Pinned"><i class="fa-solid fa-thumbtack"></i></div>` : "";

    // FIX: use a.createdAt (when posted) instead of a.date (the event date)
    const postedLabel = `Posted on ${fmtPosted(a.createdAt)}`;

    card.innerHTML = `
      ${pinIndicator}
      ${imgThumb}
      <div class="manage-card-top"><div class="manage-card-icon ${a.category}"><i class="${catIcon(a.category)}"></i></div><div class="manage-card-title">${a.title}</div></div>
      <div class="manage-card-desc">${a.desc}</div>
      ${chipParts.length?`<div class="manage-card-chips">${chipParts.join("")}</div>`:""}
      <div class="manage-posted">${postedLabel}</div>
      <div class="manage-card-meta"><span class="manage-card-date"><i class="fa-regular fa-clock"></i> ${a.date}</span><span class="manage-card-cat ${a.category}">${catLabel(a.category)}</span></div>
      <div class="manage-card-actions">
        <button class="btn-sm-edit" onclick="event.stopPropagation();editAnnouncement('${a.id}')">Edit</button>
        <button class="btn-sm-pin ${a.pinned?'active':''}" onclick="event.stopPropagation();togglePin('${a.id}')">
          <i class="fa-solid fa-thumbtack"></i>${a.pinned?'Unpin':'Pin'}
        </button>
        <button class="btn-sm-delete" onclick="event.stopPropagation();deleteAnnouncement('${a.id}')">Delete</button>
      </div>`;
    grid.appendChild(card);
  });
}

window.changeMPage    = function(dir) { managePage += dir; if (managePage < 1) managePage = 1; renderManageGrid(); };
window.editSelected   = function()   { if (!selectedManageId) { showToast("Select an announcement first"); return; } editAnnouncement(selectedManageId); };
window.deleteSelected = function()   { if (!selectedManageId) { showToast("Select an announcement first"); return; } deleteAnnouncement(selectedManageId); };

function renderMiniCal() {
  const y = calViewDate.getFullYear(), m = calViewDate.getMonth(), today = new Date();
  document.getElementById("miniCalMonth").textContent = `${MONTHS[m]} ${y}`;
  const grid = document.getElementById("miniCalGrid"); grid.innerHTML = "";
  DAYS_SHORT.forEach(d => { const el = document.createElement("div"); el.className = "cal-day-label"; el.textContent = d; grid.appendChild(el); });
  const firstDay = new Date(y,m,1).getDay(), daysInMonth = new Date(y,m+1,0).getDate(), daysInPrev = new Date(y,m,0).getDate();
  for (let i=firstDay-1; i>=0; i--) { const el = document.createElement("div"); el.className = "cal-day other-month"; el.textContent = daysInPrev-i; grid.appendChild(el); }
  for (let d=1; d<=daysInMonth; d++) {
    const el = document.createElement("div"); el.className = "cal-day"; el.textContent = d;
    const dateStr = new Date(y,m,d).toLocaleDateString("en-GB");
    const isToday = d===today.getDate() && m===today.getMonth() && y===today.getFullYear();
    if (isToday) el.classList.add("today");
    if (announcements.some(a => a.date===dateStr) && !isToday) el.classList.add("has-event");
    el.onclick = () => { document.querySelectorAll("#miniCalGrid .cal-day").forEach(x => x.classList.remove("selected")); el.classList.add("selected"); };
    grid.appendChild(el);
  }
}
window.changeMonth = function(dir) { calViewDate.setMonth(calViewDate.getMonth()+dir); renderMiniCal(); };

function renderUpcoming() {
  const now = new Date();
  const upcoming = announcements.filter(a => parseGB(a.date)>=now).sort((a,b)=>parseGB(a.date)-parseGB(b.date)).slice(0,5);
  const c = document.getElementById("upcomingList"); c.innerHTML = "";
  if (!upcoming.length) { c.innerHTML = '<div style="color:var(--text-light);font-size:13px;">No upcoming events</div>'; return; }
  upcoming.forEach(a => {
    const d = parseGB(a.date);
    const item = document.createElement("div"); item.className = "upcoming-item";
    const sub = [a.time ? fmtTime(a.time) : "", a.venue||""].filter(Boolean).join(" · ");
    item.innerHTML = `
      <div class="upcoming-num">${d.getDate()}</div>
      <div class="upcoming-icon"><i class="${catIcon(a.category)}"></i></div>
      <div class="upcoming-info"><div class="upcoming-name">${a.title}</div><div class="upcoming-sub">${sub||(a.desc.slice(0,35)+(a.desc.length>35?"...":""))}</div></div>`;
    c.appendChild(item);
  });
}

function renderFullCal() {
  const y = fullCalViewDate.getFullYear(), m = fullCalViewDate.getMonth(), today = new Date();
  document.getElementById("fullCalMonth").textContent = `${MONTHS[m]} ${y}`;
  const grid = document.getElementById("fullCalGrid"); grid.innerHTML = "";
  DAYS_FULL.forEach(d => { const el = document.createElement("div"); el.className = "cal-full-day-label"; el.textContent = d; grid.appendChild(el); });
  const firstDay = new Date(y,m,1).getDay(), daysInMonth = new Date(y,m+1,0).getDate(), daysInPrev = new Date(y,m,0).getDate();
  for (let i=firstDay-1; i>=0; i--) { const cell = document.createElement("div"); cell.className = "cal-full-cell other-month"; cell.innerHTML = `<div class="cell-num">${daysInPrev-i}</div>`; grid.appendChild(cell); }
  for (let d=1; d<=daysInMonth; d++) {
    const cell = document.createElement("div"); cell.className = "cal-full-cell";
    const dateStr = new Date(y,m,d).toLocaleDateString("en-GB");
    if (d===today.getDate() && m===today.getMonth() && y===today.getFullYear()) cell.classList.add("today");
    const dayEvents = announcements.filter(a => a.date===dateStr);
    let evHtml = dayEvents.slice(0,2).map(e => `<div class="cell-event ${e.category}">${e.pinned?'📌 ':''}${e.title}</div>`).join("");
    if (dayEvents.length > 2) evHtml += `<div class="cell-event General">+${dayEvents.length-2} more</div>`;
    cell.innerHTML = `<div class="cell-num">${d}</div>${evHtml}`;
    grid.appendChild(cell);
  }
}
window.changeFullMonth = function(dir) { fullCalViewDate.setMonth(fullCalViewDate.getMonth()+dir); renderFullCal(); };

// ===== SYNC SEARCH FROM PANEL INPUTS =====
window.syncSearchFromPanel = function(panel) {
  const q = panel === "dash"
    ? document.getElementById("dashSearch").value
    : document.getElementById("annSearch").value;
  document.getElementById("topSearch").value = q;
  document.getElementById("topSearchClear").style.display = q.length > 0 ? "block" : "none";
  if (panel === "dash") renderDashList();
  else renderAnnList();
};

// ===== GLOBAL TOP SEARCH =====
window.handleTopSearch = function() {
  const q = document.getElementById("topSearch").value;
  const clearBtn = document.getElementById("topSearchClear");
  clearBtn.style.display = q.length > 0 ? "block" : "none";
  if (q.length === 0) {
    document.getElementById("dashSearch").value = "";
    document.getElementById("annSearch").value  = "";
    renderDashList();
    renderAnnList();
    return;
  }
  document.getElementById("dashSearch").value = q;
  document.getElementById("annSearch").value  = q;
  renderDashList();
  renderAnnList();
};

window.submitTopSearch = function() {
  const q = document.getElementById("topSearch").value.trim();
  if (!q) return;
  document.getElementById("annSearch").value = q;
  document.getElementById("dashSearch").value = q;
  showPage("announcementsPage", document.querySelector('[onclick*="announcementsPage"]'));
  renderAnnList();
};

window.clearTopSearch = function() {
  document.getElementById("topSearch").value              = "";
  document.getElementById("topSearchClear").style.display = "none";
  document.getElementById("dashSearch").value             = "";
  document.getElementById("annSearch").value              = "";
  renderDashList();
  renderAnnList();
};