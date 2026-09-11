import * as THREE from 'three';

type LimbRig = {
  upper: THREE.Group;
  forearm: THREE.Group;
};

type CrowdMember = {
  group: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  phase: number;
};

const FRAME_INTERVAL_MS = 1000 / 30;

function createBox(
  size: [number, number, number],
  color: number,
  roughness = 0.45,
  metalness = 0.12,
): THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  return new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
}

function createLimb(skinMaterial: THREE.MeshStandardMaterial, sleeveMaterial: THREE.MeshStandardMaterial): LimbRig {
  const upper = new THREE.Group();
  const upperMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.38, 4, 8), sleeveMaterial);
  upperMesh.position.y = -0.28;
  upper.add(upperMesh);

  const forearm = new THREE.Group();
  forearm.position.y = -0.57;
  const forearmMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.31, 4, 8), skinMaterial);
  forearmMesh.position.y = -0.235;
  forearm.add(forearmMesh);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 8), skinMaterial);
  hand.scale.set(1.05, 0.7, 1.25);
  hand.position.y = -0.5;
  forearm.add(hand);
  upper.add(forearm);
  return { upper, forearm };
}

export class KeyboardPerformer3D {
  private renderer: THREE.WebGLRenderer | null = null;
  private animationFrame = 0;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private visible = true;
  private lastFrame = 0;
  private destroyed = false;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-2.2, 2.2, 1.65, -1.65, 0.1, 50);
  private readonly performer = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly leftArm: LimbRig;
  private readonly rightArm: LimbRig;
  private readonly animatedKeys: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  private readonly crowd: CrowdMember[] = [];
  private readonly spotlights: THREE.Group[] = [];
  private readonly ledBars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
  private stageHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  private particles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  private readonly prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly host: HTMLElement) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xc97848, roughness: 0.66 });
    const orange = new THREE.MeshStandardMaterial({
      color: 0xff5f0b,
      emissive: 0x521300,
      emissiveIntensity: 0.35,
      roughness: 0.42,
      metalness: 0.08,
    });
    this.leftArm = createLimb(skin, orange);
    this.rightArm = createLimb(skin, orange);
    this.buildScene(skin, orange);
  }

  mount(): void {
    if (this.renderer || this.destroyed) return;
    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      this.host.classList.add('is-webgl-unavailable');
      return;
    }
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.host.append(this.renderer.domElement);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? true;
      if (this.visible) this.requestFrame();
    });
    this.intersectionObserver.observe(this.host);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.resize();
    this.render(0);
    if (!this.prefersReducedMotion) this.requestFrame();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    // Points e Line tambem carregam geometria e material: olhar so para Mesh
    // deixava os pontos do palco na memoria da GPU a cada login.
    this.scene.traverse((object) => {
      const geometry = (object as Partial<THREE.Mesh>).geometry;
      const material = (object as Partial<THREE.Mesh>).material;
      if (geometry) geometry.dispose();
      if (!material) return;
      for (const entry of Array.isArray(material) ? material : [material]) entry.dispose();
    });
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  private buildScene(skin: THREE.MeshStandardMaterial, orange: THREE.MeshStandardMaterial): void {
    this.camera.position.set(4.2, 2.75, 7.8);
    this.camera.lookAt(0, -0.05, 0.1);
    this.scene.fog = new THREE.FogExp2(0x080308, 0.075);
    this.scene.add(new THREE.HemisphereLight(0xffd5b5, 0x130718, 1.55));
    const orangeLight = new THREE.PointLight(0xff5b0a, 13, 8, 1.6);
    orangeLight.position.set(-2.1, 1.2, 3.3);
    this.scene.add(orangeLight);
    const cyanLight = new THREE.PointLight(0x3ee7ff, 8, 7, 1.7);
    cyanLight.position.set(2.3, 0.3, 2.4);
    this.scene.add(cyanLight);

    this.buildStage();

    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xff5a08, transparent: true, opacity: 0.62 });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 8, 64), haloMaterial);
    halo.position.set(0, 0.35, -0.5);
    halo.rotation.x = 0.08;
    this.stageHalo = halo;
    this.performer.add(halo);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.62, 6, 16), orange);
    torso.position.y = 0.18;
    torso.scale.z = 0.73;
    this.performer.add(torso);

    const hoodiePocket = createBox([0.48, 0.2, 0.12], 0xce3403, 0.72, 0.02);
    hoodiePocket.position.set(0, -0.03, 0.34);
    hoodiePocket.rotation.x = -0.12;
    this.performer.add(hoodiePocket);

    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.105, 10, 28, Math.PI * 1.45), orange);
    hood.position.set(0, 0.69, -0.05);
    hood.rotation.z = Math.PI * 0.77;
    this.performer.add(hood);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.24, 12), skin);
    neck.position.y = 0.72;
    this.performer.add(neck);

    const face = new THREE.Mesh(new THREE.SphereGeometry(0.37, 20, 14), skin);
    face.scale.set(0.9, 1.04, 0.9);
    this.head.add(face);
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.385, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.57),
      new THREE.MeshStandardMaterial({ color: 0x100a0d, roughness: 0.85 }),
    );
    hair.position.y = 0.05;
    this.head.add(hair);

    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x120809 });
    for (const x of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial);
      eye.position.set(x, 0.03, 0.335);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 8), skin);
    nose.position.set(0, -0.025, 0.38);
    nose.rotation.x = Math.PI / 2;
    this.head.add(nose);
    const smile = new THREE.Mesh(
      new THREE.TorusGeometry(0.075, 0.012, 5, 12, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x40120d }),
    );
    smile.position.set(0, -0.13, 0.35);
    smile.rotation.z = Math.PI;
    this.head.add(smile);
    const headphones = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.035, 8, 28, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x19191f, metalness: 0.72, roughness: 0.25 }),
    );
    headphones.rotation.z = Math.PI / 2;
    headphones.position.z = 0.01;
    this.head.add(headphones);
    this.head.position.set(0, 1.12, 0.03);
    this.performer.add(this.head);

    this.leftArm.upper.position.set(-0.39, 0.5, 0.02);
    this.rightArm.upper.position.set(0.39, 0.5, 0.02);
    this.performer.add(this.leftArm.upper, this.rightArm.upper);

    const keyboard = new THREE.Group();
    const chassis = createBox([2.65, 0.19, 0.83], 0x121217, 0.28, 0.55);
    chassis.position.set(0, -0.08, -0.03);
    keyboard.add(chassis);
    const whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e8d6, roughness: 0.32, metalness: 0.04 });
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.22, metalness: 0.48 });
    const keyWidth = 0.205;
    for (let index = 0; index < 12; index += 1) {
      const material = whiteMaterial.clone();
      material.emissive.setHex(index % 2 ? 0x000000 : 0x1f0800);
      const key = new THREE.Mesh(new THREE.BoxGeometry(keyWidth - 0.012, 0.095, 0.66), material);
      key.position.set((index - 5.5) * keyWidth, 0.08, 0.06);
      keyboard.add(key);
      if ([2, 4, 7, 9].includes(index)) this.animatedKeys.push(key);
    }
    for (const index of [0, 1, 3, 5, 6, 8, 10]) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.13, 0.4), blackMaterial);
      key.position.set((index - 5) * keyWidth, 0.165, -0.065);
      keyboard.add(key);
    }
    keyboard.position.set(0, -0.72, 0.84);
    keyboard.rotation.x = -0.08;
    this.performer.add(keyboard);

    const keyboardGlow = new THREE.Mesh(
      new THREE.BoxGeometry(2.7, 0.035, 0.05),
      new THREE.MeshBasicMaterial({ color: 0xff5a08 }),
    );
    keyboardGlow.position.set(0, -0.55, 1.22);
    this.performer.add(keyboardGlow);

    const standMaterial = new THREE.MeshStandardMaterial({ color: 0x262631, metalness: 0.72, roughness: 0.24 });
    for (const x of [-0.72, 0.72]) {
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), standMaterial);
      stand.position.set(x, -1.18, 0.7);
      stand.rotation.z = x < 0 ? -0.28 : 0.28;
      this.performer.add(stand);
    }

    this.performer.position.set(0, -0.02, 0);
    this.performer.rotation.y = -0.06;
    this.scene.add(this.performer);
    this.buildCrowd();
  }

  private buildStage(): void {
    const stage = createBox([4.65, 0.2, 2.25], 0x111119, 0.24, 0.68);
    stage.position.set(0, -1.53, 0.2);
    this.scene.add(stage);

    const stageEdge = createBox([4.7, 0.1, 0.12], 0xff4e05, 0.25, 0.15);
    stageEdge.material.emissive.setHex(0xff2600);
    stageEdge.material.emissiveIntensity = 1.4;
    stageEdge.position.set(0, -1.45, 1.3);
    this.scene.add(stageEdge);

    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0x08070d,
      emissive: 0x160510,
      emissiveIntensity: 0.65,
      roughness: 0.38,
      metalness: 0.42,
    });
    const screen = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.65, 0.1), screenMaterial);
    screen.position.set(0, -0.03, -1.05);
    this.scene.add(screen);

    for (let index = 0; index < 13; index += 1) {
      const hue = index % 3 === 1 ? 0x2be4ff : index % 3 === 2 ? 0xff315c : 0xff6508;
      const material = new THREE.MeshStandardMaterial({
        color: hue,
        emissive: hue,
        emissiveIntensity: 0.75,
        roughness: 0.3,
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.19, 1.65, 0.035), material);
      bar.position.set((index - 6) * 0.29, -0.1, -0.97);
      bar.scale.y = 0.35 + ((index * 7) % 10) / 13;
      this.ledBars.push(bar);
      this.scene.add(bar);
    }

    const metal = new THREE.MeshStandardMaterial({ color: 0x30303b, roughness: 0.24, metalness: 0.86 });
    const topTruss = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.65, 8), metal);
    topTruss.position.set(0, 1.72, -0.55);
    topTruss.rotation.z = Math.PI / 2;
    this.scene.add(topTruss);
    for (const x of [-2.12, 2.12]) {
      const sideTruss = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.25, 8), metal);
      sideTruss.position.set(x, 0.12, -0.55);
      this.scene.add(sideTruss);

      const speakerGroup = new THREE.Group();
      for (const y of [-0.9, -0.38, 0.14]) {
        const cabinet = createBox([0.46, 0.46, 0.34], 0x0b0b10, 0.42, 0.5);
        cabinet.position.y = y;
        speakerGroup.add(cabinet);
        const cone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.13, 0.18, 0.045, 16),
          new THREE.MeshStandardMaterial({ color: 0x20202a, metalness: 0.62, roughness: 0.3 }),
        );
        cone.position.set(0, y, 0.19);
        cone.rotation.x = Math.PI / 2;
        speakerGroup.add(cone);
      }
      speakerGroup.position.set(x * 0.9, -0.12, -0.34);
      this.scene.add(speakerGroup);
    }

    const lightColors = [0xff4d08, 0x37dfff, 0xff2f72, 0xffb21a];
    lightColors.forEach((color, index) => {
      const rig = new THREE.Group();
      rig.position.set(-1.55 + index * 1.03, 1.62, -0.34);
      const fixture = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.15, 0.18, 10),
        new THREE.MeshStandardMaterial({ color: 0x17171d, metalness: 0.8, roughness: 0.25 }),
      );
      rig.add(fixture);
      const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.58, 2.9, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.085,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      beam.position.y = -1.45;
      rig.add(beam);
      this.spotlights.push(rig);
      this.scene.add(rig);
    });

    const particlePositions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index += 1) {
      particlePositions[index * 3] = (Math.random() - 0.5) * 5;
      particlePositions[index * 3 + 1] = Math.random() * 3.6 - 1.45;
      particlePositions[index * 3 + 2] = Math.random() * 2 - 0.9;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    this.particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xff8b39,
        size: 0.035,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.particles);
  }

  private buildCrowd(): void {
    const rows = [
      { z: 1.7, y: -1.63, count: 11, scale: 0.3 },
      { z: 1.28, y: -1.48, count: 9, scale: 0.25 },
    ];
    let globalIndex = 0;
    for (const row of rows) {
      for (let index = 0; index < row.count; index += 1) {
        const group = new THREE.Group();
        const palette = [0x13121a, 0x23101a, 0x0b1d25, 0x26170c];
        const clothes = new THREE.MeshStandardMaterial({
          color: palette[globalIndex % palette.length],
          roughness: 0.85,
        });
        const silhouette = new THREE.MeshStandardMaterial({ color: 0x160d10, roughness: 0.92 });
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.38, 3, 7), clothes);
        group.add(torso);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7), silhouette);
        head.position.y = 0.52;
        group.add(head);
        const leftArm = new THREE.Group();
        const rightArm = new THREE.Group();
        const makeArm = () => {
          const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.42, 3, 6), silhouette);
          arm.position.y = 0.27;
          return arm;
        };
        leftArm.position.set(-0.2, 0.12, 0);
        rightArm.position.set(0.2, 0.12, 0);
        leftArm.add(makeArm());
        rightArm.add(makeArm());
        leftArm.rotation.z = 0.58;
        rightArm.rotation.z = -0.58;
        group.add(leftArm, rightArm);
        group.scale.setScalar(row.scale * (0.86 + (globalIndex % 4) * 0.05));
        group.position.set((index - (row.count - 1) / 2) * (4.7 / row.count), row.y, row.z);
        const phase = globalIndex * 0.67;
        this.crowd.push({ group, leftArm, rightArm, phase });
        this.scene.add(group);
        globalIndex += 1;
      }
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') this.requestFrame();
  };

  private requestFrame(): void {
    if (this.destroyed || this.animationFrame || !this.visible || document.visibilityState !== 'visible') return;
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  private readonly animate = (timestamp: number): void => {
    this.animationFrame = 0;
    if (this.destroyed || !this.visible || document.visibilityState !== 'visible') return;
    if (timestamp - this.lastFrame >= FRAME_INTERVAL_MS) {
      this.lastFrame = timestamp;
      this.render(timestamp * 0.001);
    }
    this.requestFrame();
  };

  private render(time: number): void {
    const beat = time * 4.2;
    const leftPulse = Math.sin(beat);
    const rightPulse = Math.sin(beat + Math.PI);
    this.performer.position.y = -0.02 + Math.sin(time * 2.1) * 0.025;
    this.performer.rotation.y = -0.06 + Math.sin(time * 0.8) * 0.035;
    this.head.rotation.z = Math.sin(time * 2.1) * 0.055;
    this.head.rotation.y = Math.sin(time * 1.15) * 0.085;
    this.leftArm.upper.rotation.set(-0.72 + leftPulse * 0.08, 0.08, -0.74 + leftPulse * 0.13);
    this.rightArm.upper.rotation.set(-0.72 + rightPulse * 0.08, -0.08, 0.74 - rightPulse * 0.13);
    this.leftArm.forearm.rotation.x = -0.66 - leftPulse * 0.2;
    this.rightArm.forearm.rotation.x = -0.66 - rightPulse * 0.2;
    this.animatedKeys.forEach((key, index) => {
      const pulse = Math.max(0, Math.sin(beat + index * 1.7));
      key.position.y = 0.08 - pulse * 0.035;
      key.material.emissive.setHex(index % 2 ? 0x003040 : 0x451000);
      key.material.emissiveIntensity = 0.18 + pulse * 1.9;
    });
    this.ledBars.forEach((bar, index) => {
      const pulse = 0.25 + Math.abs(Math.sin(time * 3.2 + index * 0.52)) * 0.75;
      bar.scale.y = 0.24 + pulse * (0.42 + (index % 4) * 0.12);
      bar.material.emissiveIntensity = 0.45 + pulse * 1.35;
    });
    this.spotlights.forEach((light, index) => {
      light.rotation.z = Math.sin(time * 0.72 + index * 1.5) * 0.34;
      light.rotation.x = Math.cos(time * 0.56 + index) * 0.1;
    });
    this.crowd.forEach(({ group, leftArm, rightArm, phase }, index) => {
      const jump = Math.max(0, Math.sin(time * 3.1 + phase));
      group.position.y += (jump * 0.035 - (group.userData.lastJump ?? 0));
      group.userData.lastJump = jump * 0.035;
      leftArm.rotation.z = 0.58 + Math.sin(time * 2.7 + phase) * 0.34;
      rightArm.rotation.z = -0.58 - Math.sin(time * 2.45 + phase + index * 0.11) * 0.34;
    });
    if (this.stageHalo) {
      this.stageHalo.rotation.z = time * 0.18;
      this.stageHalo.material.opacity = 0.48 + Math.sin(time * 2.3) * 0.14;
    }
    if (this.particles) {
      this.particles.rotation.y = time * 0.025;
      this.particles.position.y = Math.sin(time * 0.42) * 0.08;
    }
    this.renderer?.render(this.scene, this.camera);
  }

  private resize(): void {
    if (!this.renderer) return;
    const width = Math.max(1, Math.round(this.host.clientWidth));
    const height = Math.max(1, Math.round(this.host.clientHeight));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const vertical = 2.08;
    this.camera.left = -vertical * aspect;
    this.camera.right = vertical * aspect;
    this.camera.top = vertical;
    this.camera.bottom = -vertical;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
