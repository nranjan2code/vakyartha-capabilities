// Original code-native artwork embedded as passive images. No remote requests
// or generated media are needed to give the starter library a visual identity.
export function cover(topic: string): string {
  const themes = [['#192e3c','#70dec3','#f6ce79'],['#302342','#bfafff','#ffb69c'],['#172c49','#89caff','#f7dc8b']];
  const key = [...topic].reduce((n,c)=>n+c.charCodeAt(0),0), [bg,a,b]=themes[key%themes.length]!;
  const shapes = /space|moon|astronom/i.test(topic)
    ? `<ellipse cx="160" cy="120" rx="115" ry="48" transform="rotate(-24 160 120)" stroke="${a}" stroke-width="2" fill="none" opacity=".5"/><circle cx="160" cy="120" r="57" fill="${b}"/><path d="M160 63a57 57 0 0 0 0 114c-28-18-28-96 0-114" fill="${bg}"/><circle cx="244" cy="72" r="10" fill="${a}"/><circle cx="63" cy="66" r="4" fill="${b}"/>`
    : /news|media|information/i.test(topic)
      ? `<rect x="81" y="48" width="142" height="152" rx="12" fill="${a}" opacity=".2" transform="rotate(-9 152 124)"/><rect x="91" y="39" width="142" height="152" rx="12" fill="${a}"/><rect x="109" y="60" width="104" height="14" rx="4" fill="${bg}"/><path d="M109 93h104m-104 15h77m-77 27h104m-104 15h70" stroke="${bg}" stroke-width="6" opacity=".7"/><circle cx="230" cy="177" r="26" fill="${b}"/><path d="m219 177 8 8 15-18" fill="none" stroke="${bg}" stroke-width="5" stroke-linecap="round"/>`
      : `<g transform="translate(100 60)"><rect width="54" height="54" rx="12" fill="${a}"/><rect x="66" width="54" height="54" rx="12" fill="${a}" opacity=".22"/><rect y="66" width="54" height="54" rx="12" fill="${a}" opacity=".22"/><rect x="66" y="66" width="54" height="54" rx="27" fill="${b}"/></g>`;
  return `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" rx="18" fill="${bg}"/><g fill="none" stroke="${a}" opacity=".16"><circle cx="160" cy="120" r="82"/><circle cx="160" cy="120" r="104"/></g>${shapes}<circle cx="272" cy="40" r="4" fill="${b}"/><circle cx="48" cy="191" r="3" fill="${a}"/></svg>`).toString('base64')}`;
}
