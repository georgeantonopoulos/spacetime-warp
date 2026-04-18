'use client';

import React, { useEffect, useRef, useState } from 'react';

// Game Constants
const COLORS = [
  '#FF4D6D', // Pink
  '#4CC9F0', // Light Blue
  '#FFD166', // Yellow
  '#C9184A', // Dark Pink
  '#4361EE', // Blue
  '#F7B267', // Orange
];

export default function GravityWellGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [helpText, setHelpText] = useState("Click & drag anywhere to warp space and jump!");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    window.addEventListener('resize', resize);
    resize();

    // -- Game State --
    const camera = { x: 0, y: 0, zoom: 0.8, targetZoom: 0.25 };
    const player = { 
      x: 0, y: -600, 
      vx: 0, vy: 0, 
      radius: 12, 
      history: [] as {x: number, y: number}[] 
    };

    // Procedural Planets
    const planets: {x: number, y: number, radius: number, mass: number, color: string, id: number}[] = [];
    const NUM_PLANETS = 45;
    
    // Home planet
    planets.push({ id: 0, x: 0, y: 0, radius: 250, mass: 6000, color: COLORS[0] });

    for (let i = 1; i < NUM_PLANETS; i++) {
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 100) {
            attempts++;
            const r = 3000 + Math.random() * 20000;
            const theta = Math.random() * Math.PI * 2;
            const x = Math.cos(theta) * r;
            const y = Math.sin(theta) * r;
            const radius = 150 + Math.random() * 400;
            const mass = radius * (12 + Math.random() * 15);

            let overlap = false;
            for (let p of planets) {
                if (Math.hypot(p.x - x, p.y - y) < p.radius + radius + 1500) {
                    overlap = true;
                    break;
                }
            }
            if (!overlap) {
                planets.push({ 
                    id: i, x, y, radius, mass, 
                    color: COLORS[Math.floor(Math.random() * COLORS.length)] 
                });
                placed = true;
            }
        }
    }

    // -- Stars --
    const stars = Array.from({length: 400}).map(() => ({
      x: (Math.random() - 0.5) * 50000,
      y: (Math.random() - 0.5) * 50000,
      size: Math.random() * 2 + 0.5,
      alpha: Math.random() * 0.5 + 0.1
    }));

    // -- Input State --
    let isDragging = false;
    let dragStartScreen = { x: 0, y: 0 };
    let dragCurrentScreen = { x: 0, y: 0 };
    
    // The "Pinch" models the slingshot tension in the space-time fabric
    let pinch = { x: 0, y: 0, vx: 0, vy: 0 }; 

    // Used for keeping drag interactions independent of camera if camera moves
    let hasJumped = false;

    // -- Coordinate Translations --
    const toScreen = (wx: number, wy: number) => ({
      x: (wx - camera.x) * camera.zoom + width / 2,
      y: (wy - camera.y) * camera.zoom + height / 2
    });

    const updatePhysics = () => {
      // Slingshot Spring Physics (for the fabric visual)
      let targetPinchX = 0;
      let targetPinchY = 0;

      if (isDragging) {
         targetPinchX = dragStartScreen.x - dragCurrentScreen.x;
         targetPinchY = dragStartScreen.y - dragCurrentScreen.y;
         // Clamp the drag visual so we don't stretch infinitely
         let pinchDist = Math.hypot(targetPinchX, targetPinchY);
         let maxPinch = 400;
         if (pinchDist > maxPinch) {
            targetPinchX = (targetPinchX / pinchDist) * maxPinch;
            targetPinchY = (targetPinchY / pinchDist) * maxPinch;
         }
      }

      // Spring formula
      pinch.vx += (targetPinchX - pinch.x) * 0.15;
      pinch.vy += (targetPinchY - pinch.y) * 0.15;
      pinch.vx *= 0.8; // Dampening
      pinch.vy *= 0.8;
      pinch.x += pinch.vx;
      pinch.y += pinch.vy;

      // Player Gravity
      let fx = 0, fy = 0;
      let touchingPlanet = null;

      for (let p of planets) {
         let dx = p.x - player.x;
         let dy = p.y - player.y;
         let dist = Math.hypot(dx, dy);
         if (dist < 10) dist = 10;
         
         const G = 10;
         let force = (G * p.mass) / (dist * dist);
         force = Math.min(force, 1.5); 

         fx += (dx / dist) * force;
         fy += (dy / dist) * force;
      }

      player.vx += fx;
      player.vy += fy;

      // Velocity soft cap
      const speed = Math.hypot(player.vx, player.vy);
      const MAX_SPEED = 80;
      if (speed > MAX_SPEED) {
         player.vx = (player.vx / speed) * MAX_SPEED;
         player.vy = (player.vy / speed) * MAX_SPEED;
      }

      player.x += player.vx;
      player.y += player.vy;

      // Collisions
      for (let p of planets) {
         let dx = p.x - player.x;
         let dy = p.y - player.y;
         let dist = Math.hypot(dx, dy);
         let minDist = p.radius + player.radius;

         if (dist < minDist) {
            touchingPlanet = p;
            let nx = dx / dist;
            let ny = dy / dist;
            let pen = minDist - dist;
            
            // Resolve intersection
            player.x -= nx * pen;
            player.y -= ny * pen;

            // Reflect relative velocity
            let dot = player.vx * nx + player.vy * ny;
            if (dot > 0) {
               let restitution = 0.15; // low bounce
               player.vx -= (1 + restitution) * dot * nx;
               player.vy -= (1 + restitution) * dot * ny;
            }

            // Apply friction for sliding to a halt
            let tx = -ny, ty = nx;
            let tanDot = player.vx * tx + player.vy * ty;
            let friction = 0.85; 
            player.vx -= tanDot * tx * (1 - friction);
            player.vy -= tanDot * ty * (1 - friction);
         }
      }

      // Trail history
      if (Math.hypot(player.vx, player.vy) > 0.5) {
        player.history.push({ x: player.x, y: player.y });
        if (player.history.length > 50) player.history.shift();
      } else if (player.history.length > 0) {
        player.history.shift(); // gradually fade when resting
      }

      // Camera Tracking
      let camTargetX = player.x;
      let camTargetY = player.y;
      
      // Look slightly ahead of slingshot
      if (isDragging) {
         camTargetX -= (dragCurrentScreen.x - dragStartScreen.x) * 3;
         camTargetY -= (dragCurrentScreen.y - dragStartScreen.y) * 3;
      }

      camera.zoom += (camera.targetZoom - camera.zoom) * 0.015;
      camera.x += (camTargetX - camera.x) * 0.04;
      camera.y += (camTargetY - camera.y) * 0.04;
    };

    const draw = () => {
      ctx.save();
      ctx.scale(dpr, dpr);
      
      // Dark space background
      ctx.clearRect(0, 0, width, height);

      // Stars parallax
      ctx.fillStyle = '#fff';
      for (const s of stars) {
         let sx = (s.x - camera.x * 0.1) * camera.zoom + width / 2;
         let sy = (s.y - camera.y * 0.1) * camera.zoom + height / 2;
         // wrap around screen
         sx = (sx % width + width) % width;
         sy = (sy % height + height) % height;
         ctx.globalAlpha = s.alpha;
         ctx.beginPath();
         ctx.arc(sx, sy, s.size * camera.zoom, 0, Math.PI * 2);
         ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // -- Space Time Grid --
      const GRID_SIZE = 250;
      const worldWidth = width / camera.zoom;
      const worldHeight = height / camera.zoom;
      const viewMargin = GRID_SIZE * 2;
      
      const startX = Math.floor((camera.x - worldWidth/2 - viewMargin) / GRID_SIZE) * GRID_SIZE;
      const endX = Math.ceil((camera.x + worldWidth/2 + viewMargin) / GRID_SIZE) * GRID_SIZE;
      const startY = Math.floor((camera.y - worldHeight/2 - viewMargin) / GRID_SIZE) * GRID_SIZE;
      const endY = Math.ceil((camera.y + worldHeight/2 + viewMargin) / GRID_SIZE) * GRID_SIZE;

      // Filter local planets for grid deformation optimization
      const activePlanets = planets.filter(p => p.x > startX - 8000 && p.x < endX + 8000 && p.y > startY - 8000 && p.y < endY + 8000);

      const deform = (wx: number, wy: number) => {
         let dx = wx, dy = wy;
         for (const p of activePlanets) {
            let pdistX = p.x - wx;
            let pdistY = p.y - wy;
            let dist = Math.hypot(pdistX, pdistY);
            if (dist < 6000) {
               // Gravity well dip
               let pull = (p.mass * 0.15) / Math.max(dist, p.radius * 0.8);
               let falloff = Math.max(0, 1 - dist / 6000);
               pull *= falloff * falloff;
               dx += (pdistX / dist) * pull;
               dy += (pdistY / dist) * pull;
            }
         }

         // Player warp pinch
         if (Math.abs(pinch.x) > 1 || Math.abs(pinch.y) > 1) {
            let pinchDistWorld = Math.hypot(pinch.x, pinch.y) / camera.zoom;
            let distToPlayer = Math.hypot(player.x - wx, player.y - wy);
            if (distToPlayer < 2500) {
                 let falloff = Math.max(0, 1 - distToPlayer / 2500);
                 falloff = falloff * falloff * (3 - 2 * falloff);
                 // apply pinch (scaled correctly)
                 dx += (pinch.x / camera.zoom) * 1.5 * falloff;
                 dy += (pinch.y / camera.zoom) * 1.5 * falloff;
            }
         }

         return toScreen(dx, dy);
      };

      ctx.beginPath();
      
      // Vertical lines
      for (let gx = startX; gx <= endX; gx += GRID_SIZE) {
          let first = true;
          for (let gy = startY; gy <= endY; gy += GRID_SIZE) {
              let p = deform(gx, gy);
              if (first) { ctx.moveTo(p.x, p.y); first = false; }
              else { ctx.lineTo(p.x, p.y); }
          }
      }
      
      // Horizontal lines
      for (let gy = startY; gy <= endY; gy += GRID_SIZE) {
          let first = true;
          for (let gx = startX; gx <= endX; gx += GRID_SIZE) {
              let p = deform(gx, gy);
              if (first) { ctx.moveTo(p.x, p.y); first = false; }
              else { ctx.lineTo(p.x, p.y); }
          }
      }
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // Fabric trace
      ctx.lineWidth = 1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // -- Slingshot trajectory / Tension line --
      if (Math.abs(pinch.x) > 5 || Math.abs(pinch.y) > 5) {
         let pScreen = toScreen(player.x, player.y);
         ctx.beginPath();
         ctx.moveTo(pScreen.x, pScreen.y);
         ctx.lineTo(pScreen.x - pinch.x, pScreen.y - pinch.y);
         let intensity = Math.min(1, Math.hypot(pinch.x, pinch.y) / 200);
         ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.5})`; // White-ish
         ctx.lineWidth = 3;
         ctx.stroke();
      }

      // -- Planets --
      for (const p of activePlanets) {
         let ps = toScreen(p.x, p.y);
         let sr = p.radius * camera.zoom;
         
         // Planet base (Dark interior to hide grid behind it)
         ctx.beginPath();
         ctx.arc(ps.x, ps.y, sr, 0, Math.PI * 2);
         ctx.fillStyle = '#020617'; 
         ctx.fill();

         // Planet glow and stroke
         ctx.shadowColor = p.color;
         ctx.shadowBlur = 40 * camera.zoom;
         ctx.lineWidth = 6 * camera.zoom;
         ctx.strokeStyle = p.color;
         ctx.stroke();

         ctx.shadowBlur = 0; // reset
      }

      // -- Player Trail --
      if (player.history.length > 1) {
         ctx.beginPath();
         let p0 = toScreen(player.history[0].x, player.history[0].y);
         ctx.moveTo(p0.x, p0.y);
         for(let i=1; i<player.history.length; i++) {
             let pt = toScreen(player.history[i].x, player.history[i].y);
             ctx.lineTo(pt.x, pt.y);
         }
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
         ctx.lineWidth = 6 * camera.zoom;
         ctx.stroke();
      }

      // -- Player --
      let pScreen = toScreen(player.x, player.y);
      ctx.beginPath();
      ctx.arc(pScreen.x, pScreen.y, player.radius * camera.zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 30 * camera.zoom;
      ctx.fill();
      ctx.shadowBlur = 0; // reset

      ctx.restore();
    };

    const loop = () => {
      updatePhysics();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();

    // Input handlers
    const handleDown = (e: PointerEvent) => {
      isDragging = true;
      dragStartScreen = { x: e.clientX, y: e.clientY };
      dragCurrentScreen = { x: e.clientX, y: e.clientY };
      if (!hasJumped) {
         hasJumped = true;
         setHelpText(""); // Hide help text visually gracefully
      }
    };
    const handleMove = (e: PointerEvent) => {
      if (isDragging) {
        dragCurrentScreen = { x: e.clientX, y: e.clientY };
      }
    };
    const handleUp = (e: PointerEvent) => {
      if (isDragging) {
        isDragging = false;
        
        // Apply impulse based on drag vector
        let dirX = dragStartScreen.x - dragCurrentScreen.x;
        let dirY = dragStartScreen.y - dragCurrentScreen.y;
        
        let dragDist = Math.hypot(dirX, dirY);
        const MAX_DRAG = 400; // Screen pixels
        const effectiveness = Math.min(dragDist, MAX_DRAG) / MAX_DRAG;
        
        if (dragDist > 10) {
            let nx = dirX / dragDist;
            let ny = dirY / dragDist;
            
            const MAX_IMPULSE = 35; // velocity units per frame
            player.vx += nx * effectiveness * MAX_IMPULSE;
            player.vy += ny * effectiveness * MAX_IMPULSE;
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
       // Optional zoom feature if user wants to play with camera
       const zoomDelta = e.deltaY * -0.0005;
       camera.targetZoom = Math.max(0.05, Math.min(1.5, camera.targetZoom + zoomDelta));
    };

    canvas.addEventListener('pointerdown', handleDown);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    canvas.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', handleDown);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (
    <div 
      className="relative w-full h-screen overflow-hidden text-[#ffffff] font-['Helvetica_Neue',_Arial,_sans-serif] selection:bg-transparent"
      style={{ background: 'radial-gradient(circle at center, #0d1117 0%, #05070a 100%)' }}
    >
      <canvas
        ref={canvasRef}
        className="block touch-none"
      />
      
      <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-[100] pointer-events-none">
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-[2px] text-white/50 mb-1">Game</div>
          <h1 className="text-2xl font-[200] tracking-[-1px]">
             GRAVITYWELL
          </h1>
        </div>
      </div>

      <div className="absolute bottom-8 left-8 right-8 flex justify-center z-[100] pointer-events-none">
        {helpText && (
          <p className="bg-white/5 px-6 py-3 rounded-full border border-white/10 text-[11px] tracking-[1px] uppercase backdrop-blur-md">
            {helpText}
          </p>
        )}
      </div>

      <div className="absolute bottom-8 right-8 z-[100] pointer-events-none text-right flex flex-col items-end">
        <div className="text-[10px] uppercase tracking-[2px] text-white/50 mb-1">
          Procedural Space
        </div>
        <div className="text-2xl font-[200] tracking-[-1px]">
          Warp Drive Active
        </div>
      </div>
    </div>
  );
}
