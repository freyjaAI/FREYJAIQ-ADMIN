import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  pulsePhase: number;
}

interface DataPacket {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  speed: number;
  opacity: number;
}

export function AnimatedDataBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const dataPacketsRef = useRef<DataPacket[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    window.addEventListener("resize", resize);

    const particleCount = 50;
    const connectionDistance = 150;
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: Math.random() * 2 + 1,
        opacity: Math.random() * 0.5 + 0.2,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    particlesRef.current = particles;
    const dataPackets: DataPacket[] = [];
    dataPacketsRef.current = dataPackets;

    let lastPacketTime = 0;
    const packetInterval = 800;

    const animate = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      particles.forEach((particle) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.pulsePhase += 0.02;

        if (particle.x < 0 || particle.x > rect.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > rect.height) particle.vy *= -1;

        particle.x = Math.max(0, Math.min(rect.width, particle.x));
        particle.y = Math.max(0, Math.min(rect.height, particle.y));
      });

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < connectionDistance) {
            const opacity = (1 - distance / connectionDistance) * 0.15;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      if (time - lastPacketTime > packetInterval && particles.length >= 2) {
        lastPacketTime = time;
        const startIdx = Math.floor(Math.random() * particles.length);
        let endIdx = Math.floor(Math.random() * particles.length);
        while (endIdx === startIdx) {
          endIdx = Math.floor(Math.random() * particles.length);
        }

        const startP = particles[startIdx];
        const endP = particles[endIdx];
        const dx = endP.x - startP.x;
        const dy = endP.y - startP.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance * 2) {
          dataPackets.push({
            startX: startP.x,
            startY: startP.y,
            endX: endP.x,
            endY: endP.y,
            progress: 0,
            speed: 0.015 + Math.random() * 0.01,
            opacity: 0.8,
          });
        }
      }

      for (let i = dataPackets.length - 1; i >= 0; i--) {
        const packet = dataPackets[i];
        packet.progress += packet.speed;

        if (packet.progress >= 1) {
          dataPackets.splice(i, 1);
          continue;
        }

        const x = packet.startX + (packet.endX - packet.startX) * packet.progress;
        const y = packet.startY + (packet.endY - packet.startY) * packet.progress;

        const fadeIn = Math.min(packet.progress * 5, 1);
        const fadeOut = Math.min((1 - packet.progress) * 5, 1);
        const currentOpacity = packet.opacity * fadeIn * fadeOut;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, 6);
        gradient.addColorStop(0, `rgba(139, 92, 246, ${currentOpacity})`);
        gradient.addColorStop(0.5, `rgba(99, 102, 241, ${currentOpacity * 0.5})`);
        gradient.addColorStop(1, `rgba(99, 102, 241, 0)`);

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();

        const trailLength = 0.15;
        for (let t = 0; t < 5; t++) {
          const trailProgress = packet.progress - (t * trailLength) / 5;
          if (trailProgress < 0) continue;

          const tx = packet.startX + (packet.endX - packet.startX) * trailProgress;
          const ty = packet.startY + (packet.endY - packet.startY) * trailProgress;
          const trailOpacity = currentOpacity * (1 - t / 5) * 0.3;

          ctx.beginPath();
          ctx.fillStyle = `rgba(139, 92, 246, ${trailOpacity})`;
          ctx.arc(tx, ty, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      particles.forEach((particle) => {
        const pulse = Math.sin(particle.pulsePhase) * 0.3 + 0.7;
        const currentOpacity = particle.opacity * pulse;

        const gradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.radius * 3
        );
        gradient.addColorStop(0, `rgba(139, 92, 246, ${currentOpacity})`);
        gradient.addColorStop(0.4, `rgba(99, 102, 241, ${currentOpacity * 0.5})`);
        gradient.addColorStop(1, "rgba(99, 102, 241, 0)");

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(particle.x, particle.y, particle.radius * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity * 0.8})`;
        ctx.arc(particle.x, particle.y, particle.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}
