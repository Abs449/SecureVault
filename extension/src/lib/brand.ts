// Brand mark and monogram avatars for extension pages.
import { h } from './dom';

export function logoMark(size = 22): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const parts: [string, Record<string, string>][] = [
    ['rect', { width: '128', height: '128', rx: '30', fill: 'var(--accent)' }],
    ['circle', { cx: '64', cy: '53', r: '19', fill: '#fff' }],
    ['path', { d: 'M55.5 62h17l6.2 31.2a4 4 0 0 1-3.9 4.8H53.2a4 4 0 0 1-3.9-4.8z', fill: '#fff' }],
  ];
  for (const [tag, attrs] of parts) {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    svg.append(node);
  }
  return svg;
}

const MONOGRAM_COLORS = ['#1d4ed8', '#0f766e', '#6d28d9', '#be123c', '#b45309', '#0369a1', '#4d7c0f', '#475569'];

export function monogram(title: string, size = 32) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return h(
    'span',
    {
      class: 'monogram',
      style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background:${MONOGRAM_COLORS[Math.abs(hash) % MONOGRAM_COLORS.length]}`,
      'aria-hidden': 'true',
    },
    title.trim().charAt(0).toUpperCase() || '?'
  );
}
