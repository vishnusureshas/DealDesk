(() => {
  const TOKEN_KEY = 'dealdesk_token';

  const state = {
    token: localStorage.getItem(TOKEN_KEY),
    user: null,
    socket: null,
    current: null,
    threads: [],
    notifications: [],
  };

  const byId = (id) => document.getElementById(id);

  const els = {
    status: byId('status'),
    loginPanel: byId('loginPanel'),
    chatPanel: byId('chatPanel'),
    loginForm: byId('loginForm'),
    email: byId('email'),
    password: byId('password'),
    currentUser: byId('currentUser'),
    logoutButton: byId('logoutButton'),
    threadList: byId('threadList'),
    threadTitle: byId('threadTitle'),
    messages: byId('messages'),
    messageForm: byId('messageForm'),
    messageInput: byId('messageInput'),
    sendButton: byId('sendButton'),
    notificationList: byId('notificationList'),
    refreshButton: byId('refreshButton'),
    refreshNotificationsButton: byId('refreshNotificationsButton'),
  };

  function setStatus(text, isError = false) {
    els.status.textContent = text;
    els.status.classList.toggle('error', isError);
  }

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});

    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }

    const response = await fetch(path, Object.assign({}, options, { headers }));
    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error(
        (payload && payload.error && payload.error.message) ||
          `Request failed (${response.status})`,
      );
      error.status = response.status;
      error.code = payload && payload.error && payload.error.code;

      if (response.status === 401 && state.token) {
        logout(true);
      }

      throw error;
    }

    return payload;
  }

  function socketAck(event, payload) {
    return new Promise((resolve) => {
      if (!state.socket || !state.socket.connected) {
        resolve({
          ok: false,
          error: { message: 'Socket is not connected' },
        });
        return;
      }

      let settled = false;
      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({
          ok: false,
          error: { message: 'Socket request timed out' },
        });
      }, 5000);

      state.socket.emit(event, payload, (response) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(
          response || {
            ok: false,
            error: { message: 'Empty socket response' },
          },
        );
      });
    });
  }

  function showLogin() {
    els.loginPanel.classList.remove('hidden');
    els.chatPanel.classList.add('hidden');
    els.currentUser.textContent = '';
    els.threadList.replaceChildren();
    els.messages.replaceChildren();
    els.notificationList.replaceChildren();
    els.threadTitle.textContent = 'Select a thread';
    els.messageInput.value = '';
    els.messageInput.disabled = true;
    els.sendButton.disabled = true;
  }

  function showChat() {
    els.loginPanel.classList.add('hidden');
    els.chatPanel.classList.remove('hidden');
    els.currentUser.textContent = state.user ? state.user.email : '';
  }

  function connectSocket() {
    if (state.socket) {
      state.socket.disconnect();
    }

    const socket = window.io({ auth: { token: state.token } });
    state.socket = socket;

    socket.on('connect', () => {
      setStatus('Connected');
      refreshThreads().catch((error) => setStatus(error.message, true));
      refreshNotifications().catch((error) =>
        setStatus(error.message, true),
      );

      if (state.current) {
        joinCurrent().catch((error) => setStatus(error.message, true));
      }
    });

    socket.on('disconnect', () => {
      setStatus('Disconnected');
    });

    socket.on('connect_error', (error) => {
      setStatus(`Connection failed: ${error.message}`, true);

      if (/token|auth/i.test(error.message)) {
        logout(true);
      }
    });

    socket.on('chat:message', (envelope) => {
      onChatMessage(envelope);
    });

    socket.on('notification', (envelope) => {
      onNotification(envelope);
    });
  }

  async function joinCurrent() {
    if (!state.current) {
      return;
    }

    const response = await socketAck('thread:join', {
      dealId: state.current.dealId,
    });

    if (!response.ok) {
      throw new Error(
        (response.error && response.error.message) ||
          'Unable to join thread',
      );
    }
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
  }

  function senderLabel(senderId) {
    if (state.user && senderId === state.user.id) {
      return 'You';
    }

    return `User ${String(senderId).slice(-6)}`;
  }

  function messageNode(message) {
    const id = String(message._id || message.id || '');
    const article = document.createElement('article');
    article.className = 'message';

    if (state.user && message.senderId === state.user.id) {
      article.classList.add('mine');
    }

    if (id) {
      article.dataset.messageId = id;
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';

    const sender = document.createElement('span');
    sender.textContent = senderLabel(message.senderId);

    const time = document.createElement('span');
    time.textContent = formatTime(message.createdAt);

    meta.append(sender, time);

    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = message.body;

    article.append(meta, body);

    return article;
  }

  function appendMessage(message) {
    const id = String(message._id || message.id || '');

    if (
      id &&
      els.messages.querySelector(
        `[data-message-id="${id}"]`,
      )
    ) {
      return;
    }

    const placeholder = els.messages.querySelector('.muted');

    if (placeholder) {
      placeholder.remove();
    }

    els.messages.append(messageNode(message));
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderThreads() {
    els.threadList.replaceChildren();

    if (state.threads.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No threads yet.';
      els.threadList.append(empty);
      return;
    }

    for (const thread of state.threads) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thread';

      if (
        state.current &&
        state.current.dealId === thread.dealId
      ) {
        button.classList.add('active');
      }

      const titleRow = document.createElement('span');
      titleRow.className = 'thread-title';

      const title = document.createElement('span');
      title.textContent = thread.title || thread.dealId;

      if (thread.unreadCount > 0) {
        const unread = document.createElement('span');
        unread.className = 'unread-badge';
        unread.textContent = String(thread.unreadCount);
        titleRow.append(title, unread);
      } else {
        titleRow.append(title);
      }

      const preview = document.createElement('span');
      preview.className = 'thread-preview';
      preview.textContent = thread.lastMessage
        ? `${senderLabel(thread.lastMessage.senderId)}: ${
            thread.lastMessage.body
          }`
        : 'No messages yet';

      button.append(titleRow, preview);
      button.addEventListener('click', () => {
        selectThread(thread).catch((error) =>
          setStatus(error.message, true),
        );
      });

      els.threadList.append(button);
    }
  }

  async function refreshThreads() {
    const data = await api('/threads');
    state.threads = data.items || [];
    renderThreads();
  }

  async function selectThread(thread) {
    state.current = {
      threadId: thread.threadId,
      dealId: thread.dealId,
      title: thread.title || thread.dealId,
    };

    els.threadTitle.textContent = state.current.title;
    els.messageInput.disabled = false;
    els.sendButton.disabled = false;
    els.messageInput.focus();
    renderThreads();

    await joinCurrent();

    const data = await api(
      `/threads/${encodeURIComponent(thread.threadId)}/messages?limit=50`,
    );
    const messages = (data.items || []).slice().reverse();

    els.messages.replaceChildren();

    if (messages.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No messages yet. Say hello.';
      els.messages.append(empty);
    } else {
      for (const message of messages) {
        els.messages.append(messageNode(message));
      }
      els.messages.scrollTop = els.messages.scrollHeight;
    }

    await api(
      `/threads/${encodeURIComponent(thread.threadId)}/read`,
      { method: 'POST' },
    );

    if (state.socket && state.socket.connected) {
      state.socket.emit('thread:read', { dealId: thread.dealId });
    }

    await refreshThreads();
  }

  async function onChatMessage(envelope) {
    const data = envelope && envelope.data;

    if (!data || !data.message) {
      return;
    }

    if (
      state.current &&
      state.current.dealId === data.dealId
    ) {
      appendMessage(data.message);

      try {
        await api(
          `/threads/${encodeURIComponent(
            state.current.threadId,
          )}/read`,
          { method: 'POST' },
        );
      } catch {
        // Keep the live message visible even if read tracking fails.
      }

      if (state.socket && state.socket.connected) {
        state.socket.emit('thread:read', {
          dealId: state.current.dealId,
        });
      }
    }

    refreshThreads().catch((error) =>
      setStatus(error.message, true),
    );
  }

  function notificationNode(notification) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notification';

    if (!notification.readAt) {
      button.classList.add('unread');
    }

    const title = document.createElement('span');
    title.className = 'notification-title';
    title.textContent = notification.type;

    const meta = document.createElement('span');
    meta.className = 'notification-meta';
    const payloadText = notification.payload
      ? JSON.stringify(notification.payload)
      : '';
    meta.textContent = `${notification.readAt ? 'Read' : 'Unread'} - ${formatTime(
      notification.createdAt,
    )} ${payloadText}`.trim();

    button.append(title, meta);

    if (!notification.readAt) {
      button.addEventListener('click', async () => {
        try {
          const response = await api(
            `/notifications/${encodeURIComponent(
              notification._id,
            )}/read`,
            { method: 'PATCH' },
          );
          notification.readAt = response.readAt;
          renderNotifications();
        } catch (error) {
          setStatus(error.message, true);
        }
      });
    }

    return button;
  }

  function renderNotifications() {
    els.notificationList.replaceChildren();

    if (state.notifications.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'No notifications yet.';
      els.notificationList.append(empty);
      return;
    }

    for (const notification of state.notifications) {
      els.notificationList.append(
        notificationNode(notification),
      );
    }
  }

  async function refreshNotifications() {
    const data = await api('/notifications?limit=50');
    state.notifications = data.items || [];
    renderNotifications();
  }

  function onNotification(envelope) {
    const notification =
      envelope && envelope.data && envelope.data.notification;

    if (!notification) {
      return;
    }

    state.notifications = [
      notification,
      ...state.notifications.filter(
        (item) => item._id !== notification._id,
      ),
    ];
    renderNotifications();
  }

  async function login(email, password) {
    setStatus('Signing in...');

    const session = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    state.token = session.token;
    state.user = session.user;
    localStorage.setItem(TOKEN_KEY, state.token);

    showChat();
    connectSocket();

    await Promise.all([refreshThreads(), refreshNotifications()]);
  }

  function logout(clearStorage = true) {
    if (state.socket) {
      state.socket.disconnect();
      state.socket = null;
    }

    state.token = null;
    state.user = null;
    state.current = null;
    state.threads = [];
    state.notifications = [];

    if (clearStorage) {
      localStorage.removeItem(TOKEN_KEY);
    }

    showLogin();
    setStatus('Signed out');
  }

  async function restoreSession() {
    if (!state.token) {
      showLogin();
      setStatus('Not connected');
      return;
    }

    try {
      const data = await api('/auth/me');
      state.user = data.user;
      showChat();
      connectSocket();
      await Promise.all([
        refreshThreads(),
        refreshNotifications(),
      ]);
    } catch {
      logout(true);
    }
  }

  els.loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    login(els.email.value.trim(), els.password.value).catch(
      (error) => setStatus(error.message, true),
    );
  });

  for (const button of document.querySelectorAll(
    '.demo-logins [data-email]',
  )) {
    button.addEventListener('click', () => {
      els.email.value = button.dataset.email;
      els.password.value = 'Password123!';
      els.email.focus();
    });
  }

  els.logoutButton.addEventListener('click', () => logout(true));

  els.messageForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.current) {
      return;
    }

    const body = els.messageInput.value.trim();

    if (!body) {
      return;
    }

    const clientId =
      window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    els.sendButton.disabled = true;

    try {
      const response = await socketAck('message:send', {
        dealId: state.current.dealId,
        body,
        clientId,
      });

      if (!response.ok) {
        throw new Error(
          (response.error && response.error.message) ||
            'Message failed',
        );
      }

      els.messageInput.value = '';
      appendMessage(response.message);
      refreshThreads().catch(() => undefined);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      els.sendButton.disabled = false;
      els.messageInput.focus();
    }
  });

  els.refreshButton.addEventListener('click', () => {
    const tasks = [refreshThreads(), refreshNotifications()];

    if (state.current) {
      const currentThread = state.threads.find(
        (thread) => thread.dealId === state.current.dealId,
      );

      if (currentThread) {
        tasks.push(selectThread(currentThread));
      }
    }

    Promise.all(tasks).catch((error) =>
      setStatus(error.message, true),
    );
  });

  els.refreshNotificationsButton.addEventListener('click', () => {
    refreshNotifications().catch((error) =>
      setStatus(error.message, true),
    );
  });

  restoreSession();
})();
