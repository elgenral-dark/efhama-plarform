((root, factory) => {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    const config = root.EfhamaGamificationConfig;
    const notifications = [];
    let notificationTimer = null;
    root.EfhamaGamification = api.create(root.localStorage, config, (message, kind) => {
      if (!root.document?.body) return;
      let toast = root.document.querySelector("[data-gamification-toast]");
      if (!toast) {
        toast = root.document.createElement("div");
        toast.className = "gamification-toast";
        toast.dataset.gamificationToast = "";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        root.document.body.append(toast);
      }
      notifications.push({ message, kind });
      if (notificationTimer) return;
      const showNext = () => {
        const next = notifications.shift();
        if (!next) {
          toast.classList.remove("is-visible");
          notificationTimer = null;
          return;
        }
        toast.textContent = next.message;
        toast.dataset.kind = next.kind;
        toast.classList.add("is-visible");
        notificationTimer = setTimeout(() => {
          toast.classList.remove("is-visible");
          notificationTimer = setTimeout(showNext, 220);
        }, 3200);
      };
      showNext();
    });
  }
})(typeof window === "undefined" ? null : window, () => {
  const STORAGE_KEY = "efhama_gamification_v1";
  const DEFAULT_CONFIG = {
    xp: { lesson: 10, challenge: 25, assessment: 40, project: 60, unit: 25 },
    levels: [
      { id: "beginner", title: "Beginner", minimumXp: 0 },
      { id: "learner", title: "Learner", minimumXp: 100 },
      { id: "coder", title: "Coder", minimumXp: 300 },
      { id: "developer", title: "Developer", minimumXp: 650 },
      { id: "advanced-developer", title: "Advanced Developer", minimumXp: 1000 }
    ],
    badges: []
  };
  const DAY_MS = 86400000;
  const validTypes = new Set(["lesson", "challenge", "assessment", "project", "unit"]);

  const localDate = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const dayNumber = (day) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS : NaN;
  };
  const emptyState = () => ({ version: 1, rewards: {}, badges: {}, activityDays: [] });

  const create = (storage, suppliedConfig = {}, notify = () => {}) => {
    let storageWarning = "";
    const config = {
      ...DEFAULT_CONFIG,
      ...suppliedConfig,
      xp: { ...DEFAULT_CONFIG.xp, ...(suppliedConfig.xp || {}) },
      levels: Array.isArray(suppliedConfig.levels) && suppliedConfig.levels.length
        ? suppliedConfig.levels.slice().sort((a, b) => a.minimumXp - b.minimumXp)
        : DEFAULT_CONFIG.levels,
      badges: Array.isArray(suppliedConfig.badges) ? suppliedConfig.badges : DEFAULT_CONFIG.badges
    };

    const read = () => {
      let raw;
      try {
        raw = storage.getItem(STORAGE_KEY);
        const value = JSON.parse(raw || "null");
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          if (raw) {
            storageWarning = "تعذر فهم سجل الإنجازات السابق؛ احتُفظ بنسخة منه قبل بدء سجل جديد.";
            storage.setItem(`${STORAGE_KEY}_backup`, raw);
          }
          return emptyState();
        }
        return {
          version: 1,
          rewards: value.rewards && typeof value.rewards === "object" && !Array.isArray(value.rewards) ? value.rewards : {},
          badges: value.badges && typeof value.badges === "object" && !Array.isArray(value.badges) ? value.badges : {},
          activityDays: Array.isArray(value.activityDays) ? [...new Set(value.activityDays.filter((day) => Number.isFinite(dayNumber(day))))].sort() : []
        };
      } catch (error) {
        console.error("Unable to read gamification progress:", error);
        storageWarning = "تعذر قراءة سجل الإنجازات. احتفظ المتصفح بخطأ القراءة في سجل المطور.";
        if (typeof raw === "string" && raw) {
          try { storage.setItem(`${STORAGE_KEY}_backup`, raw); }
          catch (backupError) { console.error("Unable to preserve the unreadable gamification record:", backupError); }
        }
        return emptyState();
      }
    };
    const write = (state) => {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
          window.dispatchEvent(new CustomEvent("efhama-gamification-update"));
        }
        return true;
      } catch (error) {
        console.error("Unable to save gamification progress:", error);
        storageWarning = "تعذر حفظ الإنجاز في مساحة تخزين المتصفح. لم تُحتسب المكافأة.";
        notify(storageWarning, "warning");
        return false;
      }
    };
    const levelFor = (xp) => config.levels.reduce((current, level) => xp >= level.minimumXp ? level : current, config.levels[0]);
    const totalXp = (state) => Object.values(state.rewards).reduce((sum, reward) =>
      sum + (reward && Number.isFinite(reward.xp) && reward.xp > 0 ? reward.xp : 0), 0);
    const streakFor = (days, timestamp = Date.now()) => {
      const sorted = [...new Set(days)].sort((a, b) => dayNumber(a) - dayNumber(b));
      let best = 0;
      let run = 0;
      let previous = NaN;
      for (const day of sorted) {
        const current = dayNumber(day);
        run = current - previous === 1 ? run + 1 : 1;
        best = Math.max(best, run);
        previous = current;
      }
      const today = dayNumber(localDate(timestamp));
      const last = sorted.length ? dayNumber(sorted[sorted.length - 1]) : NaN;
      const difference = today - last;
      const current = difference >= 0 && difference <= 1 ? run : 0;
      return { current, best };
    };
    const unlockBadge = (id, timestamp = Date.now(), silent = false) => {
      const badge = config.badges.find((item) => item.id === id);
      if (!badge) return false;
      const state = read();
      if (state.badges[id]) return false;
      state.badges[id] = timestamp;
      if (!write(state)) return false;
      if (!silent) notify(`شارة جديدة: ${badge.title} — ${badge.description}`, "badge");
      return true;
    };
    const recordActivity = (type, id, options = {}) => {
      if (!validTypes.has(type) || typeof id !== "string" || !/^[\w:.-]{1,160}$/.test(id)) {
        throw new TypeError("نوع أو معرّف نشاط Gamification غير صالح.");
      }
      const state = read();
      const timestamp = Number.isFinite(options.timestamp) ? options.timestamp : Date.now();
      const rewardId = `${type}:${id}`;
      const isNew = !state.rewards[rewardId];
      let levelChanged = false;
      let changed = false;
      if (isNew) {
        const before = levelFor(totalXp(state));
        const points = config.xp[type];
        if (!Number.isFinite(points) || points < 0) throw new TypeError(`إعداد XP غير صالح للنشاط ${type}.`);
        state.rewards[rewardId] = { type, id, xp: Math.floor(points), earnedAt: timestamp };
        levelChanged = levelFor(totalXp(state)).id !== before.id;
        changed = true;
      }
      if (isNew && options.streak !== false) {
        state.activityDays = [...new Set([...state.activityDays, localDate(timestamp)])].sort();
        changed = true;
      }
      if (changed && !write(state)) {
        return { awarded: false, xp: 0, totalXp: totalXp(read()), level: levelFor(totalXp(read())), streak: streakFor(read().activityDays, timestamp), saveFailed: true };
      }
      if (isNew) {
        const countType = (activityType) => Object.values(state.rewards).filter((reward) => reward?.type === activityType).length;
        const eligibleBadges = [];
        if (type === "lesson" && countType("lesson") === 1) eligibleBadges.push("first-lesson");
        if (type === "challenge" && countType("challenge") === 1) eligibleBadges.push("first-challenge");
        if (type === "project" && countType("project") === 1) eligibleBadges.push("project-builder");
        if (options.streak !== false && streakFor(state.activityDays, timestamp).best >= 7) eligibleBadges.push("consistent-learner");
        for (const badgeId of eligibleBadges) unlockBadge(badgeId, timestamp, options.silent);
      }
      if (isNew && !options.silent) {
        const points = state.rewards[rewardId].xp;
        if (points) notify(`أُضيفت ${points} XP لإتمام نشاط تعليمي.`, "xp");
        if (levelChanged) notify(`مستوى جديد: ${levelFor(totalXp(state)).title}!`, "level");
      }
      return { awarded: isNew, xp: isNew ? state.rewards[rewardId].xp : 0, totalXp: totalXp(state), level: levelFor(totalXp(state)), streak: streakFor(state.activityDays, timestamp) };
    };
    const snapshot = (timestamp = Date.now()) => {
      const state = read();
      const xp = totalXp(state);
      const level = levelFor(xp);
      const next = config.levels[config.levels.indexOf(level) + 1] || null;
      return {
        xp,
        level,
        nextLevel: next,
        levelProgress: next ? Math.min(100, Math.round((xp - level.minimumXp) / (next.minimumXp - level.minimumXp) * 100)) : 100,
        rewards: state.rewards,
        badges: state.badges,
        streak: streakFor(state.activityDays, timestamp)
      };
    };
    return Object.freeze({ recordActivity, unlockBadge, snapshot, getState: read, getWarning: () => storageWarning, config, STORAGE_KEY });
  };
  return { create, STORAGE_KEY, localDate, streakFor: (days, timestamp) => {
    const current = create({ getItem: () => JSON.stringify({ rewards: {}, badges: {}, activityDays: days }), setItem: () => {} });
    return current.snapshot(timestamp).streak;
  } };
});
