class MiniChart {
  constructor(canvasId, label, color, opts = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.label = label;
    this.color = color;
    this.data = [];
    this.labels = [];
    this.MAX = 20;
    // compact = small sparkline-style variant used by the Compact View tab
    this.compact = !!opts.compact;
    this.fs = this.compact ? 10 : 18;   // base font size
    this._resize = () => this.draw();
    window.addEventListener('resize', this._resize);
    this.draw();
  }

  push(ts, value) {
    this.data.push(value);
    this.labels.push(ts);
    if (this.data.length > this.MAX) {
      this.data.shift();
      this.labels.shift();
    }
    this.draw();
  }

  setData(labels, values) {
    // Used for historical/CSV data. The X-axis labels come directly
    // from the imported CSV instead of being generated from current time.
    this.labels = Array.isArray(labels) ? labels.slice(-this.MAX) : [];
    this.data = Array.isArray(values) ? values.slice(-this.MAX) : [];
    this.draw();
  }

  clear() {
    this.data = [];
    this.labels = [];
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    if (!rect.width) return;

    c.width  = rect.width  * dpr;
    c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const fs = this.fs;
    const PAD = this.compact
      ? { top: 22, right: 10, bottom: 30, left: 34 }
      : { top: 32, right: 20, bottom: 42, left: 65 };
    const gW = W - PAD.left - PAD.right;
    const gH = H - PAD.top  - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const pts = this.data;
    const hasData = pts.length > 1;

    const minV = hasData ? Math.min(...pts) : 0;
    const maxV = hasData ? Math.max(...pts) : 1;
    const range = maxV - minV || 1;
    const padV  = range * 0.15;
    const lo = minV - padV;
    const hi = maxV + padV;

    const toX = i  => PAD.left + (i / (this.MAX - 1)) * gW;
    const toY = v  => PAD.top  + (1 - (v - lo) / (hi - lo)) * gH;

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth   = 1;
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const v = lo + (hi - lo) * (i / yTicks);
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + gW, y);
      ctx.stroke();
      ctx.fillStyle = '#0f172a';
      ctx.font = `500 ${fs}px Segoe UI`;
      ctx.textAlign = 'right';
      ctx.fillText(v.toFixed(1), PAD.left - 6, y + 4);
    }

    if (hasData) {
      const step = this.compact
          ? Math.max(1, Math.ceil(70 / (gW / (this.MAX - 1))))   // keep compact labels ~70px apart
          : Math.max(1, Math.floor(pts.length / 5));
      for (let i = 0; i < pts.length; i += step) {
        const x = toX(i);

        const edge = this.compact ? 14 : 25;
        const labelX = (i === 0)
          ? x + edge
          : (i === pts.length - 1)
            ? x - 8
            : x;

        
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, PAD.top + gH);
        ctx.stroke();
        const lbl = this.labels[i];
        ctx.fillStyle = '#0f172a';
        ctx.font = `500 ${fs}px Segoe UI`;
        ctx.textAlign = 'center';
        const parts = String(lbl == null ? '' : lbl).split(', ');
        const yBase = this.compact ? PAD.top + gH + 14 : PAD.top + gH + 26;
        if (parts.length === 2) {          // CSV "date, time" -> two lines
          ctx.fillText(parts[0], labelX, yBase - 2);
          ctx.fillText(parts[1], labelX, yBase + 10);
        } else {
          ctx.fillText(parts[0], labelX, yBase);
        }
      }
    }

    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + gH);
    ctx.lineTo(PAD.left + gW, PAD.top + gH);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    if (hasData) {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(pts[0]));
      for (let i = 1; i < pts.length; i++) {
        const x0 = toX(i - 1), y0 = toY(pts[i - 1]);
        const x1 = toX(i),     y1 = toY(pts[i]);
        const cpx = (x0 + x1) / 2;
        ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
      }
      ctx.strokeStyle = this.color;
      ctx.lineWidth   = this.compact ? 2 : 2.5;
      ctx.lineJoin    = 'round';
      ctx.stroke();

      ctx.fillStyle = this.color;
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(toX(i), toY(pts[i]), this.compact ? 2 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = '#0f172a';
    ctx.font      = `bold ${fs}px Segoe UI`;
    ctx.textAlign = 'left';
    const lx = this.compact ? PAD.left : PAD.left + 20;
    const sq = this.compact ? 8 : 12;
    const ly = this.compact ? 5 : 8;
    ctx.fillStyle = this.color;
    ctx.fillRect(lx, ly, sq, sq);

    ctx.fillStyle = '#0f172a';
    ctx.fillText(this.label, lx + sq + (this.compact ? 6 : 9), ly + sq - (this.compact ? 0 : 1));
  }
}
