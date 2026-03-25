import { API } from "./api.js";

const state = {
  token: localStorage.getItem("token") || null,
  me: null,
  activeGroup: null,  // Changed from activeChat to activeGroup
  groups: [],         // Store loaded groups
  unreadCounts: {},   // Track unread messages per group
};

let socket = null;

function appendMessageToUI(m) {
  const div = document.createElement("div");
  const isMe = Number(m.senderid) === Number(state.me.sub);
  div.className = `message ${isMe ? "out" : "in"}`;
  
  // For group chats, show sender name with indicator if not in contacts
  let senderLabel = '';
  if (state.activeGroup && !state.activeGroup.isdirectchat && !isMe) {
    const notContactIndicator = !m.is_contact 
      ? `<span class="not-contact-indicator" title="Not in your contacts">👤</span> ` 
      : '';
    senderLabel = `<div class="small sender-name">${notContactIndicator}${escapeHtml(m.username || 'User')}</div>`;
  }
  
  div.innerHTML = `${senderLabel}<div class="bubble">${escapeHtml(m.content)}</div><div class="small time">${formatTimestamp(m.timestamp) || ""}</div>`;
  el.messages.appendChild(div);
  el.messages.scrollTop = el.messages.scrollHeight;
}

function connectSocket(token) {
  if (!token) return;
  console.log("token", token);
  try {
    if (socket) socket.close();
    // connect to messages service
    socket = io(API.MESSAGES_WS, { auth: { token } });

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("socket connect_error", err);
    });

    // Listen for group messages
    socket.on("groupMessage", (m) => {
      console.log("received groupMessage", m);
      const groupId = Number(m.groupid);
      const isMe = Number(m.senderid) === Number(state.me?.sub);
      
      if (state.activeGroup && Number(state.activeGroup.groupid) === groupId) {
        appendMessageToUI(m);
        if (!isMe) {
          markGroupMessagesRead(groupId, { force: true });
        }
      }
      
      updateGroupLastMessage(m.groupid, m.content, m.timestamp);
    });

    socket.on("messageUnread", (payload) => {
      const groupId = Number(payload?.groupid);
      if (!groupId) return;
      if (state.activeGroup && Number(state.activeGroup.groupid) === groupId) {
        markGroupMessagesRead(groupId, { force: true });
        return;
      }
      incrementGroupUnread(groupId);
    });

    socket.on("messagesRead", ({ groupid, userid }) => {
      if (Number(userid) === Number(state.me?.sub)) {
        setGroupUnread(groupid, 0);
      }
    });
    
    // Listen for when we're added to a new group
    socket.on("addedToGroup", (data) => {
      console.log("addedToGroup", data);
      // Reload conversations to show the new group
      loadConversations().then(() => {
        // Join the new group room
        socket.emit("joinGroup", data.groupid);
      });
    });

    socket.on("disconnect", () => {
      console.log("socket disconnected");
    });
  } catch (e) {
    console.error("connectSocket error", e);
  }
}

function updateGroupLastMessage(groupid, content, timestamp) {
  const group = state.groups.find(g => Number(g.groupid) === Number(groupid));
  if (group) {
    group.last_message = content;
    group.lastmessagetimestamp = timestamp;
    group.last_message_timestamp = timestamp; // Add this for sorting
    
    // Sort groups by most recent message
    state.groups.sort((a, b) => {
      const timeA = a.last_message_timestamp || a.lastmessagetimestamp;
      const timeB = b.last_message_timestamp || b.lastmessagetimestamp;
      if (!timeA && !timeB) return 0;
      if (!timeA) return 1;
      if (!timeB) return -1;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
    
    // Re-render conversations to show updated preview and new order
    renderGroupsList();
  } else {
    // Group not in list yet (e.g., new message from non-contact)
    // Reload conversations to fetch the new group
    console.log("New conversation detected, reloading...");
    loadConversations();
  }
}

function setGroupUnread(groupid, count) {
  const key = String(groupid);
  const normalized = Math.max(0, Number(count) || 0);
  state.unreadCounts[key] = normalized;
  const group = state.groups.find((g) => Number(g.groupid) === Number(groupid));
  if (group) {
    group.unread_count = normalized;
  }
  if (state.activeGroup && Number(state.activeGroup.groupid) === Number(groupid)) {
    state.activeGroup.unread_count = normalized;
  }
  renderGroupsList();
}

function incrementGroupUnread(groupid, delta = 1) {
  const key = String(groupid);
  const current = state.unreadCounts[key] ?? 0;
  setGroupUnread(groupid, current + delta);
}

async function markGroupMessagesRead(groupid, { force = false } = {}) {
  if (!state.token) return;
  const key = String(groupid);
  if (!force && (state.unreadCounts[key] ?? 0) === 0) return;
  try {
    const res = await fetch(API.MESSAGES_READ, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
      },
      body: JSON.stringify({ groupid }),
    });
    if (!res.ok) {
      console.error("Failed to mark messages read", await res.text());
      return;
    }
    setGroupUnread(groupid, 0);
  } catch (err) {
    console.error("markGroupMessagesRead error", err);
  }
}

const qs = (s) => document.querySelector(s);
const el = {
  authPage: qs("#auth-page"),
  chatPage: qs("#chat-page"),
  tabLogin: qs("#tab-login"),
  tabRegister: qs("#tab-register"),
  loginForm: qs("#login-form"),
  registerForm: qs("#register-form"),
  liUser: qs("#li-username"),
  liPass: qs("#li-password"),
  liMsg: qs("#li-msg"),
  reUser: qs("#re-username"),
  rePhone: qs("#re-phonenumber"),
  rePass: qs("#re-password"),
  reMsg: qs("#re-msg"),
  btnLogin: qs("#btn-login"),
  btnRegister: qs("#btn-register"),
  logout: qs("#logout-btn"),
  avatarLetter: qs("#avatar-letter"),
  userName: qs("#user-name"),
  userPhone: qs("#user-phone"),
  conversations: qs("#conversations"),
  chatHeader: qs("#chat-header"),
  messages: qs("#messages"),
  msgInput: qs("#msg-input"),
  sendBtn: qs("#send-btn"),
  modalOverlay: qs("#modal-overlay"),
  groupModal: qs("#group-modal"),
  groupName: qs("#group-name"),
  groupSearch: qs("#group-search"),
  groupContacts: qs("#group-contacts"),
  groupSelected: qs("#group-selected"),
  btnCreateGroup: qs("#btn-create-group"),
  btnCancelGroup: qs("#btn-cancel-group"),
  btnNewGroup: qs("#btn-new-group"),
};

function toggle(node, show) {
  node.classList[show ? "remove" : "add"]("hidden");
}

async function post(url, body, token) {
  const hdr = { "Content-Type": "application/json" };
  if (token) hdr.Authorization = `Bearer ${token}`;
  const r = await fetch(url, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify(body),
  });
  return r.json();
}
async function get(url, token) {
  const hdr = {};
  if (token) hdr.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers: hdr });
  return r.json();
}

function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return {};
  }
}

async function fetchProfile(userid, token) {
  try {
    return await get(`${API.USERS}/${userid}`, token);
  } catch {
    return null;
  }
}

async function doRegister(username, password, phoneNumber) {
  return post(API.REGISTER, { username, password, phoneNumber });
}
async function doLogin(username, password) {
  return post(API.LOGIN, { username, password });
}

function showAuth() {
  toggle(el.authPage, true);
  toggle(el.chatPage, false);
  // default tab
  el.tabLogin.classList.add("active");
  el.tabRegister.classList.remove("active");
  toggle(el.loginForm, true);
  toggle(el.registerForm, false);
}

function showChat() {
  toggle(el.authPage, false);
  toggle(el.chatPage, true);

  const letter = String(state.me.username || state.me.sub || "U")
    .charAt(0)
    .toUpperCase();
  el.avatarLetter.textContent = letter;
  el.userName.textContent = state.me.username || "User";
  el.userPhone.textContent = state.me.phonenumber || "Phone";

  loadConversations();
  el.chatHeader.textContent = "Select a chat";
  el.messages.innerHTML = "";
}

async function loadConversations() {
  let groups = [];
  try {
    groups = await get(API.GROUPS, state.token);
    if (!Array.isArray(groups)) groups = [];
  } catch (err) {
    console.error("loadConversations error", err);
    groups = [];
  }

  state.groups = groups;
  state.unreadCounts = {};
  state.groups.forEach((g) => {
    state.unreadCounts[String(g.groupid)] = Number(g.unread_count || 0);
  });

  if (state.activeGroup) {
    const refreshed = state.groups.find(
      (g) => Number(g.groupid) === Number(state.activeGroup.groupid)
    );
    if (refreshed) {
      state.activeGroup = refreshed;
    }
  }

  renderGroupsList();
}

function renderGroupsList() {
  el.conversations.innerHTML = "";

  state.groups.forEach((group) => {
    const isDirectChat = group.isdirectchat;
    const isContact = group.is_contact !== false; // true if contact or not a direct chat
    const key = String(group.groupid);
    const unread = state.unreadCounts[key] ?? Number(group.unread_count || 0);
    
    // For direct chats with non-contacts, show "UNKNOWN" with icon
    let displayName = group.display_name || group.groupname || "Unnamed Group";
    if (isDirectChat && !isContact) {
      displayName = `⚠️ UNKNOWN`;
    }
    
    const displayPicture = group.display_picture || group.grouppicture;
    const initial = isDirectChat && !isContact ? '?' : String(displayName).charAt(0).toUpperCase();
    const lastMsg = group.last_message || "";
    const memberCount = group.member_count || 0;
    const unreadBadge = unread > 0 ? `<span class="badge-unread">${unread}</span>` : "";

    const item = document.createElement("div");
    item.className = `conv ${isDirectChat && !isContact ? 'conv-unknown' : ''}`;
    item.dataset.groupid = String(group.groupid);
    if (unread > 0 && !(isDirectChat && !isContact)) {
      item.className += ' conv-has-unread';
    }

    const groupInfo = isDirectChat 
      ? `${escapeHtml(lastMsg.substring(0, 30))}${lastMsg.length > 30 ? "..." : ""}`
      : `${memberCount} members ${lastMsg === "" ? "" : "• "}${escapeHtml(lastMsg.substring(0, 20))}${lastMsg.length > 20 ? " ..." : ""}`;

    item.innerHTML = `
      <div class="conv-left">
        <div class="c-avatar ${isDirectChat && !isContact ? 'c-avatar-unknown' : ''}">${escapeHtml(initial)}</div>
      </div>
      <div class="conv-mid">
        <div class="c-name">${escapeHtml(displayName)}${unreadBadge}</div>
        <div class="c-last small">${groupInfo}</div>
      </div>
    `;

    item.onclick = () => loadConversation(group);
    el.conversations.appendChild(item);
  });
}

async function loadConversation(group) {
  state.activeGroup = group;
  const displayName = group.display_name || group.groupname || "Unnamed Group";
  
  // Build header with add contact button for direct chats with non-contacts
  let headerHTML = displayName;
  if (group.isdirectchat && group.other_user) {
    const otherUserId = group.other_user.userid;
    // Check if other user is in contacts
    const isContact = await isUserInContacts(otherUserId);
    if (!isContact && group.other_user.phonenumber) {
      headerHTML = `
        <span>${escapeHtml(displayName)}</span>
        <button id="btn-add-from-chat" class="btn-add-contact-header" 
                data-phone="${escapeHtml(group.other_user.phonenumber)}"
                title="Add to contacts">
          + Add Contact
        </button>
      `;
    }
  }
  
  el.chatHeader.innerHTML = headerHTML;
  
  // Wire up add contact button if present
  const addBtn = document.getElementById("btn-add-from-chat");
  if (addBtn) {
    addBtn.onclick = async () => {
      const phone = addBtn.dataset.phone;
      await addContactByPhone(phone);
      // Reload conversation to update header
      await loadConversation(state.activeGroup);
    };
  }
  
  try {
    const msgs = await get(
      `${API.GROUPS}/${group.groupid}/messages?limit=100`,
      state.token
    );
    el.messages.innerHTML = "";
    msgs.forEach((m) => {
      const div = document.createElement("div");
      const isMe = Number(m.senderid) === Number(state.me.sub);
      div.className = `message ${isMe ? "out" : "in"}`;
      
      // For group chats, show sender name with indicator if not in contacts
      let senderLabel = '';
      if (!group.isdirectchat && !isMe) {
        const notContactIndicator = !m.is_contact 
          ? `<span class="not-contact-indicator" title="Not in your contacts">👤</span> ` 
          : '';
        senderLabel = `<div class="small sender-name">${notContactIndicator}${escapeHtml(m.username || 'User')}</div>`;
      }
      
      div.innerHTML = `${senderLabel}<div class="bubble">${escapeHtml(
        m.content
      )}</div><div class="small time">${formatTimestamp(m.timestamp) || ""}</div>`;
      el.messages.appendChild(div);
    });
    el.messages.scrollTop = el.messages.scrollHeight;

    await markGroupMessagesRead(group.groupid);
  } catch (err) {
    console.error("loadConversation error", err);
    el.messages.innerHTML = "<div class='error'>Failed to load messages</div>";
  }
}

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";

  const pad = (n) => String(n).padStart(2, "0");
  const Y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());

  // Format: YYYY-MM-DD HH:MM (no 'T', no 'Z', no seconds)
  return `${Y}-${M}-${D} ${hh}:${mm}`;
}

async function addContact() {
  const phoneEl = document.getElementById("new-contact-phone");
  const phone = (phoneEl?.value || "").trim();

  if (!phone) return alert("Enter a phone number.");

  await addContactByPhone(phone);
  phoneEl.value = "";
}

async function addContactByPhone(phone) {
  try {
    const res = await fetch(API.CONTACTS, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(state.token ? { Authorization: "Bearer " + state.token } : {}),
      },
      body: JSON.stringify({ phonenumber: phone }),
    });

    if (res.status === 404) {
      alert("No user with that phone number exists.");
      return;
    }
    if (res.status === 409) {
      alert("This contact is already in your list.");
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert("Failed to add contact: " + (body.error || res.statusText));
      return;
    }

    // success
    alert("Contact added successfully!");
    
    // Clear cached contacts so modal reloads fresh data
    groupModalState.contacts = [];
    
    await loadConversations();
  } catch (err) {
    console.error("addContact error", err);
    alert("Network error while adding contact.");
  }
}

async function isUserInContacts(userid) {
  try {
    const contacts = await get(API.CONTACTS, state.token);
    return Array.isArray(contacts) && contacts.some(c => Number(c.contactuserid) === Number(userid));
  } catch (err) {
    console.error("isUserInContacts error", err);
    return false;
  }
}

// wiring
el.tabLogin.onclick = () => {
  el.tabLogin.classList.add("active");
  el.tabRegister.classList.remove("active");
  toggle(el.loginForm, true);
  toggle(el.registerForm, false);
};
el.tabRegister.onclick = () => {
  el.tabRegister.classList.add("active");
  el.tabLogin.classList.remove("active");
  toggle(el.loginForm, false);
  toggle(el.registerForm, true);
};

el.btnLogin.onclick = async () => {
  const u = el.liUser.value.trim();
  const p = el.liPass.value;
  const r = await doLogin(u, p);
  if (r.token) {
    state.token = r.token;
    localStorage.setItem("token", r.token);
    state.me = decodeToken(r.token);
    const prof = await fetchProfile(state.me.sub, state.token);
    if (prof && prof.userid) {
      state.me.username = prof.username;
      state.me.phonenumber = prof.phonenumber;
    }
    connectSocket(state.token);
    showChat();
  } else {
    el.liMsg.textContent = JSON.stringify(r);
  }
};

el.btnRegister.onclick = async () => {
  const u = el.reUser.value.trim();
  const p = el.rePass.value;
  const ph = el.rePhone.value.trim();
  const r = await doRegister(u, p, ph);
  
  if (r.userid) {
    el.reMsg.textContent = "Created. Please login.";
    el.reMsg.style.color = "#15803d";
  } else if (r.error) {
    if (r.error.includes("phone number already registered")) {
      el.reMsg.textContent = "This phone number is already registered.";
    } else if (r.error.includes("username already taken")) {
      el.reMsg.textContent = "This username is already taken.";
    } else {
      el.reMsg.textContent = r.error;
    }
    el.reMsg.style.color = "#b91c1c";
  } else {
    el.reMsg.textContent = JSON.stringify(r);
    el.reMsg.style.color = "#b91c1c";
  }
};

el.logout.onclick = () => {
  localStorage.removeItem("token");
  state.token = null;
  state.me = null;
  state.activeGroup = null;
  state.groups = [];
  state.unreadCounts = {};
  if (socket) {
    try { socket.disconnect(); } catch (e) {}
    socket = null;
  }
  showAuth();
};

el.sendBtn.onclick = async () => {
  const content = el.msgInput.value.trim();
  if (!content || !state.activeGroup) return;
  const payload = { groupid: state.activeGroup.groupid, content };

  if (socket && socket.connected) {
    // use WebSocket to send group message
    socket.emit("sendGroupMessage", payload, (ack) => {
      if (!(ack && ack.ok && ack.message)) {
        console.error("send ack error", ack);
        alert("Failed to send message (socket).");
      }
    });
  } else {
    // fallback to REST POST
    try {
      await post(
        API.MESSAGES,
        { groupid: state.activeGroup.groupid, content },
        state.token
      );
      // reload conversation
      await loadConversation(state.activeGroup);
    } catch (err) {
      console.error("fallback post send error", err);
      alert("Failed to send message (http).");
    }
  }

  el.msgInput.value = "";
};

// wire up button (place near other handlers)
document.getElementById("btn-add-contact").onclick = addContact;

// Enter key support for login form
document.getElementById('li-username').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-login').click();
  }
});

document.getElementById('li-password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-login').click();
  }
});

// Enter key support for register form
document.getElementById('re-username').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-register').click();
  }
});

document.getElementById('re-phonenumber').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-register').click();
  }
});

document.getElementById('re-password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-register').click();
  }
});

// Enter key support for message input
document.getElementById('msg-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('send-btn').click();
  }
});

// Enter key support for add contact input
document.getElementById('new-contact-phone').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-add-contact').click();
  }
});

// Enter key support for group modal inputs
document.getElementById('group-name').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-create-group').click();
  }
});

document.getElementById('group-search').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    // Just prevent default, search is handled by input event
  }
});

// state for modal
let groupModalState = {
  contacts: [],       // full contacts list
  filtered: [],       // filtered by search
  selected: new Map() // userid -> contact object
};

function renderGroupContacts(list) {
  el.groupContacts.innerHTML = "";
  list.forEach((c) => {
    const id = String(c.contactuserid ?? c.userid ?? "");
    const displayName = c.username || `User ${id}`;
    const row = document.createElement("div");
    row.className = "group-contact";
    row.dataset.userid = id;
    row.innerHTML = `<label><input type="checkbox" data-uid="${id}" ${groupModalState.selected.has(id) ? "checked" : ""}> ${escapeHtml(displayName)}</label>`;
    el.groupContacts.appendChild(row);
  });
}

function renderSelectedChips() {
  el.groupSelected.innerHTML = "";
  Array.from(groupModalState.selected.values()).forEach((c) => {
    const id = String(c.contactuserid ?? c.userid ?? "");
    const displayName = c.username || `User ${id}`;
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = displayName;
    chip.dataset.userid = id;
    el.groupSelected.appendChild(chip);
  });
}

function openGroupModal() {
  // Always reload contacts to ensure fresh data
  (async () => {
    try {
      // Fetch contacts fresh each time modal opens
      const contacts = await get(API.CONTACTS, state.token);
      groupModalState.contacts = Array.isArray(contacts) ? contacts : [];
      
      groupModalState.filtered = groupModalState.contacts.slice();
      renderGroupContacts(groupModalState.filtered);
      renderSelectedChips();
      
      // Show overlay and modal
      el.modalOverlay.classList.remove("hidden");
      el.groupModal.setAttribute("aria-hidden", "false");
      el.groupSearch.value = "";
      el.groupName.value = "";
    } catch (err) {
      console.error("failed to load contacts for group", err);
      alert("Failed to load contacts.");
    }
  })();
}

function closeGroupModal() {
  // Hide overlay and modal
  el.modalOverlay.classList.add("hidden");
  el.groupModal.setAttribute("aria-hidden", "true");
  groupModalState = { contacts: groupModalState.contacts, filtered: [], selected: new Map() };
  el.groupContacts.innerHTML = "";
  el.groupSelected.innerHTML = "";
}

// contact checkbox handler (event delegation)
el.groupContacts?.addEventListener?.("change", (ev) => {
  const cb = ev.target;
  if (cb && cb.dataset && cb.dataset.uid) {
    const uid = String(cb.dataset.uid);
    if (cb.checked) {
      const contact = groupModalState.contacts.find((c) => String(c.contactuserid ?? c.userid) === uid);
      if (contact) groupModalState.selected.set(uid, contact);
    } else {
      groupModalState.selected.delete(uid);
    }
    renderSelectedChips();
  }
});

// filter contacts as user types
el.groupSearch?.addEventListener?.("input", (ev) => {
  const q = (ev.target.value || "").toLowerCase().trim();
  groupModalState.filtered = groupModalState.contacts.filter((c) => {
    const name = String(c.username || "").toLowerCase();
    const phone = String(c.phonenumber || "").toLowerCase();
    return !q || name.includes(q) || phone.includes(q);
  });
  renderGroupContacts(groupModalState.filtered);
});

// create group or direct chat
async function createGroup() {
  const name = (el.groupName.value || "").trim();
  const members = Array.from(groupModalState.selected.keys()).map((id) => Number(id));
  
  if (members.length < 1) {
    alert("Select at least one contact");
    return;
  }

  const isDirectChat = members.length === 1;
  
  if (!isDirectChat && !name) {
    alert("Please enter a group name for group chats");
    return;
  }

  try {
    const body = { 
      groupname: name, 
      members,
      isdirectchat: isDirectChat 
    };
    const res = await post(API.GROUPS, body, state.token);
    
    closeGroupModal();
    await loadConversations();
    
    // Open the newly created group/chat
    if (res && res.groupid) {
      const newGroup = state.groups.find(g => g.groupid === res.groupid);
      if (newGroup) {
        await loadConversation(newGroup);
        // Join the group room via socket
        if (socket && socket.connected) {
          socket.emit("joinGroup", res.groupid);
        }
      }
    }
  } catch (err) {
    console.error("create group error", err);
    alert("Failed to create group/chat.");
  }
}

// wire modal buttons
el.btnNewGroup && (el.btnNewGroup.onclick = openGroupModal);
el.btnCancelGroup && (el.btnCancelGroup.onclick = closeGroupModal);
el.btnCreateGroup && (el.btnCreateGroup.onclick = createGroup);

// Close modal when clicking on overlay background
el.modalOverlay && el.modalOverlay.addEventListener("click", (e) => {
  if (e.target === el.modalOverlay) {
    closeGroupModal();
  }
});


// boot
(async function start() {
  if (state.token) {
    state.me = decodeToken(state.token);
    try {
      const prof = await fetchProfile(state.me.sub, state.token);
      if (prof && prof.userid) {
        state.me.username = prof.username;
        state.me.phonenumber = prof.phonenumber;
      }
      connectSocket(state.token); // <-- add this
      showChat();
      return;
    } catch {}
  }
  showAuth();
})();
