'use strict';

/**
 * Viết bài Threads bằng Claude. Người dùng chọn mô hình, hoặc để "Tự động":
 * chọn theo độ dài / độ phức tạp của nội dung nhập vào.
 */

// Nạp SDK khi cần: thiếu thư viện thì chỉ tính năng AI báo lỗi, app vẫn chạy
let sdk = null;
function loadSdk() {
  if (!sdk) {
    try {
      sdk = require('@anthropic-ai/sdk');
    } catch {
      throw new Error('Thiếu thư viện @anthropic-ai/sdk — mở thư mục app, chạy "npm install" rồi khởi động lại');
    }
  }
  return sdk;
}

// Có thể đổi ID mô hình bằng biến môi trường (MODEL_OPUS, MODEL_SONNET, MODEL_HAIKU)
// khi Anthropic ra phiên bản mới mà chưa kịp cập nhật app
const MODELS = [
  { id: process.env.MODEL_OPUS || 'claude-opus-5-5', label: 'Claude Opus 5.5', tag: 'Chất lượng cao nhất', effort: 'medium', fallback: true },
  { id: process.env.MODEL_SONNET || 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', tag: 'Cân bằng tốc độ & chất lượng', effort: 'medium', fallback: true },
  // Haiku 5.5 không có fallback phía máy chủ — không gửi tham số fallbacks
  { id: process.env.MODEL_HAIKU || 'claude-haiku-5-5', label: 'Claude Haiku 5.5', tag: 'Nhanh & tiết kiệm', effort: 'low', fallback: false },
];

const TONES = {
  friendly: 'thân thiện, gần gũi như nói chuyện với bạn bè',
  pro: 'chuyên nghiệp, rõ ràng, đáng tin cậy',
  funny: 'hài hước, dí dỏm, bắt trend',
  inspire: 'truyền cảm hứng, tích cực',
  sales: 'bán hàng tinh tế: nêu lợi ích, có lời kêu gọi hành động, không lố',
};

const LENGTHS = {
  short: 'một bài ngắn, 1–3 câu (dưới 200 ký tự)',
  medium: 'một bài vừa phải (200–450 ký tự)',
  thread: 'một chuỗi thread 3–6 phần nối tiếp nhau, phần đầu phải giữ chân người đọc',
};

const LIMIT = 500; // giới hạn ký tự mỗi bài của Threads

/** Chọn mô hình theo nội dung. Trả về { id, reason }. */
function pickModel({ input = '', length = 'medium', styleExamples = 0 } = {}) {
  const n = String(input).trim().length;
  if (length === 'thread' || n > 1500 || styleExamples > 0) {
    const why = length === 'thread' ? 'viết chuỗi thread nhiều phần' : styleExamples > 0 ? 'cần bắt chước giọng văn từ bài mẫu' : 'nội dung nhập vào dài';
    return { id: 'claude-opus-5-5', reason: `Opus 5.5 vì ${why}` };
  }
  if (n < 200 && length === 'short') {
    return { id: process.env.MODEL_HAIKU || 'claude-haiku-5-5', reason: 'Haiku 5.5 vì ý tưởng ngắn, cần bài ngắn — nhanh và rẻ nhất' };
  }
  return { id: process.env.MODEL_SONNET || 'claude-sonnet-5-5', reason: 'Sonnet 5.5 vì nội dung vừa phải — cân bằng chất lượng và tốc độ' };
}

const SCHEMA = {
  type: 'object',
  properties: {
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          angle: { type: 'string', description: 'Góc tiếp cận của phương án, vài chữ' },
          parts: { type: 'array', items: { type: 'string' }, description: 'Các phần của bài; bài đơn chỉ có 1 phần' },
        },
        required: ['angle', 'parts'],
        additionalProperties: false,
      },
    },
  },
  required: ['variants'],
  additionalProperties: false,
};

function buildPrompt({ input, tone, length, lang, hashtags, emoji, examples }) {
  const system = [
    'Bạn là người viết nội dung cho mạng xã hội Threads.',
    `Mỗi phần của bài tối đa ${LIMIT} ký tự (tính cả hashtag và emoji) — đây là giới hạn cứng của Threads.`,
    'Viết tự nhiên như người thật đăng bài, không mở đầu kiểu quảng cáo sáo rỗng, không dùng markdown (Threads không hiển thị markdown).',
    'Trả về đúng 3 phương án với 3 góc tiếp cận khác nhau.',
  ].join(' ');

  const lines = [
    `Ngôn ngữ: ${lang === 'en' ? 'tiếng Anh' : 'tiếng Việt'}.`,
    `Giọng văn: ${TONES[tone] || TONES.friendly}.`,
    `Độ dài: ${LENGTHS[length] || LENGTHS.medium}.`,
    hashtags ? 'Thêm 1–3 hashtag phù hợp ở cuối phần cuối cùng.' : 'Không dùng hashtag.',
    emoji ? 'Có thể dùng emoji vừa phải.' : 'Không dùng emoji.',
  ];
  if (examples && examples.length) {
    lines.push('', 'Bắt chước giọng văn và cách trình bày (không chép nội dung) của các bài mẫu sau:');
    examples.forEach((t, i) => lines.push(`<bai_mau_${i + 1}>\n${t}\n</bai_mau_${i + 1}>`));
  }
  lines.push('', 'Nội dung / ý tưởng cần viết thành bài:', `<noi_dung>\n${input}\n</noi_dung>`);
  return { system, user: lines.join('\n') };
}

/** Kiểm tra JSON trả về, bỏ phần rỗng. Ném lỗi nếu không dùng được. */
function parseVariants(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('AI trả về dữ liệu không đọc được, hãy thử lại');
  }
  const variants = (Array.isArray(data && data.variants) ? data.variants : [])
    .map((v) => ({
      angle: String((v && v.angle) || '').trim(),
      parts: (Array.isArray(v && v.parts) ? v.parts : []).map((p) => String(p).trim()).filter(Boolean),
    }))
    .filter((v) => v.parts.length);
  if (!variants.length) throw new Error('AI không tạo được bài viết nào, hãy thử lại');
  return variants;
}

/** Đổi lỗi SDK thành thông báo tiếng Việt dễ hiểu. */
function explainError(e) {
  const Anthropic = loadSdk();
  if (e instanceof Anthropic.AuthenticationError) return 'API key của Anthropic không hợp lệ — kiểm tra lại trong Cài đặt';
  if (e instanceof Anthropic.PermissionDeniedError) return 'API key không có quyền dùng mô hình này';
  if (e instanceof Anthropic.NotFoundError) return 'Không tìm thấy mô hình — có thể tài khoản chưa được dùng mô hình này';
  if (e instanceof Anthropic.RateLimitError) return 'Đang gửi quá nhanh hoặc hết hạn mức — chờ một lát rồi thử lại';
  if (e instanceof Anthropic.BadRequestError) return `Yêu cầu không hợp lệ: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return 'Không kết nối được tới Anthropic — kiểm tra mạng';
  if (e instanceof Anthropic.APIError) return `Lỗi từ Anthropic (${e.status || '?'}): ${e.message}`;
  if (/auth|api key|apiKey/i.test(e.message || '')) return 'Chưa có API key của Anthropic — thêm trong Cài đặt → AI & Đăng bài';
  return e.message || 'Lỗi không xác định';
}

/**
 * Kiểm tra API key và quyền dùng từng mô hình qua Models API (không tốn token).
 * Trả về [{ id, label, ok, error }].
 */
async function checkModels(apiKey) {
  const Anthropic = loadSdk();
  const client = new Anthropic(apiKey ? { apiKey } : {});
  return Promise.all(MODELS.map(async (m) => {
    try {
      await client.models.retrieve(m.id);
      return { id: m.id, label: m.label, ok: true };
    } catch (e) {
      return { id: m.id, label: m.label, ok: false, error: explainError(e) };
    }
  }));
}

/**
 * Tạo 3 phương án bài viết.
 * opts: { apiKey, input, tone, length, lang, hashtags, emoji, model ('auto' | id), examples: string[] }
 */
async function generate(opts) {
  const input = String(opts.input || '').trim();
  if (!input) throw new Error('Hãy nhập nội dung hoặc ý tưởng');
  if (input.length > 20000) throw new Error('Nội dung quá dài (tối đa 20.000 ký tự)');

  const examples = (opts.examples || []).filter(Boolean).slice(0, 5);
  const auto = !opts.model || opts.model === 'auto';
  const picked = auto ? pickModel({ input, length: opts.length, styleExamples: examples.length }) : null;
  const model = MODELS.find((m) => m.id === (auto ? picked.id : opts.model));
  if (!model) throw new Error('Mô hình không hợp lệ');

  // apiKey rỗng: SDK tự tìm ANTHROPIC_API_KEY / hồ sơ đăng nhập trong môi trường
  const Anthropic = loadSdk();
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const { system, user } = buildPrompt({ ...opts, input, examples });
  const params = {
    model: model.id,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: model.effort, format: { type: 'json_schema', schema: SCHEMA } },
  };

  let res;
  try {
    res = model.fallback
      // Khi bộ lọc an toàn từ chối nhầm, máy chủ tự chạy lại trên mô hình dự phòng phù hợp
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);
  } catch (e) {
    throw new Error(explainError(e));
  }

  if (res.stop_reason === 'refusal') {
    throw new Error('AI từ chối viết nội dung này. Hãy diễn đạt lại ý tưởng của bạn');
  }
  if (res.stop_reason === 'max_tokens') throw new Error('Bài viết bị cắt giữa chừng, hãy thử lại với nội dung ngắn hơn');

  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return {
    variants: parseVariants(text),
    model: res.model || model.id,
    requested: model.id,
    auto,
    reason: picked ? picked.reason : null,
    usage: res.usage ? { input: res.usage.input_tokens, output: res.usage.output_tokens } : null,
  };
}

module.exports = { checkModels, MODELS, TONES, LENGTHS, LIMIT, pickModel, generate, parseVariants, buildPrompt, SCHEMA };
