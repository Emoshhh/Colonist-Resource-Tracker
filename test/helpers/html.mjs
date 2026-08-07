/**
 * Testler için minik HTML ayrıştırıcı.
 *
 * Node'da DOM yok; ama gerçek sayfadan kopyalanmış outerHTML'i elle taklit
 * etmek yerine olduğu gibi kullanabilmek çok daha güvenli. Bu ayrıştırıcı
 * yalnızca eklentinin DOM'dan istediği yüzeyi üretir:
 *   nodeType, tagName, className, childNodes, children,
 *   getAttribute(), textContent, querySelector() (basit seçiciler)
 */

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;

function parseAttrs(raw) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw))) {
    const value = m[2] === undefined ? '' : m[2].replace(/^["']|["']$/g, '');
    attrs[m[1].toLowerCase()] = value;
  }
  return attrs;
}

function decode(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function textNode(value) {
  return { nodeType: 3, nodeValue: value, childNodes: [] };
}

/** `style="color:#fff;font-weight:600"` -> `{ color: '#fff', fontWeight: '600' }` */
function parseStyle(raw) {
  const out = {};
  for (const decl of String(raw || '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const key = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key) out[key] = decl.slice(i + 1).trim();
  }
  return out;
}

function makeElement(tag, attrs) {
  const children = [];
  const node = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    attrs,
    className: attrs.class || '',
    style: parseStyle(attrs.style),
    childNodes: children,
    getAttribute: (key) => {
      const k = String(key).toLowerCase();
      return k in attrs ? attrs[k] : null;
    },
    querySelector: (sel) => querySelector(node, sel),
    querySelectorAll: (sel) => queryAll(node, sel),
  };
  Object.defineProperty(node, 'children', {
    get: () => children.filter((c) => c.nodeType === 1),
  });
  Object.defineProperty(node, 'textContent', {
    get() {
      const walk = (n) => (n.nodeType === 3 ? n.nodeValue : (n.childNodes || []).map(walk).join(''));
      return children.map(walk).join('');
    },
  });
  Object.defineProperty(node, 'outerHTML', {
    get: () => serialize(node),
  });
  return node;
}

function serialize(node) {
  if (node.nodeType === 3) return node.nodeValue;
  const attrs = Object.entries(node.attrs || {})
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const tag = node.tagName.toLowerCase();
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${(node.childNodes || []).map(serialize).join('')}</${tag}>`;
}

/** Desteklenen seçiciler: `tag`, `.class`, `[attr]`, `[attr="value"]`, `[class*="parça"]` */
function matcher(sel) {
  const s = sel.trim();
  let m = s.match(/^\[([-a-zA-Z0-9_:.]+)(?:([*^$|~]?)=("[^"]*"|'[^']*'|[^\]]+))?\]$/);
  if (m) {
    const name = m[1].toLowerCase();
    const op = m[2];
    const value = m[3] === undefined ? null : m[3].replace(/^["']|["']$/g, '');
    return (el) => {
      const actual = el.getAttribute(name);
      if (actual === null) return false;
      if (value === null) return true;
      if (op === '*') return actual.includes(value);
      if (op === '^') return actual.startsWith(value);
      if (op === '$') return actual.endsWith(value);
      return actual === value;
    };
  }
  m = s.match(/^\.([-a-zA-Z0-9_]+)$/);
  if (m) return (el) => String(el.className || '').split(/\s+/).includes(m[1]);
  return (el) => el.tagName === s.toUpperCase();
}

function walkElements(el, fn) {
  for (const child of el.childNodes || []) {
    if (child.nodeType !== 1) continue;
    if (fn(child) === false) return false;
    if (walkElements(child, fn) === false) return false;
  }
  return true;
}

export function querySelector(root, sel) {
  const test = matcher(sel);
  let hit = null;
  walkElements(root, (el) => {
    if (test(el)) {
      hit = el;
      return false;
    }
    return true;
  });
  return hit;
}

export function queryAll(root, sel) {
  const test = matcher(sel);
  const out = [];
  walkElements(root, (el) => {
    if (test(el)) out.push(el);
  });
  return out;
}

/** HTML metnini ayrıştırır; tek kök varsa onu, yoksa sahte bir kök döndürür. */
export function parseHtml(source) {
  const html = String(source).replace(/<!--[\s\S]*?-->/g, '');
  const root = makeElement('div', {});
  const stack = [root];
  const re = /<\/?([a-zA-Z][-a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    const before = html.slice(last, m.index);
    if (before.trim()) stack[stack.length - 1].childNodes.push(textNode(decode(before)));
    last = re.lastIndex;

    const tag = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    const selfClosing = /\/\s*$/.test(m[2]);

    if (closing) {
      for (let i = stack.length - 1; i > 0; i -= 1) {
        if (stack[i].tagName === tag.toUpperCase()) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const el = makeElement(tag, parseAttrs(m[2]));
    stack[stack.length - 1].childNodes.push(el);
    if (!VOID_TAGS.has(tag) && !selfClosing) stack.push(el);
  }
  const tail = html.slice(last);
  if (tail.trim()) stack[stack.length - 1].childNodes.push(textNode(decode(tail)));

  const kids = root.children;
  return kids.length === 1 ? kids[0] : root;
}

/** parseHtml sonucunu `document` gibi davranan bir köke sarar. */
export function asDocument(el) {
  const doc = makeElement('html', {});
  doc.childNodes.push(el);
  return doc;
}
