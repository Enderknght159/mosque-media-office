const Charts = (() => {
  function donut({ segments = [], size = 184, thickness = 16, centerLabel = '', centerSub = '', ariaLabel = '' }) {
    const total = segments.reduce((sum, segment) => sum + (Number(segment.value) || 0), 0);
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;
    const visible = segments.filter((segment) => Number(segment.value) > 0);
    const gap = visible.length > 1 ? 3.5 : 0;
    let offset = 0;
    const rings = segments.map((segment) => {
      const value = Number(segment.value) || 0;
      const length = total ? (value / total) * circumference : 0;
      if (value <= 0) return '';
      const dash = Math.max(length - gap, 0.6);
      const ring = `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="${segment.color}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${dash} ${circumference}" stroke-dashoffset="${-offset}"><title>${Utils.esc(segment.label || '')}: ${value}</title></circle>`;
      offset += length;
      return ring;
    }).join('');
    return `
      <div class="donut-wrap" style="--donut-size:${size}px">
        <svg class="donut-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${Utils.esc(ariaLabel || centerSub)}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="var(--ring-track)" stroke-width="${thickness}"/>
          <g transform="rotate(-90 ${size / 2} ${size / 2})">${rings}</g>
        </svg>
        <div class="donut-center">
          <strong>${Utils.esc(centerLabel)}</strong>
          <span>${Utils.esc(centerSub)}</span>
        </div>
      </div>`;
  }

  function smoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const midX = (previous.x + point.x) / 2;
      path += ` C ${midX.toFixed(2)} ${previous.y.toFixed(2)}, ${midX.toFixed(2)} ${point.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }
    return path;
  }

  function line({ points = [], height = 240, color = '#0a84ff', ariaLabel = 'نشاط الإنجاز', emptyText = 'لا توجد بيانات في هذه الفترة' }) {
    if (!points.length) {
      return `<div class="chart-empty"><span>${Icons.svg('chart', 22)}</span><p>${Utils.esc(emptyText)}</p></div>`;
    }
    const width = 760;
    const pad = { top: 18, right: 18, bottom: 34, left: 42 };
    const innerWidth = width - pad.left - pad.right;
    const innerHeight = height - pad.top - pad.bottom;
    const values = points.map((point) => Number(point.value) || 0);
    const rawMax = Math.max(1, ...values);
    const step = Math.max(1, Math.ceil(rawMax / 4));
    const maxValue = step * 4;
    const xFor = (index) => pad.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const yFor = (value) => pad.top + innerHeight - (value / maxValue) * innerHeight;
    const coords = points.map((point, index) => ({ x: xFor(index), y: yFor(Number(point.value) || 0), value: Number(point.value) || 0, label: point.label }));
    const linePath = smoothPath(coords);
    const areaPath = coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${(pad.top + innerHeight).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(pad.top + innerHeight).toFixed(2)} Z`
      : '';
    const gradientId = `chartGradient_${Math.random().toString(36).slice(2, 9)}`;
    const grid = [0, 1, 2, 3, 4].map((index) => {
      const value = index * step;
      const y = yFor(value);
      return `<g>${index > 0 ? `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" stroke="var(--chart-grid)" stroke-width="1" stroke-dasharray="${index === 0 ? '0' : '3 5'}"/>` : ''}<text x="${pad.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end" fill="var(--text-3)" font-size="10">${Utils.formatNumber(value)}</text></g>`;
    }).join('');
    const labelStep = Math.max(1, Math.ceil(points.length / 6));
    const labels = points.map((point, index) => {
      if (index !== 0 && index !== points.length - 1 && index % labelStep !== 0) return '';
      const x = xFor(index);
      return `<text x="${x.toFixed(2)}" y="${height - 10}" text-anchor="middle" fill="var(--text-3)" font-size="10">${Utils.esc(point.label)}</text>`;
    }).join('');
    const dots = coords.map((point) => `<g><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.2" fill="var(--surface-solid)" stroke="${color}" stroke-width="2"/><circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="12" fill="transparent"><title>${Utils.esc(point.label)}: ${Utils.formatNumber(point.value)}</title></circle></g>`).join('');
    return `
      <div class="line-chart" role="img" aria-label="${Utils.esc(ariaLabel)}">
        <svg viewBox="0 0 ${width} ${height}">
          <defs>
            <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
              <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
            </linearGradient>
          </defs>
          ${grid}
          ${areaPath ? `<path d="${areaPath}" fill="url(#${gradientId})"/>` : ''}
          <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          ${dots}
          ${labels}
        </svg>
      </div>`;
  }

  function miniBars(values, color = '#0a84ff') {
    const max = Math.max(1, ...values);
    return `<span class="mini-bars" aria-hidden="true">${values.map((value) => `<i style="height:${Math.max(12, Utils.percent(value, max))}%;background:${color}"></i>`).join('')}</span>`;
  }

  return { donut, line, miniBars };
})();
