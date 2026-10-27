'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { harvest, safeParse, parseUsername, parsePostUrl } = require('../src/extract');
const { filterPosts, toCSV } = require('../src/query');
const { parseCookies, parseProxy } = require('../src/scraper');

// Mô phỏng cấu trúc dataset ẩn của Threads (rút gọn)
const FIXTURE = {
  require: [['ScheduledServerJS', 'handle', null, [{
    __bbox: {
      result: {
        data: {
          user: {
            pk: '314216', username: 'zuck', full_name: 'Mark Zuckerberg', biography: 'Mostly superintelligence',
            follower_count: 5300000, is_verified: true, profile_pic_url: 'https://cdn/x.jpg',
            bio_links: [{ url: 'https://meta.com' }],
          },
          mediaData: {
            edges: [{
              node: {
                thread_items: [
                  {
                    post: {
                      pk: '3456_314216', code: 'ABC123', taken_at: 1735689600, like_count: 1200,
                      caption: { text: 'Xin chào #Threads cùng @meta' },
                      user: { username: 'zuck', is_verified: true, profile_pic_url: 'https://cdn/x.jpg' },
                      text_post_app_info: { direct_reply_count: 45, repost_count: 7, quote_count: 2 },
                      carousel_media: [
                        { image_versions2: { candidates: [{ url: 'small', width: 100 }, { url: 'big', width: 1080 }] } },
                        { video_versions: [{ url: 'vid.mp4' }], image_versions2: { candidates: [{ url: 'thumb', width: 640 }] } },
                      ],
                    },
                  },
                  {
                    post: {
                      pk: '999', code: 'REPLY1', taken_at: 1735690000, like_count: 3, caption: null,
                      user: { username: 'someone' },
                      text_post_app_info: { reply_to_author: { username: 'zuck' } },
                    },
                  },
                ],
              },
            }],
          },
        },
      },
    },
  }]]],
};

test('harvest tìm được bài viết và hồ sơ ở bất kỳ độ sâu', () => {
  const { posts, users } = harvest(FIXTURE);
  assert.equal(posts.size, 2);
  const p = posts.get('3456');
  assert.equal(p.code, 'ABC123');
  assert.equal(p.username, 'zuck');
  assert.equal(p.reply_count, 45);
  assert.equal(p.repost_count, 7);
  assert.deepEqual(p.hashtags, ['threads']);
  assert.deepEqual(p.mentions, ['meta']);
  assert.equal(p.media.length, 2);
  assert.equal(p.media[0].url, 'big');
  assert.equal(p.media[1].type, 'video');
  assert.equal(p.published_at, '2025-01-01T00:00:00.000Z');
  assert.equal(p.url, 'https://www.threads.com/@zuck/post/ABC123');

  const r = posts.get('999');
  assert.equal(r.is_reply, true);
  assert.equal(r.reply_to, 'zuck');
  assert.equal(r.text, '');

  const u = users.get('zuck');
  assert.equal(u.follower_count, 5300000);
  assert.deepEqual(u.links, ['https://meta.com']);
});

test('safeParse xử lý tiền tố for(;;); và JSON nhiều dòng', () => {
  assert.deepEqual(safeParse('for (;;);{"a":1}'), { a: 1 });
  assert.deepEqual(safeParse('{"a":1}\n{"b":2}'), [{ a: 1 }, { b: 2 }]);
  assert.equal(safeParse('<html>'), null);
});

test('parseUsername / parsePostUrl', () => {
  assert.equal(parseUsername('@Zuck'), 'zuck');
  assert.equal(parseUsername('https://www.threads.net/@zuck?x=1'), 'zuck');
  assert.equal(parseUsername('có dấu cách'), null);
  assert.deepEqual(parsePostUrl('https://www.threads.net/@zuck/post/ABC-12_x?xmt=1'), {
    username: 'zuck', code: 'ABC-12_x', url: 'https://www.threads.com/@zuck/post/ABC-12_x',
  });
  assert.equal(parsePostUrl('https://www.threads.com/@zuck'), null);
});

test('filterPosts lọc không dấu, theo media và sắp xếp', () => {
  const posts = [...harvest(FIXTURE).posts.values()];
  assert.equal(filterPosts(posts, { q: 'xin chao' }).length, 1);
  assert.equal(filterPosts(posts, { media: 'with' }).length, 1);
  assert.equal(filterPosts(posts, { replies: 'exclude' }).length, 1);
  assert.equal(filterPosts(posts, { sort: 'likes' })[0].code, 'ABC123');
  assert.equal(filterPosts(posts, { ids: '999' })[0].code, 'REPLY1');
});

test('toCSV có BOM và escape đúng', () => {
  const csv = toCSV([{ text: 'a, "b"\nc', media: [{ url: 'u1' }, { url: 'u2' }], verified: true }], 'posts');
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"a, ""b""\nc"'));
  assert.ok(csv.includes('u1 | u2'));
});

test('parseCookies / parseProxy', () => {
  const c = parseCookies('sessionid=abc; csrftoken=x=y');
  assert.equal(c.length, 2);
  assert.equal(c[1].value, 'x=y');
  assert.equal(parseCookies('[{"name":"a","value":"1","domain":".threads.net"}]')[0].domain, '.threads.net');
  assert.deepEqual(parseProxy('user:p%40ss@1.2.3.4:8080'), { server: 'http://1.2.3.4:8080', username: 'user', password: 'p@ss' });
});
