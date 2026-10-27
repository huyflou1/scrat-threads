'use strict';

/** Sinh dữ liệu mẫu để xem thử giao diện khi chưa cào thật. */

const USERS = [
  ['meocon.code', 'Mèo Con Code', 'Lập trình viên mê mèo 🐱 · chia sẻ mẹo JS mỗi ngày', 48200, true],
  ['banhmi.daily', 'Bánh Mì Daily', 'Ăn gì hôm nay? 🥖 Review quán ngon Sài Gòn', 125000, true],
  ['hanoi.mua.thu', 'Hà Nội Mùa Thu', 'Ảnh & chữ về Hà Nội 🍂', 9300, false],
  ['startup.viet', 'Startup Việt', 'Tin khởi nghiệp, gọi vốn, sản phẩm mới 🚀', 67800, true],
  ['soc.scrat', 'Sóc Scrat', 'Chuyên gia săn hạt dẻ 🌰', 3100, false],
];

const TEXTS = [
  'Mẹo nhỏ: dùng structuredClone() thay cho JSON.parse(JSON.stringify()) để copy object sâu nhé #javascript #tips',
  'Sáng nay thử quán bánh mì mới ở Quận 3, pate đậm vị, giá 25k 😋 #banhmi #saigon',
  'Hà Nội vào thu rồi, hoa sữa nồng nàn khắp phố 🍂 #hanoi #mùathu',
  'Startup AI Việt vừa gọi vốn thành công vòng seed 2 triệu USD 👏 #startup #ai',
  'Ai còn nhớ hạt dẻ cuối cùng của mùa đông không? 🌰 #scrat',
  'Thread này tổng hợp 10 extension VS Code mình dùng mỗi ngày 👇 #vscode #devtools',
  'Cà phê muối Huế có gì mà gây sốt vậy mọi người? ☕ #caphe',
  'Chia sẻ lộ trình học frontend 2026 cho người mới bắt đầu #frontend #roadmap',
  'Cuối tuần đi đâu chơi gần Hà Nội? Gợi ý mình với 🏕️ #cuoituan',
  'Product Hunt hôm nay có 3 sản phẩm Việt lọt top 10 🎉 #producthunt',
];

function seedDemo(store, count = 60) {
  const now = Date.now();
  const profiles = USERS.map(([username, full_name, bio, follower_count, verified]) => ({
    id: username,
    username,
    full_name,
    bio,
    avatar: null,
    verified,
    private: false,
    follower_count,
    following_count: null,
    links: [],
    url: `https://www.threads.com/@${username}`,
  }));
  const posts = [];
  for (let i = 0; i < count; i++) {
    const u = profiles[i % profiles.length];
    const text = TEXTS[(i * 7) % TEXTS.length];
    const code = 'DEMO' + (1000 + i).toString(36).toUpperCase();
    const like = Math.round(Math.random() ** 2 * u.follower_count * 0.05);
    posts.push({
      id: `demo${i}`,
      code,
      url: `https://www.threads.com/@${u.username}/post/${code}`,
      username: u.username,
      full_name: u.full_name,
      avatar: null,
      verified: u.verified,
      text,
      published_at: new Date(now - Math.random() * 14 * 864e5).toISOString(),
      like_count: like,
      reply_count: Math.round(like * (0.05 + Math.random() * 0.1)),
      repost_count: Math.round(like * Math.random() * 0.05),
      quote_count: Math.round(like * Math.random() * 0.02),
      reshare_count: 0,
      media: [],
      link: null,
      hashtags: [...text.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase()),
      mentions: [],
      reply_to: null,
      quoted_code: null,
      is_reply: false,
    });
  }
  store.upsertProfiles(profiles);
  store.upsertPosts(posts, { source: 'demo' });
  return { posts: posts.length, profiles: profiles.length };
}

module.exports = { seedDemo };
