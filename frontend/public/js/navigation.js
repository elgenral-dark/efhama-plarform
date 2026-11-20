(() => {
  /* ================= قائمة الموبايل ================= */
  const toggle = document.getElementById('navToggle');
  const navigation = document.getElementById('mainNav');
  const header = document.querySelector('.site-header');

  if (toggle && navigation && header) {
    const setOpen = (open) => {
      navigation.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'إغلاق قائمة التنقل' : 'فتح قائمة التنقل');
    };

    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    navigation.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', (event) => {
      if (!header.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (getComputedStyle(toggle).display === 'none') setOpen(false);
    });
  }

  /* ================= الوضع الداكن / الفاتح الموحد ================= */
  function setupTheme() {
    const themeKey = 'efhamha_theme';
    const apply = (theme) => {
      document.documentElement.setAttribute('data-theme', theme);
      if (document.body) {
        document.body.setAttribute('data-theme', theme);
        document.body.dataset.theme = theme;
      }
      const iconMoon = document.querySelector('#themeToggle .icon-moon, .theme-toggle .icon-moon');
      const iconSun = document.querySelector('#themeToggle .icon-sun, .theme-toggle .icon-sun');
      if (iconMoon) iconMoon.classList.toggle('hidden', theme === 'dark');
      if (iconSun) iconSun.classList.toggle('hidden', theme !== 'dark');

      const textToggle = document.querySelector('[data-theme-toggle]');
      if (textToggle && textToggle.classList.contains('theme-switch')) {
        textToggle.textContent = theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
      }

      if (typeof window.updateLessonVisualTheme === 'function') {
        try { window.updateLessonVisualTheme(document.querySelector('[data-lesson-content]')); } catch(e){}
      }
    };

    window.applySiteTheme = apply;

    const current = localStorage.getItem(themeKey) ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    apply(current);

    const themeToggle = document.getElementById('themeToggle') || document.querySelector('.theme-toggle, [data-theme-toggle]');
    if (themeToggle && !themeToggle._themeBound) {
      themeToggle._themeBound = true;
      themeToggle.addEventListener('click', (e) => {
        e.preventDefault();
        const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(themeKey, nextTheme);
        apply(nextTheme);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTheme);
  } else {
    setupTheme();
  }

  function mountNotificationBell() {
    const actions = document.querySelector('.header-actions');
    if (!actions || typeof window.Auth === 'undefined' || !window.Auth.isLoggedIn()) return;

    window.Auth.check().then((user) => {
      if (!user || actions.querySelector('.notification-center')) return;
      const categories = {
        general: 'عام', course: 'دورة', lesson: 'درس', exam: 'اختبار',
        assignment: 'واجب', grade: 'درجة', subscription: 'اشتراك',
        payment: 'دفع', account: 'حساب', system: 'النظام',
        teacher: 'المعلم', admin: 'الإدارة'
      };
      const center = document.createElement('div');
      center.className = 'notification-center';
      const bell = document.createElement('button');
      bell.type = 'button';
      bell.className = 'notification-bell';
      bell.setAttribute('aria-label', 'الإشعارات');
      bell.setAttribute('aria-expanded', 'false');
      bell.setAttribute('aria-haspopup', 'true');
      bell.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
      const badge = document.createElement('span');
      badge.className = 'notification-badge';
      badge.hidden = true;
      bell.appendChild(badge);
      const panel = document.createElement('section');
      panel.className = 'notification-dropdown';
      panel.hidden = true;
      panel.setAttribute('aria-label', 'أحدث الإشعارات');
      const heading = document.createElement('div');
      heading.className = 'notification-dropdown-head';
      heading.innerHTML = '<strong>الإشعارات</strong><a href="/notifications.html">عرض الكل</a>';
      const status = document.createElement('div');
      status.className = 'notification-dropdown-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      const items = document.createElement('div');
      items.className = 'notification-dropdown-list';
      panel.append(heading, status, items);
      center.append(bell, panel);
      actions.insertBefore(center, actions.firstChild);

      let interval = null;
      let inFlight = false;
      let queuedItems = false;
      const pollingInterval = Math.max(10000, Math.min(Number(window.EFHAMHA_NOTIFICATION_POLL_MS) || 30000, 300000));
      function fetchJson(url, method) {
        return fetch(url, { method: method || 'GET', credentials: 'same-origin', cache: 'no-store' })
          .then((response) => response.json().catch(() => ({})).then((data) => {
            if (!response.ok) {
              const error = new Error(data.message || 'تعذر تحميل الإشعارات.');
              error.status = response.status;
              throw error;
            }
            return data;
          }));
      }
      function updateCount(count) {
        const total = Number(count) || 0;
        badge.textContent = total > 99 ? '99+' : String(total);
        badge.hidden = total < 1;
        bell.setAttribute('aria-label', total ? 'الإشعارات، غير المقروء ' + total : 'الإشعارات');
      }
      window.addEventListener('efhamha:notifications-updated', (event) => {
        updateCount(event.detail && event.detail.unreadCount);
      });
      function formatTime(timestamp) {
        const seconds = Math.round((Number(timestamp) - Date.now()) / 1000);
        const formatter = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
        if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
        if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
        if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
        return formatter.format(Math.round(seconds / 86400), 'day');
      }
      function renderList(notifications) {
        items.replaceChildren();
        if (!notifications.length) {
          status.textContent = 'لا توجد إشعارات.';
          return;
        }
        status.textContent = '';
        notifications.forEach((notification) => {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'notification-dropdown-item' + (notification.isRead ? '' : ' unread');
          item.setAttribute('aria-label', notification.title + (notification.isRead ? '' : ' — غير مقروء'));
          const title = document.createElement('strong');
          title.textContent = notification.title;
          const message = document.createElement('span');
          message.className = 'notification-preview-message';
          message.textContent = notification.message;
          const meta = document.createElement('span');
          meta.className = 'notification-preview-meta';
          meta.textContent = (categories[notification.category] || 'عام') + ' · ' + formatTime(notification.createdAt)
            + ' · ' + (notification.isRead ? 'مقروء' : 'غير مقروء');
          item.append(title, message, meta);
          item.addEventListener('click', () => {
            const markRead = notification.isRead
              ? Promise.resolve()
              : fetchJson('/api/notifications/' + encodeURIComponent(notification.id) + '/read', 'PATCH')
                  .then((result) => updateCount(result.unreadCount));
            markRead.catch((error) => console.error('Unable to mark notification as read:', error))
              .then(() => window.location.assign(notification.actionUrl || '/notifications.html'));
          });
          items.appendChild(item);
        });
      }
      function update(loadItems) {
        if (inFlight) {
          queuedItems = queuedItems || loadItems;
          return;
        }
        inFlight = true;
        const requests = [fetchJson('/api/notifications/unread-count')];
        if (loadItems) requests.push(fetchJson('/api/notifications?limit=5'));
        Promise.all(requests).then((results) => {
          updateCount(results[0].unreadCount);
          if (loadItems) renderList(results[1].notifications || []);
        }).catch((error) => {
          if (error.status === 401) {
            window.Auth.check().then((currentUser) => {
              if (!currentUser) {
                center.remove();
                const login = document.querySelector('.btn-start');
                if (login) {
                  login.textContent = 'دخول';
                  login.href = '/login.html';
                }
              }
            })
              .catch((checkError) => console.error('Unable to verify notification session:', checkError));
          } else {
            status.replaceChildren();
            const message = document.createElement('span');
            message.textContent = 'تعذر تحميل الإشعارات.';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'notification-retry';
            retry.textContent = 'إعادة المحاولة';
            retry.addEventListener('click', () => update(true), { once: true });
            status.append(message, retry);
            console.error('Unable to update notifications:', error);
          }
        }).finally(() => {
          inFlight = false;
          if (queuedItems) {
            queuedItems = false;
            update(true);
          }
        });
      }

      bell.addEventListener('click', () => {
        const open = panel.hidden;
        panel.hidden = !open;
        bell.setAttribute('aria-expanded', String(open));
        if (open) {
          status.textContent = 'جارٍ التحميل…';
          update(true);
        }
      });
      document.addEventListener('click', (event) => {
        if (!center.contains(event.target)) {
          panel.hidden = true;
          bell.setAttribute('aria-expanded', 'false');
        }
      });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !panel.hidden) {
          panel.hidden = true;
          bell.setAttribute('aria-expanded', 'false');
          bell.focus();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (interval) window.clearInterval(interval);
          interval = null;
        } else if (!interval) {
          update(!panel.hidden);
          interval = window.setInterval(() => update(!panel.hidden), pollingInterval);
        }
      });
      update(false);
      if (!document.hidden) interval = window.setInterval(() => update(!panel.hidden), pollingInterval);
    }).catch((error) => console.error('Unable to verify account for notifications:', error));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountNotificationBell);
  } else {
    mountNotificationBell();
  }
})();
