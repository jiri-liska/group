// Removed module imports. Relying on global 'THREE' and 'THREE.OrbitControls'

// --- Global State ---
const state = {
    cylinderCount: 4,
    rpm: 1000,
    speed: 50
};

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 20, 100);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// --- Lights ---
const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(5, 10, 7);
dirLight.castShadow = true;
scene.add(dirLight);

const pointLight = new THREE.PointLight(0x58a6ff, 1, 20);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// --- Controls ---
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// --- Materials ---
const materials = {
    metal: new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 0.2,
        metalness: 0.8
    }),
    piston: new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        roughness: 0.3,
        metalness: 0.5
    }),
    block: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        transparent: true,
        opacity: 0.3
    }),
    carBody: new THREE.MeshPhysicalMaterial({
        color: 0x2266cc,
        metalness: 0.6,
        roughness: 0.2,
        transmission: 0.4, // Glass-like
        transparent: true
    }),
    road: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.9
    }),
    trail: new THREE.LineBasicMaterial({
        color: 0xff3333,
        linewidth: 2 // Note: linewidth only works in WebGL2 in some browsers, but color is enough
    })
};

// --- Objects Container ---
let engineGroup = new THREE.Group();
scene.add(engineGroup);

// Ground/Road
const roadGeo = new THREE.PlaneGeometry(200, 200);
const road = new THREE.Mesh(roadGeo, materials.road);
road.rotation.x = -Math.PI / 2;
road.position.y = -2;
road.receiveShadow = true;
scene.add(road);

// Road markings dummy (to show speed)
const markingsGroup = new THREE.Group();
scene.add(markingsGroup);
for (let i = 0; i < 10; i++) {
    const markGeo = new THREE.BoxGeometry(0.5, 0.1, 4);
    const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mark.position.z = -50 + i * 15;
    mark.position.y = -1.95;
    markingsGroup.add(mark);
}

// Car Body (Symbolic)
const carBodyGeo = new THREE.BoxGeometry(4.5, 3, 10);
const carBody = new THREE.Mesh(carBodyGeo, materials.carBody);
carBody.position.y = 0.5;
scene.add(carBody);


// --- Engine Logic ---
let pistons = [];
let crankShafts = [];
let trails = []; // Array to store trail objects { line: THREE.Line, positions: Float32Array }
const TRAIL_LENGTH = 100;
const pistonRadius = 0.4;
const pistonHeight = 0.6;
const strokeLength = 1.0;
const cylinderSpacing = 1.2;

function rebuildEngine() {
    // Clear existing trails from scene first (since they are not in engineGroup)
    trails.forEach(t => {
        scene.remove(t.line);
        t.line.geometry.dispose();
    });

    // Clear existing
    engineGroup.clear();
    pistons = [];
    crankShafts = [];
    trails = [];

    const count = state.cylinderCount;
    const totalLength = (count - 1) * cylinderSpacing;
    const startZ = -totalLength / 2;

    // Create Engine Block (Visual container)
    const blockGeo = new THREE.BoxGeometry(2, 2.5, totalLength + 2);
    const block = new THREE.Mesh(blockGeo, materials.block);
    block.position.y = 0;
    engineGroup.add(block);

    for (let i = 0; i < count; i++) {
        const currentZ = startZ + i * cylinderSpacing;

        // Piston Head
        const headGeo = new THREE.CylinderGeometry(pistonRadius, pistonRadius, pistonHeight, 32);
        const head = new THREE.Mesh(headGeo, materials.piston);
        head.castShadow = true;

        // Conrod (Connecting rod - visual simplification)
        const conrodGeo = new THREE.BoxGeometry(0.1, 1.5, 0.1);
        const conrod = new THREE.Mesh(conrodGeo, materials.metal);
        conrod.position.y = -1; // Relative to piston head
        head.add(conrod);

        // Grouping for movement
        const pistonGroup = new THREE.Group();
        pistonGroup.add(head);
        pistonGroup.position.set(0, 0, currentZ);

        engineGroup.add(pistonGroup);

        // Store reference and phase
        // Standard Inline engine firing orders sort of approximated by even phases for visuals
        // For accurate physics we'd use specific firing orders, but for visual satisfy:
        const phase = (i * 2 * Math.PI) / count;

        pistons.push({
            mesh: pistonGroup,
            phase: phase,
            baseY: 0
        });

        // Crankshaft (Visual)
        const crankGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
        const crank = new THREE.Mesh(crankGeo, materials.metal);
        crank.rotation.z = Math.PI / 2;
        crank.position.set(0, -1.5, currentZ); // Bottom center
        engineGroup.add(crank);
        crankShafts.push(crank);

        // --- Trail Init ---
        // We need a BufferGeometry for the line
        const trailGeo = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(TRAIL_LENGTH * 3); // x,y,z per point
        // Initialize all points to current piston pos (hidden inside engine initially)
        for (let j = 0; j < TRAIL_LENGTH; j++) {
            trailPositions[j * 3] = 0;
            trailPositions[j * 3 + 1] = 0;
            trailPositions[j * 3 + 2] = currentZ;
        }
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailLine = new THREE.Line(trailGeo, materials.trail);
        // Trail is stationary in world X/Y, but moves relative to road in Z.
        // Easier if we add to scene directly so it doesn't rotate/move with engineGroup if we ever move engineGroup.
        // But for now engineGroup is static. Let's add to scene to be safe from engine logic.
        scene.add(trailLine);

        trails.push({
            line: trailLine,
            positions: trailPositions,
            pistonIndex: i
        });
        // Note: We need to clear these trails when rebuilding! 
        // Logic above `engineGroup.clear()` only clears children of engineGroup.
        // We need manually remove old trails from scene.
    }

    // Adjust Car Body Scale to fit engine
    carBody.scale.set(1, 1, Math.max(1, count / 4));
}


// --- Logic Handling ---

// Listeners
const rpmInput = document.getElementById('rpm');
const speedInput = document.getElementById('speed');
const cylInput = document.getElementById('cylinders');

const rpmVal = document.getElementById('rpm-val');
const speedVal = document.getElementById('speed-val');
const cylVal = document.getElementById('cylinders-val');

function updateState() {
    state.rpm = parseInt(rpmInput.value);
    state.speed = parseInt(speedInput.value);
    const newCyl = parseInt(cylInput.value);

    rpmVal.textContent = state.rpm;
    speedVal.textContent = state.speed;
    cylVal.textContent = newCyl;

    if (newCyl !== state.cylinderCount) {
        state.cylinderCount = newCyl;
        rebuildEngine();
    }
}

rpmInput.addEventListener('input', updateState);
speedInput.addEventListener('input', updateState);
cylInput.addEventListener('input', updateState);

// Initial Build
rebuildEngine();


// --- Animation Loop ---
const clock = new THREE.Clock();
let crankAngle = 0;
let roadOffset = 0;

function animate() {
    requestAnimationFrame(animate);

    const deltaTime = clock.getDelta();
    controls.update();

    // 1. Engine Animation
    // RPM to Rad/s: RPM * 2PI / 60
    const angularVelocity = (state.rpm * 2 * Math.PI) / 60;
    crankAngle += angularVelocity * deltaTime;

    pistons.forEach(p => {
        // Simple Sinusoidal Piston Motion
        // y = A * sin(theta + phase)
        const yOffset = (strokeLength / 2) * Math.sin(crankAngle + p.phase);
        p.mesh.position.y = p.baseY + yOffset;

        // Slight wiggling of the conrod connection could be added here for detail
    });

    // 1.5 Update Trails
    // We want the trail to visualize the path clearly in 3D space.
    // The "fresh" point is the current Piston position.
    // Old points move backwards along Z (simulating road moving) OR we say the car moves forward.
    // Since our camera is locked to car, the "air" moves backwards.
    // Movement Step per frame:
    const environmentSpeedZ = (state.speed / 3.6) * deltaTime; // meters moved

    trails.forEach((trail, idx) => {
        const p = pistons[trail.pistonIndex];
        const currentPistonPos = p.mesh.position; // local to engineGroup (0,y,z)
        // Convert to world space if needed, but since engineGroup is at 0,0,0, it's fine.
        // Actually pistonGroup has Z offset.
        // Piston world position:
        const wx = currentPistonPos.x; // 0
        const wy = currentPistonPos.y;
        const wz = currentPistonPos.z; // This is the Z relative to engine center.

        const positions = trail.positions;

        // Shift all points back ("move air backwards")
        // and shift data in array

        // We want to shift everything: [0] -> [1], [1] -> [2]...
        // Use copyWithin or manual loop backwards
        for (let k = TRAIL_LENGTH - 1; k > 0; k--) {
            positions[k * 3] = positions[(k - 1) * 3];
            positions[k * 3 + 1] = positions[(k - 1) * 3 + 1];
            // The Z position also needs to "flow" backwards physically in space
            positions[k * 3 + 2] = positions[(k - 1) * 3 + 2] + environmentSpeedZ;
            // Wait, if we just shift the value, we are copying the old point. 
            // BUT, that old point effectively moved relative to car.
            // So we take the PREVIOUS point's Z, and subtract offset.
        }

        // Set New Head Point
        positions[0] = wx;
        positions[1] = wy;
        positions[2] = wz;

        // Update Geometry
        trail.line.geometry.attributes.position.needsUpdate = true;

        // Optional: Fade out by modifying opacity/colors if we used BufferAttribute for color.
        // For now just geometry.
    });

    // 2. Road Animation (Speed)
    // Speed km/h to m/s
    const speedMs = state.speed / 3.6;
    roadOffset += speedMs * deltaTime;

    // Move markings to simulate infinite movement
    markingsGroup.children.forEach((mark, index) => {
        // Base Z + offset modulo total loop length
        // Loop length = 150 (approx 10 marks * 15 spacing)
        const loopLen = 150;
        let z = -50 + index * 15 + (roadOffset % loopLen);
        if (z > 100) z -= loopLen;
        mark.position.z = z;
    });

    // Wiggle Car body slightly based on RPM (vibration)
    if (state.rpm > 0) {
        carBody.position.x = (Math.random() - 0.5) * 0.02 * (state.rpm / 8000);
        carBody.position.y = 0.5 + (Math.random() - 0.5) * 0.01 * (state.rpm / 8000);
    } else {
        carBody.position.x = 0;
        carBody.position.y = 0.5;
    }

    renderer.render(scene, camera);
}

// Windows Resize Handling
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
