'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * CardRainCanvas — "digital rain" of falling credit cards for the landing hero.
 * Concept A ("Matrix"), medium density. Desktop-only by design.
 *
 * Renders an absolutely-positioned <canvas> (+ a soft radial scrim) that fills
 * its positioned parent. Drop it as the FIRST child of <section className="hero-c">
 * and make sure the hero's real content sits above it (see card-rain.css).
 *
 * Behaviour:
 *  - Mounts only at >= 641px (matchMedia). On mobile it renders nothing, so the
 *    hero stays clean/static and there is zero canvas/RAF cost on phones.
 *  - Respects prefers-reduced-motion: paints one static seeded field, no loop.
 *  - Cards fall edge-to-edge, each with a green ✓ / red ✗ approval badge in the
 *    bottom-right corner and a FICO/stat token to its right; heads leave a
 *    fading trail (translucent-overlay technique).
 */

// ---- gradient pairs lifted from the site's .card-thumb classes ----
const PALETTE: [string, string][] = [
  ['#1e3a6e', '#0d1f3e'], // sapphire
  ['#c9a86a', '#8f6d2c'], // amex gold
  ['#bfc1c4', '#7a7e85'], // amex platinum
  ['#c1352e', '#6b1a16'], // venture
  ['#2a2a2a', '#000000'], // bilt
  ['#ff7a2f', '#c64d0d'], // discover
  ['#0b4a8a', '#032650'], // citi
  ['#6d3fe8', '#4a1f9e'], // brand purple
  ['#ececec', '#b8b8b8'], // apple
];
const STATS = ['742', '78%', '710', '$95K', '6y', '660', '84%', '720', '+15K', '702', '5/24', '$12K'];

const CARD_W = 20;
const CARD_H = 13;
const GAP = 18;        // "medium" density
const FADE = 0.3;      // trail length: lower = longer trails
const HEAD_ALPHA = 0.95;
const BG: [number, number, number] = [11, 9, 24]; // #0b0918 matrix field

type Col = { x: number; y: number; speed: number; pal: [string, string]; stat: string; showStat: boolean; approved: boolean };

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function startRain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let raf = 0;
  let W = 0, H = 0;
  let cols: Col[] = [];

  const newCol = (x: number): Col => ({
    x,
    y: (Math.random() * 1.6 - 0.8) * H,
    speed: 0.22 + Math.random() * 0.5,
    pal: PALETTE[(Math.random() * PALETTE.length) | 0],
    stat: STATS[(Math.random() * STATS.length) | 0],
    showStat: Math.random() < 0.55,
    approved: Math.random() < 0.6,
  });

  const initCols = () => {
    const colW = CARD_W + GAP;
    const n = Math.ceil(W / colW) + 1;
    cols = [];
    for (let i = 0; i < n; i++) cols.push(newCol(i * colW + GAP / 2));
  };

  const drawCard = (x: number, y: number, pal: [string, string], alpha: number, bright: boolean) => {
    const g = ctx.createLinearGradient(x, y, x + CARD_W, y + CARD_H);
    g.addColorStop(0, pal[0]);
    g.addColorStop(1, pal[1]);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    roundRect(ctx, x, y, CARD_W, CARD_H, 3);
    ctx.fill();
    if (bright) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(210,190,255,' + alpha * 0.6 + ')';
      ctx.stroke();
    }
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x + 3, y + 4, CARD_W - 6, 1.5); // magnetic stripe hint
    ctx.globalAlpha = 1;
  };

  const drawBadge = (x: number, y: number, approved: boolean, alpha: number) => {
    const bx = x + CARD_W - 1, by = y + CARD_H - 1, rr = 5;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(bx, by, rr, 0, Math.PI * 2);
    ctx.fillStyle = approved ? '#1f9d57' : '#df3b2c';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (approved) {
      ctx.moveTo(bx - 2.4, by + 0.2);
      ctx.lineTo(bx - 0.7, by + 1.9);
      ctx.lineTo(bx + 2.6, by - 2.1);
    } else {
      ctx.moveTo(bx - 1.9, by - 1.9);
      ctx.lineTo(bx + 1.9, by + 1.9);
      ctx.moveTo(bx + 1.9, by - 1.9);
      ctx.lineTo(bx - 1.9, by + 1.9);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const drawColumn = (col: Col, alpha: number, bright: boolean) => {
    drawCard(col.x, col.y, col.pal, alpha, bright);
    drawBadge(col.x, col.y, col.approved, alpha);
    if (col.showStat) {
      ctx.globalAlpha = 0.7 * (alpha / HEAD_ALPHA);
      ctx.fillStyle = '#c9b8ff';
      ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(col.stat, col.x + CARD_W + 7, col.y + CARD_H - 3);
      ctx.globalAlpha = 1;
    }
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initCols();
    ctx.fillStyle = `rgb(${BG[0]},${BG[1]},${BG[2]})`;
    ctx.fillRect(0, 0, W, H);
    for (const c of cols) if (c.y > -CARD_H && c.y < H) drawColumn(c, HEAD_ALPHA, false);
  };

  const frame = () => {
    ctx.fillStyle = `rgba(${BG[0]},${BG[1]},${BG[2]},${FADE})`;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      col.y += col.speed;
      drawColumn(col, HEAD_ALPHA, true);
      if (col.y > H + 40) {
        cols[i] = newCol(col.x);
        cols[i].y = -CARD_H - Math.random() * 80;
      }
    }
    raf = requestAnimationFrame(frame);
  };

  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  resize();

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) raf = requestAnimationFrame(frame);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

export default function CardRainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Desktop-only: do not mount the canvas on mobile.
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 641px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isDesktop || !canvasRef.current) return;
    return startRain(canvasRef.current);
  }, [isDesktop]);

  if (!isDesktop) return null;

  return (
    <>
      <canvas ref={canvasRef} className="hero-rain" aria-hidden="true" />
      <div className="hero-scrim" aria-hidden="true" />
    </>
  );
}
