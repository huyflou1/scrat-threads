'use strict';

/**
 * Quyết định thông báo khi một tác vụ của lịch tự động kết thúc.
 * Chỉ báo khi có bài MỚI từ lượt thứ hai trở đi (lượt đầu thì mọi bài đều "mới"),
 * hoặc khi lịch bị lỗi.
 */

function linkFor(job) {
  const i = job.input || {};
  if (job.type === 'profile') return `#/library?username=${encodeURIComponent(i.username)}`;
  if (job.type === 'post') return `#/library?source=${encodeURIComponent('post:' + i.code)}`;
  if (job.type === 'search') return `#/library?source=${encodeURIComponent('search:' + i.query)}`;
  return '#/library';
}

/** Trả về object thông báo hoặc null. `getPost(id)` để lấy nội dung bài mới. */
function scheduleNotification(job, schedule, getPost) {
  if (!schedule) return null;
  if (job.status === 'failed') {
    return {
      kind: 'error',
      title: `Lịch ${schedule.label} bị lỗi`,
      body: job.error || 'Không rõ nguyên nhân',
      link: '#/jobs?tab=schedules',
    };
  }
  const n = job.stats.new_posts;
  if (job.status !== 'done' || !n || (schedule.runs || 0) <= 1) return null;
  const posts = (job._newIds || []).map(getPost).filter(Boolean)
    .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0));
  const first = posts.find((p) => p.text) || posts[0];
  return {
    kind: 'new',
    title: `${schedule.label} có ${n} bài mới`,
    body: first ? `${first.username ? '@' + first.username + ': ' : ''}${(first.text || '(ảnh/video)').slice(0, 140)}` : '',
    link: linkFor(job),
    count: n,
  };
}

module.exports = { scheduleNotification, linkFor };
