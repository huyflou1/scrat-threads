/* Bộ icon duotone bo tròn, vẽ tay cho Scrat Thread by HuyFlou.
 * Đường nét = stroke currentColor; phần "class=d" là lớp tô nhạt (duotone). */
(() => {
  const I = {
    home: '<path class=d d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/><path d="M10 20.5V16a2 2 0 0 1 4 0v4.5"/>',
    wand: '<path class=d d="m14.5 6.5 3 3L8 19l-3-3z"/><path d="m14.5 6.5 3 3L7.5 19.5a1.4 1.4 0 0 1-2 0l-1-1a1.4 1.4 0 0 1 0-2z"/><path d="m12.5 8.5 3 3"/><path d="M19 2.5v3M17.5 4h3M20 11v2M19 12h2M10 2.5v2M9 3.5h2"/>',
    user: '<circle class=d cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="4"/><path class=d d="M4.5 20c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6z"/><path d="M4.5 20c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6"/>',
    users: '<circle class=d cx="9" cy="8.5" r="3.5"/><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c.6-3.2 3.3-5.5 6.5-5.5s5.9 2.3 6.5 5.5"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.4c1.9.8 3.2 2.7 3.5 5.1"/>',
    chat: '<path class=d d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
    search: '<circle class=d cx="10.5" cy="10.5" r="6.5"/><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7.8 8.6a3.2 3.2 0 0 1 2.4-1.4"/>',
    stack: '<path class=d d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16 8.5 4.5 8.5-4.5"/>',
    timer: '<circle class=d cx="12" cy="13" r="7.5"/><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M9.5 2.5h5M12 2.5v3M18.5 5.5l1.5 1.5"/>',
    box: '<path class=d d="M4 9h16v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 9h16v9.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><rect x="2.5" y="4.5" width="19" height="4.5" rx="1.5"/><path d="M10 13h4"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class=d cx="15" cy="7" r="2.5"/><circle cx="15" cy="7" r="2.5"/><circle class=d cx="9" cy="17" r="2.5"/><circle cx="9" cy="17" r="2.5"/>',
    heart: '<path class=d d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
    reply: '<path class=d d="M12 4a8 8 0 1 1-3.6 15.2L4 20l.9-4.2A8 8 0 0 1 12 4z"/><path d="M12 4a8 8 0 1 1-3.6 15.2L4 20l.9-4.2A8 8 0 0 1 12 4z"/>',
    repost: '<path d="M17 3.5 20 6.5l-3 3"/><path d="M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3"/><path d="M20 12.5v1a4 4 0 0 1-4 4H4"/>',
    quote: '<path class=d d="M4.5 12.5v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2zM13.5 12.5v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2z"/><path d="M4.5 12.5v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2zm0 0c0 3 1.5 5 4 6M13.5 12.5v-5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2zm0 0c0 3 1.5 5 4 6"/>',
    download: '<path class=d d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15z"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15M12 3.5v11M7.5 10.5 12 15l4.5-4.5"/>',
    trash: '<path class=d d="M6 7h12l-.8 12a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9z"/><path d="M6 7h12l-.8 12a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9zM4 7h16M9.5 7V4.5h5V7M10 11v6M14 11v6"/>',
    play: '<path class=d d="M7 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.8l-11-6.8A1 1 0 0 0 7 5.2z"/><path d="M7 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.8l-11-6.8A1 1 0 0 0 7 5.2z"/>',
    stop: '<rect class=d x="5.5" y="5.5" width="13" height="13" rx="3"/><rect x="5.5" y="5.5" width="13" height="13" rx="3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.6L20 15.5M20 20v-4.5h-4.5"/>',
    external: '<path class=d d="M5 7.5A2.5 2.5 0 0 1 7.5 5H11v14H7.5A2.5 2.5 0 0 1 5 16.5z"/><path d="M11 5H7.5A2.5 2.5 0 0 0 5 7.5v9A2.5 2.5 0 0 0 7.5 19h9a2.5 2.5 0 0 0 2.5-2.5V13M14 4h6v6M20 4l-8.5 8.5"/>',
    copy: '<rect class=d x="8.5" y="8.5" width="12" height="12" rx="2.5"/><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    moon: '<path class=d d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
    sun: '<circle class=d cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    filter: '<path class=d d="M4 5h16l-6 7.5v5l-4 2v-7z"/><path d="M4 5h16l-6 7.5v5l-4 2v-7z"/>',
    grid: '<rect class=d x="4" y="4" width="7" height="7" rx="2"/><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect class=d x="13" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    rows: '<rect class=d x="4" y="4.5" width="16" height="4" rx="1.5"/><rect x="4" y="4.5" width="16" height="4" rx="1.5"/><path d="M4 12.5h16M4 17h16"/>',
    image: '<rect class=d x="3.5" y="4.5" width="17" height="15" rx="3"/><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 4.5-4 3.5 3 3-2.5 5 4"/>',
    video: '<rect class=d x="3" y="6" width="13" height="12" rx="3"/><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10.5 5-3v9l-5-3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    calendar: '<rect class=d x="4" y="5.5" width="16" height="14.5" rx="3"/><rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    badge: '<path class=d d="m12 2.8 2.3 1.7 2.9-.1.9 2.7 2.3 1.7-.9 2.7.9 2.7-2.3 1.7-.9 2.7-2.9-.1L12 21.2l-2.3-1.7-2.9.1-.9-2.7-2.3-1.7.9-2.7-.9-2.7 2.3-1.7.9-2.7 2.9.1z"/><path d="m8.5 12 2.3 2.3 4.7-4.6"/>',
    cookie: '<path class=d d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5 2.5 2.5 0 0 0 2 2z"/><path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 3.5 3.5 3 3 0 0 0 3.5 3.5 2.5 2.5 0 0 0 2 2z"/><path d="M8.5 9.5h.01M8 14.5h.01M12.5 16.5h.01M12 12h.01"/>',
    shield: '<path class=d d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M12 3.5 19 6v5.5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    gauge: '<path class=d d="M3.5 16a8.5 8.5 0 1 1 17 0z"/><path d="M3.5 16a8.5 8.5 0 1 1 17 0zM12 16l3.5-5"/><circle cx="12" cy="16" r="1.3"/>',
    bolt: '<path class=d d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/><path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/>',
    chart: '<rect class=d x="4" y="12" width="4" height="8" rx="1.5"/><rect x="4" y="12" width="4" height="8" rx="1.5"/><rect class=d x="10" y="7" width="4" height="13" rx="1.5"/><rect x="10" y="7" width="4" height="13" rx="1.5"/><rect x="16" y="3.5" width="4" height="16.5" rx="1.5"/>',
    hash: '<path d="M9.5 3.5 7.5 20.5M16.5 3.5l-2 17M4.5 8.5h16M3.5 15.5h16"/>',
    eye: '<path class=d d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    globe: '<circle class=d cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5z"/>',
    chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
    down: '<path d="m5.5 9 6.5 6.5L18.5 9"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    command: '<rect class=d x="3.5" y="5" width="17" height="14" rx="3"/><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m7.5 10 2.5 2-2.5 2M12.5 14.5h4"/>',
    info: '<circle class=d cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
    warn: '<path class=d d="M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z"/><path d="M10.3 4.3a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3zM12 9.5v4M12 17h.01"/>',
    party: '<path class=d d="M4 20 8.5 8l7.5 7.5z"/><path d="M4 20 8.5 8l7.5 7.5zM13.5 5.5c.5-1.5 1.8-2 3-2M17 9.5c1.5-.8 3-.3 3.5.7M14.5 2.5v.01M20.5 6.5v.01M19.5 13.5v.01"/>',
    bell: '<path class=d d="M6 10.5a6 6 0 1 1 12 0c0 3.8 1.3 5.7 2.5 6.8h-17C4.7 16.2 6 14.3 6 10.5z"/><path d="M6 10.5a6 6 0 1 1 12 0c0 3.8 1.3 5.7 2.5 6.8h-17C4.7 16.2 6 14.3 6 10.5zM9.8 20.3a2.4 2.4 0 0 0 4.4 0M12 2.5v1.5"/>',
    sheet: '<rect class=d x="3.5" y="3.5" width="17" height="17" rx="3"/><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9h17M3.5 14.5h17M9.5 9v11.5"/>',
    code: '<path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15"/>',
    keyboard: '<rect class=d x="2.5" y="6" width="19" height="12" rx="3"/><rect x="2.5" y="6" width="19" height="12" rx="3"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.5h8"/>',
  };

  // Linh vật: hạt dẻ (acorn) mặt cười — nhắc tới chú sóc Scrat
  const ACORN = `
    <symbol id="i-acorn" viewBox="0 0 64 64">
      <path d="M33 15c.5-4 2.5-7 6-8.5" fill="none" stroke="#7A4A2E" stroke-width="4" stroke-linecap="round"/>
      <path d="M13 30c0 15 8.5 27 19 27s19-12 19-27z" fill="#F6B470"/>
      <path d="M41 33c0 12-4 20-9 23 9-1 16-11 17.5-23z" fill="#E59A52"/>
      <path d="M9 30.5C9 21 19.3 14 32 14s23 7 23 16.5c0 2.2-1.6 3.5-3.6 3.5H12.6C10.6 34 9 32.7 9 30.5z" fill="#8E5B3B"/>
      <path d="M17 22.5h.01M25 19h.01M33 18h.01M41 19.5h.01M48 23h.01M21 27.5h.01M29 24.5h.01M37 24.5h.01M45 28h.01" stroke="#B57E56" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="25" cy="42" r="3" fill="#3B2A20"/><circle cx="39" cy="42" r="3" fill="#3B2A20"/>
      <circle cx="26" cy="41" r="1" fill="#fff"/><circle cx="40" cy="41" r="1" fill="#fff"/>
      <ellipse cx="20.5" cy="47" rx="3.2" ry="2" fill="#FF8FA3" opacity=".75"/><ellipse cx="43.5" cy="47" rx="3.2" ry="2" fill="#FF8FA3" opacity=".75"/>
      <path d="M29 46.5q3 3 6 0" fill="none" stroke="#3B2A20" stroke-width="2.2" stroke-linecap="round"/>
    </symbol>`;

  const symbols = Object.entries(I).map(([name, body]) =>
    `<symbol id="i-${name}" viewBox="0 0 24 24">${body.replace(/class=d/g, 'fill="currentColor" opacity=".22" stroke="none"')}</symbol>`,
  ).join('');

  const holder = document.createElement('div');
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${symbols}${ACORN}</svg>`;
  document.body.prepend(holder.firstChild);

  window.ic = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
})();
