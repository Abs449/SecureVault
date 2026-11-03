// Minimal DOM builder. Text is always set via text nodes, never innerHTML, so vault
// contents (titles, notes, usernames) cannot inject markup into the popup.

import { createElement as lucide, type IconNode } from 'lucide';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string };

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key in node && !key.includes('-')) {
      (node as unknown as Record<string, unknown>)[key] = value;
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function icon(node: IconNode, size = 16): SVGElement {
  return lucide(node, { width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true' });
}
