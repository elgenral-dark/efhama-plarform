(() => {
  const navigationScript = document.currentScript;
  if (navigationScript && !document.querySelector('[data-notifications-script]')) {
    const publicRoot = new URL('../', navigationScript.src);
    if (!document.querySelector('[data-notifications-styles]')) {
      const styles = document.createElement('link');
      styles.rel = 'stylesheet';
      styles.href = new URL('css/notifications.css', publicRoot).href;
      styles.dataset.notificationsStyles = 'true';
      document.head.append(styles);
    }

    const notificationsScript = document.createElement('script');
    notificationsScript.src = new URL('js/notifications.js', publicRoot).href;
    notificationsScript.dataset.notificationsScript = 'true';
    document.head.append(notificationsScript);
  }

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
      if (window.innerWidth > 900) setOpen(false);
    });
  }

  /* ================= الوضع الداكن / الفاتح الموحد ================= */
  function setupTheme() {
    const themeKey = 'efhama_theme';
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
})();
