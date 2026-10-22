import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';

export function parseBounds(value = '') {
  const match = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(value);
  if (!match) return null;
  const [left, top, right, bottom] = match.slice(1).map(Number);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function parseHierarchy(xml) {
  const start = xml.indexOf('<?xml') >= 0 ? xml.indexOf('<?xml') : xml.indexOf('<hierarchy');
  const end = xml.lastIndexOf('</hierarchy>');
  if (start < 0 || end < start || xml.includes('<!DOCTYPE') || xml.length > 8_000_000) throw new Error('Invalid Android UI hierarchy');
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, processEntities: true }).parse(xml.slice(start, end + 12));
  const nodes = [];
  function visit(raw, parentId, ancestry) {
    for (const [i, item] of (Array.isArray(raw) ? raw : raw ? [raw] : []).entries()) {
      if (nodes.length > 15_000) throw new Error('UI hierarchy exceeds 15,000 nodes');
      const location = `${ancestry}/${item.index ?? i}:${item.class || 'node'}`;
      const id = createHash('sha256').update(`${item.package}|${item['resource-id']}|${location}`).digest('hex').slice(0, 20);
      const password = item.password === 'true';
      nodes.push({ id, parentId, depth: location.split('/').length - 1, className: item.class || '', packageName: item.package || '',
        resourceId: item['resource-id'] || '', text: password ? '[redacted]' : (item.text || ''), contentDescription: password ? '' : (item['content-desc'] || ''),
        bounds: parseBounds(item.bounds), clickable: item.clickable === 'true', longClickable: item['long-clickable'] === 'true',
        scrollable: item.scrollable === 'true', enabled: item.enabled !== 'false', focused: item.focused === 'true', password,
        selected: item.selected === 'true', checked: item.checked === 'true' });
      visit(item.node, id, location);
    }
  }
  visit(parsed.hierarchy?.node, null, '');
  return { rotation: Number(parsed.hierarchy?.rotation || 0), nodes, capturedAt: Date.now() };
}

export function hitTest(nodes, x, y) {
  return nodes.filter(n => n.bounds && x >= n.bounds.left && x < n.bounds.right && y >= n.bounds.top && y < n.bounds.bottom)
    .sort((a, b) => (a.bounds.width * a.bounds.height - b.bounds.width * b.bounds.height) || b.depth - a.depth)[0] || null;
}

export { metadata as annotationMetadata } from '../../viewer/annotations.js';
