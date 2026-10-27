'use strict';

/** API — Tổng quan: thống kê, biểu đồ, giờ vàng. */

const { publicJob } = require('../jobs');
const { engagement, goldenHours } = require('../query');
const { wrap } = require('./util');

module.exports = function register(app, { store, jobs }) {
  /* ---------- Tổng quan ---------- */
  app.get('/api/stats', wrap((req) => {
    const posts = store.listPosts();
    const profiles = store.listProfiles();
    const allJobs = store.data.jobs;

    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today - i * 864e5);
      days.push({ date: d.toISOString().slice(0, 10), count: 0, _t: d.getTime() });
    }
    // Bản đồ giờ đăng: 7 ngày × 8 khung 3 giờ, theo múi giờ của người xem
    const tz = Number(req.query.tz) || 0; // phút, giống Date#getTimezoneOffset()
    const roots = [];
    const tags = new Map();
    const authors = new Map();
    let likes = 0;
    let replies = 0;
    for (const p of posts) {
      likes += p.like_count;
      replies += p.reply_count;
      if (p.published_at) {
        const t = new Date(p.published_at);
        t.setHours(0, 0, 0, 0);
        const slot = days.find((d) => d._t === t.getTime());
        if (slot) slot.count++;
      }
      if (p.published_at && !p.parent_code) {
        const local = new Date(Date.parse(p.published_at) - tz * 60000);
        roots.push({ d: (local.getUTCDay() + 6) % 7, b: Math.floor(local.getUTCHours() / 3), e: engagement(p), user: p.username });
      }
      for (const h of p.hashtags || []) tags.set(h, (tags.get(h) || 0) + 1);
      const a = authors.get(p.username) || { username: p.username, full_name: p.full_name, avatar: p.avatar, verified: p.verified, posts: 0, engagement: 0 };
      a.posts++;
      a.engagement += engagement(p);
      authors.set(p.username, a);
    }

    return {
      totals: {
        posts: posts.length,
        profiles: profiles.length,
        likes,
        replies,
        media: posts.filter((p) => p.media && p.media.length).length,
        jobs: allJobs.length,
        running: allJobs.filter((j) => j.status === 'running').length,
        queued: allJobs.filter((j) => j.status === 'queued').length,
        failed: allJobs.filter((j) => j.status === 'failed').length,
      },
      daily: days.map(({ _t, ...d }) => d),
      ...goldenHours(roots),
      topAuthors: [...authors.values()].sort((a, b) => b.engagement - a.engagement).slice(0, 5),
      topTags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
      topPosts: [...posts].sort((a, b) => engagement(b) - engagement(a)).slice(0, 3),
      recentJobs: allJobs.slice(0, 5).map(publicJob),
    };
  }));
};
