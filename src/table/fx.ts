import * as THREE from 'three';
import gsap from 'gsap';

function dotTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,.85)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  // four-point twinkle
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.fillRect(30, 2, 4, 60);
  g.fillRect(2, 30, 60, 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,225,140,.9)');
  grd.addColorStop(0.45, 'rgba(255,200,90,.35)');
  grd.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Golden sparkle bursts and soft glows under winning hands. */
export class Fx {
  private N = 600;
  private pos = new Float32Array(this.N * 3);
  private col = new Float32Array(this.N * 3);
  private vel = new Float32Array(this.N * 3);
  private life = new Float32Array(this.N);
  private base = new Float32Array(this.N * 3);
  private geo = new THREE.BufferGeometry();
  private points: THREE.Points;
  private next = 0;
  private glowTex = glowTexture();

  constructor(private parent: THREE.Object3D) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.09,
      map: dotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    parent.add(this.points);
  }

  burst(at: THREE.Vector3, count = 80, color = '#ffd36b', spread = 0.6, up = 1.6) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.N;
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = at.y + 0.05;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread * 0.6;
      const a = Math.random() * Math.PI * 2;
      const s = 0.4 + Math.random() * 1.2;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s * 0.6;
      this.life[i] = 0.9 + Math.random() * 0.9;
      const tint = 0.75 + Math.random() * 0.35;
      this.base[i * 3] = c.r * tint;
      this.base[i * 3 + 1] = c.g * tint;
      this.base[i * 3 + 2] = c.b * tint;
    }
  }

  /** Pulsing additive glow under a rectangle of the table. */
  glow(at: THREE.Vector3, w: number, h: number, dur = 1.6, color = '#ffd27a') {
    const mat = new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), mat);
    m.position.set(at.x, 0.003, at.z);
    m.renderOrder = 1;
    this.parent.add(m);
    gsap.timeline({
      onComplete: () => {
        this.parent.remove(m);
        m.geometry.dispose();
        mat.dispose();
      },
    })
      .to(mat, { opacity: 0.9, duration: 0.25 })
      .to(mat, { opacity: 0.45, duration: 0.4, yoyo: true, repeat: 2 })
      .to(mat, { opacity: 0, duration: dur * 0.4 });
  }

  update(dt: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 2.2 * dt;
      this.vel[i * 3] *= 1 - dt * 1.2;
      this.vel[i * 3 + 2] *= 1 - dt * 1.2;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = Math.min(1, this.life[i] * 1.6) * (0.65 + 0.35 * Math.sin(this.life[i] * 40 + i));
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
