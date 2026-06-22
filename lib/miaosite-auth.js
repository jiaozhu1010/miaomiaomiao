(function(window, document) {
    'use strict';

    var TOKEN_KEY = 'miaosite_token';
    var USER_KEY = 'miaosite_user';
    var mounted = false;
    var options = {};
    var authMode = 'login';
    var listeners = [];
    var lastAuthState = null;
    var scrollLocked = false;
    var scrollLockY = 0;
    var bodyLockStyle = null;

    function emit(event, detail) {
        listeners.forEach(function(listener) {
            try { listener(event, detail || {}); } catch (_) {}
        });
    }

    function toast(message, type) {
        if (typeof options.toast === 'function') {
            options.toast(message, type || 'info');
        }
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); }
        catch (_) { return null; }
    }

    function setSession(token, user, eventName) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        updateUI();
        if (eventName !== false) {
            emit(eventName || 'login', { user: user });
        }
    }

    function clearSession(reason) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        updateUI();
        emit('logout', { reason: reason || 'manual' });
    }

    function isLoggedIn() {
        return !!getToken();
    }

    function buildHeaders(headers) {
        var next = Object.assign({}, headers || {});
        var token = getToken();
        if (token) next.Authorization = 'Bearer ' + token;
        return next;
    }

    function headers(headers) {
        return buildHeaders(headers);
    }

    async function authFetch(url, fetchOptions) {
        var opts = fetchOptions || {};
        var response = await fetch(url, Object.assign({}, opts, {
            headers: buildHeaders(opts.headers)
        }));
        if (response.status === 401) {
            clearSession('expired');
            toast('登录已过期，请重新登录喵~', 'error');
            showAuth('login');
        }
        return response;
    }

    async function requestJson(url, payload, method) {
        var response = await fetch(url, {
            method: method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
        var data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || '请求失败喵~');
        return data;
    }

    async function login(payload) {
        var data = await requestJson('/api/auth/login', payload, 'POST');
        setSession(data.token, data.user);
        toast('欢迎回来喵~ ' + data.user.username, 'success');
        return data.user;
    }

    async function register(payload) {
        var data = await requestJson('/api/auth/register', payload, 'POST');
        setSession(data.token, data.user);
        toast('欢迎加入喵码喵~', 'success');
        return data.user;
    }

    async function updateProfile(payload) {
        var response = await authFetch('/api/auth/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
        var data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || '更新资料失败喵~');
        setSession(data.token, data.user, 'profile:update');
        toast('资料已更新喵~', 'success');
        return data.user;
    }

    async function changePassword(payload) {
        var response = await authFetch('/api/auth/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload || {})
        });
        var data = await response.json().catch(function() { return {}; });
        if (!response.ok) throw new Error(data.error || '修改密码失败喵~');
        toast(data.message || '密码已更新喵~', 'success');
        return data;
    }

    async function refreshCurrentUser() {
        if (!getToken()) {
            updateUI();
            return null;
        }
        var response = await authFetch('/api/auth/me');
        if (!response.ok) return null;
        var user = await response.json();
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        updateUI();
        return user;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatValue(value) {
        return value || '-';
    }

    function renderShell() {
        if (document.getElementById('miaosite-auth-root')) return;
        var root = document.createElement('div');
        root.id = 'miaosite-auth-root';
        root.innerHTML = [
            '<div class="auth-overlay miaosite-auth-overlay" id="miaosite-auth-modal">',
            '  <div class="auth-card miaosite-auth-card" role="dialog" aria-modal="true" aria-labelledby="miaosite-auth-title">',
            '    <button class="auth-close" type="button" data-auth-action="close">×</button>',
            '    <div class="auth-tabs">',
            '      <button class="auth-tab active" type="button" data-auth-tab="login">登录</button>',
            '      <button class="auth-tab" type="button" data-auth-tab="register">注册</button>',
            '    </div>',
            '    <h2 id="miaosite-auth-title">登录</h2>',
            '    <div class="auth-subtitle" id="miaosite-auth-subtitle">欢迎使用喵码</div>',
            '    <div class="auth-error" id="miaosite-auth-error"></div>',
            '    <form id="miaosite-auth-form" autocomplete="on">',
            '      <input class="auth-input" type="text" id="miaosite-auth-username" placeholder="用户名或邮箱" autocomplete="username" required>',
            '      <input class="auth-input" type="email" id="miaosite-auth-email" placeholder="邮箱地址" autocomplete="email">',
            '      <input class="auth-input" type="password" id="miaosite-auth-password" placeholder="密码" autocomplete="current-password" required>',
            '      <button class="auth-submit btn-auth-submit" type="submit" id="miaosite-auth-submit">登录喵~</button>',
            '    </form>',
            '  </div>',
            '</div>',
            '<div class="auth-overlay miaosite-account-overlay" id="miaosite-account-modal">',
            '  <div class="auth-card miaosite-account-card" role="dialog" aria-modal="true" aria-labelledby="miaosite-account-title">',
            '    <button class="auth-close" type="button" data-account-action="close">×</button>',
            '    <h2 id="miaosite-account-title">个人中心</h2>',
            '    <div id="miaosite-account-body"></div>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(root);
    }

    function isOverlayOpen() {
        var authOverlay = document.getElementById('miaosite-auth-modal');
        var accountOverlay = document.getElementById('miaosite-account-modal');
        return !!(
            (authOverlay && authOverlay.classList.contains('show')) ||
            (accountOverlay && accountOverlay.classList.contains('show'))
        );
    }

    function updateScrollLock() {
        var shouldLock = isOverlayOpen();
        if (shouldLock === scrollLocked) return;
        scrollLocked = shouldLock;
        document.documentElement.classList.toggle('miaosite-modal-open', shouldLock);
        document.body.classList.toggle('miaosite-modal-open', shouldLock);
        if (shouldLock) {
            scrollLockY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            bodyLockStyle = {
                position: document.body.style.position,
                top: document.body.style.top,
                left: document.body.style.left,
                right: document.body.style.right,
                width: document.body.style.width
            };
            document.body.style.position = 'fixed';
            document.body.style.top = '-' + scrollLockY + 'px';
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
        } else {
            if (bodyLockStyle) {
                document.body.style.position = bodyLockStyle.position;
                document.body.style.top = bodyLockStyle.top;
                document.body.style.left = bodyLockStyle.left;
                document.body.style.right = bodyLockStyle.right;
                document.body.style.width = bodyLockStyle.width;
                bodyLockStyle = null;
            }
            window.scrollTo(0, scrollLockY);
        }
    }

    function showAuth(mode) {
        authMode = mode || 'login';
        renderShell();
        updateAuthMode();
        setAuthError('');
        var overlay = document.getElementById('miaosite-auth-modal');
        if (overlay) overlay.classList.add('show');
        updateScrollLock();
    }

    function hideAuth() {
        var overlay = document.getElementById('miaosite-auth-modal');
        if (overlay) overlay.classList.remove('show');
        updateScrollLock();
    }

    function showAccount() {
        renderShell();
        renderAccount();
        var overlay = document.getElementById('miaosite-account-modal');
        if (overlay) overlay.classList.add('show');
        updateScrollLock();
    }

    function hideAccount() {
        var overlay = document.getElementById('miaosite-account-modal');
        if (overlay) overlay.classList.remove('show');
        updateScrollLock();
    }

    function updateAuthMode() {
        var isLogin = authMode === 'login';
        var title = document.getElementById('miaosite-auth-title');
        var subtitle = document.getElementById('miaosite-auth-subtitle');
        var email = document.getElementById('miaosite-auth-email');
        var submit = document.getElementById('miaosite-auth-submit');
        var username = document.getElementById('miaosite-auth-username');
        document.querySelectorAll('[data-auth-tab]').forEach(function(tab) {
            tab.classList.toggle('active', tab.getAttribute('data-auth-tab') === authMode);
        });
        if (title) title.textContent = isLogin ? '登录' : '注册';
        if (subtitle) subtitle.textContent = isLogin ? '欢迎使用喵码' : '加入喵码，解锁全部功能';
        if (email) email.style.display = isLogin ? 'none' : '';
        if (submit) submit.textContent = isLogin ? '登录喵~' : '注册喵~';
        if (username) username.placeholder = isLogin ? '用户名或邮箱' : '用户名';
    }

    function setAuthError(message) {
        var error = document.getElementById('miaosite-auth-error');
        if (!error) return;
        error.textContent = message || '';
        error.style.display = message ? '' : 'none';
    }

    function renderAccount() {
        var user = getUser();
        var body = document.getElementById('miaosite-account-body');
        if (!body || !user) return;
        body.innerHTML = [
            '<div class="account-summary">',
            '  <strong>' + escapeHtml(user.username || '已登录') + '</strong>',
            '  <span>' + escapeHtml(user.email || '-') + '</span>',
            '</div>',
            '<div class="account-meta">',
            '  <div><span>角色</span><strong>' + escapeHtml(user.role || 'user') + '</strong></div>',
            '  <div><span>注册时间</span><strong>' + escapeHtml(formatValue(user.createdAt)) + '</strong></div>',
            '  <div><span>上次登录</span><strong>' + escapeHtml(formatValue(user.lastLoginAt)) + '</strong></div>',
            '  <div><span>登录次数</span><strong>' + escapeHtml(user.loginCount || 0) + '</strong></div>',
            '</div>',
            '<form class="account-form" id="miaosite-profile-form">',
            '  <label>用户名<input class="auth-input" name="username" maxlength="20" value="' + escapeHtml(user.username || '') + '"></label>',
            '  <label>邮箱<input class="auth-input" name="email" type="email" value="' + escapeHtml(user.email || '') + '"></label>',
            '  <button class="auth-submit" type="submit">保存资料喵~</button>',
            '</form>',
            '<form class="account-form" id="miaosite-password-form">',
            '  <label>当前密码<input class="auth-input" name="currentPassword" type="password" autocomplete="current-password"></label>',
            '  <label>新密码<input class="auth-input" name="newPassword" type="password" autocomplete="new-password"></label>',
            '  <label>确认新密码<input class="auth-input" name="confirmPassword" type="password" autocomplete="new-password"></label>',
            '  <button class="auth-submit" type="submit">更新密码喵~</button>',
            '</form>',
            '<button class="account-logout" type="button" data-account-action="logout">退出登录喵~</button>'
        ].join('');
    }

    function updateAdminEntry(user) {
        var btn = document.getElementById('admin-entry');
        if (!btn) return;
        btn.style.display = user && user.username === 'manager' ? '' : 'none';
    }

    function updateUI() {
        var button = document.getElementById('btn-user');
        var label = document.getElementById('user-label');
        var user = getUser();
        var activeUser = user && getToken() ? user : null;
        if (label) label.textContent = activeUser ? activeUser.username : '登录';
        if (button) button.title = activeUser ? '打开个人中心' : '登录/注册';
        updateAdminEntry(activeUser);
        var nextAuthState = activeUser ? [activeUser.id, activeUser.username, activeUser.email, activeUser.role].join('|') : 'guest';
        if (nextAuthState !== lastAuthState && typeof options.onAuthChange === 'function') {
            lastAuthState = nextAuthState;
            options.onAuthChange(activeUser);
        }
    }

    function bindEvents() {
        document.addEventListener('click', function(event) {
            var target = event.target;
            if (target.id === 'btn-user' || (target.closest && target.closest('#btn-user'))) {
                event.preventDefault();
                if (isLoggedIn()) showAccount();
                else if (document.getElementById('auth-root')) return; // React handles this
                else showAuth('login');
            }
            if (target.getAttribute && target.getAttribute('data-auth-action') === 'close') hideAuth();
            if (target.getAttribute && target.getAttribute('data-account-action') === 'close') hideAccount();
            if (target.getAttribute && target.getAttribute('data-account-action') === 'logout') {
                clearSession('manual');
                hideAccount();
                toast('已退出登录喵~', 'success');
            }
            if (target.getAttribute && target.getAttribute('data-auth-tab')) {
                authMode = target.getAttribute('data-auth-tab');
                setAuthError('');
                updateAuthMode();
            }
            if (target.id === 'miaosite-auth-modal') hideAuth();
            if (target.id === 'miaosite-account-modal') hideAccount();
        });

        document.addEventListener('wheel', function(event) {
            if (!scrollLocked) return;
            var overlay = event.target.closest && event.target.closest('.miaosite-auth-overlay, .miaosite-account-overlay');
            if (overlay) event.stopPropagation();
        }, { passive: true });

        document.addEventListener('submit', async function(event) {
            if (event.target.id === 'miaosite-auth-form') {
                event.preventDefault();
                await handleAuthSubmit(event.target);
            }
            if (event.target.id === 'miaosite-profile-form') {
                event.preventDefault();
                await handleProfileSubmit(event.target);
            }
            if (event.target.id === 'miaosite-password-form') {
                event.preventDefault();
                await handlePasswordSubmit(event.target);
            }
        });
    }

    async function handleAuthSubmit(form) {
        var username = form.querySelector('#miaosite-auth-username').value.trim();
        var email = form.querySelector('#miaosite-auth-email').value.trim();
        var password = form.querySelector('#miaosite-auth-password').value;
        var submit = form.querySelector('#miaosite-auth-submit');
        if (!username || !password) {
            setAuthError('请填写用户名和密码喵~');
            return;
        }
        if (authMode === 'register' && !email) {
            setAuthError('请填写邮箱喵~');
            return;
        }
        try {
            setAuthError('');
            if (submit) submit.disabled = true;
            if (authMode === 'login') await login({ username: username, password: password });
            else await register({ username: username, email: email, password: password });
            form.reset();
            hideAuth();
        } catch (error) {
            setAuthError(error.message || '认证失败喵~');
        } finally {
            if (submit) submit.disabled = false;
        }
    }

    async function handleProfileSubmit(form) {
        try {
            await updateProfile({
                username: form.elements.username.value.trim(),
                email: form.elements.email.value.trim()
            });
            renderAccount();
        } catch (error) {
            toast(error.message || '更新资料失败喵~', 'error');
        }
    }

    async function handlePasswordSubmit(form) {
        var next = form.elements.newPassword.value;
        var confirm = form.elements.confirmPassword.value;
        if (next !== confirm) {
            toast('两次新密码不一致喵~', 'error');
            return;
        }
        try {
            await changePassword({
                currentPassword: form.elements.currentPassword.value,
                newPassword: next
            });
            form.reset();
        } catch (error) {
            toast(error.message || '修改密码失败喵~', 'error');
        }
    }

    function mount(mountOptions) {
        options = mountOptions || {};
        renderShell();
        if (!mounted) {
            bindEvents();
            mounted = true;
        }
        updateUI();
        refreshCurrentUser().catch(function() {});
    }

    var api = {
        mount: mount,
        on: function(listener) { listeners.push(listener); },
        getToken: getToken,
        getUser: getUser,
        setSession: setSession,
        clearSession: clearSession,
        isLoggedIn: isLoggedIn,
        headers: headers,
        fetch: authFetch,
        authFetch: authFetch,
        login: login,
        register: register,
        updateProfile: updateProfile,
        changePassword: changePassword,
        refreshCurrentUser: refreshCurrentUser,
        showAuth: showAuth,
        closeAuth: hideAuth,
        showAccount: showAccount
    };

    window.MiaositeAuth = api;
    window.Auth = api;
})(window, document);
