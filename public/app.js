const socket = io();

const form = document.getElementById('wish-form');
const input = document.getElementById('wish-input');
const container = document.getElementById('wishes-container');

window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('focus') === '1') {
        if (input) {
            input.focus();
        }
    }
    
    // Generate QR code
    if (typeof QRCode !== 'undefined') {
        const currentUrl = window.location.origin + window.location.pathname + '?focus=1';
        new QRCode(document.getElementById("qrcode"), {
            text: currentUrl,
            width: 128,
            height: 128,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    }
});

// Physics state
const wishesArray = [];
let baseRadius = 80;

let isAdmin = false;

// Listen for submission
form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wishText = input.value.trim();
    
    // Presentation Mode (Hide UI entirely)
    if (wishText.toLowerCase() === 'opensesame') {
        const centerContent = document.querySelector('.center-content');
        if (centerContent) centerContent.style.display = 'none';
        
        const qrContainer = document.querySelector('.qr-container');
        if (qrContainer) qrContainer.style.display = 'none';
        
        return;
    }

    // Check for admin super secret code
    if (wishText.toLowerCase() === 'admin123') {
        isAdmin = !isAdmin;
        input.value = '';
        if (isAdmin) {
            container.classList.add('admin-mode');
            alert('Admin mode unlocked: You can now delete wishes by clicking their X button.');
        } else {
            container.classList.remove('admin-mode');
            alert('Admin mode disabled.');
        }
        return;
    }
    
    if (wishText) {
        socket.emit('new_wish', wishText);
        input.value = '';
    }
});

// Load existing wishes on connect
socket.on('load_wishes', (wishes) => {
    container.innerHTML = '';
    wishesArray.length = 0; // Reset
    
    // Always persist the logo and decorative icons whenever we refresh the screen from database state
    initLogo();
    spawnDecorativeIcons(16); // Spawn 16 background glass icons
    
    wishes.forEach(wish => {
        createBubble(wish);
    });
});

// Listen for new incoming wishes
socket.on('receive_wish', (wish) => {
    createBubble(wish);
});

// Listen for deleted wishes
socket.on('wish_deleted', (wishId) => {
    const index = wishesArray.findIndex(b => b.id === wishId);
    if (index !== -1) {
        const b = wishesArray[index];
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        wishesArray.splice(index, 1);
    }
});

function createBubble(wish) {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.classList.add('wish-bubble');
    
    // Polaroid structure
    bubbleWrapper.innerHTML = `
        <div class="polaroid-card">
            <span></span>
        </div>
    `;
    
    const textSpan = bubbleWrapper.querySelector('span');
    textSpan.innerText = wish.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.innerText = 'X';
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); // Avoid triggering parents
        socket.emit('delete_wish', wish.id);
    };
    bubbleWrapper.appendChild(deleteBtn);

    container.appendChild(bubbleWrapper);

    // Initial properties
    const radius = baseRadius;
    const x = radius + Math.random() * (window.innerWidth - radius * 2);
    const y = radius + Math.random() * (window.innerHeight - radius * 2);
    
    // Faster initial random velocity to spread them gently
    const vx = (Math.random() - 0.5) * 3;
    const vy = (Math.random() - 0.5) * 3;

    // Calculate initial target radius dynamically based on text length
    // We apply a gentle scale-down for mobile devices to prevent completely dominating the screen
    let viewportScale = window.innerWidth < 600 ? 0.75 : 1;
    let calculatedR = 45 + (wish.text.length * 1.2);
    
    let targetR = Math.max(60 * viewportScale, calculatedR * viewportScale);

    // Shrink all existing wishes so the screen doesn't fill up permanently
    wishesArray.forEach(b => {
        if (!b.isLogo && !b.isDecorative) {
            b.targetRadius = Math.max(40 * viewportScale, b.targetRadius * 0.95);
        }
    });

    wishesArray.push({
        id: wish.id,
        el: bubbleWrapper,
        x, y, vx, vy,
        radius: 0, // Starts at 0, grows to targetRadius
        targetRadius: targetR,
        textSpan
    });
}

function updatePhysics() {
    for (let i = 0; i < wishesArray.length; i++) {
        let b = wishesArray[i];

        // Smooth radius transition
        b.radius += (b.targetRadius - b.radius) * 0.05;
        b.el.style.width = `${b.radius * 2}px`;
        b.el.style.height = `${b.radius * 2}px`;
        
        // Font size relative to radius: adjusted for polaroid
        if (b.textSpan) {
            b.textSpan.style.fontSize = `${b.radius * 0.35}px`;
        }

        // Update position
        b.x += b.vx;
        b.y += b.vy;

        // Apply drag (so they don't bounce too fast indefinitely)
        let speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        
        if (isAdmin) {
            // Apply heavy brakes in Admin Mode so they are easy to click
            if (speed > 0.2) {
                b.vx *= 0.85;
                b.vy *= 0.85;
            }
        } else {
            // Normal drifting speeds when not admin (Slowed down significantly to be smooth and readable)
            if (speed < 0.4) {
                b.vx *= 1.05;
                b.vy *= 1.05;
            } else if (speed > 1.5) {
                b.vx *= 0.95;
                b.vy *= 0.95;
            }
        }

        // Bounce off walls
        if (b.x - b.radius < 0) { b.x = b.radius; b.vx *= -1; }
        if (b.x + b.radius > window.innerWidth) { b.x = window.innerWidth - b.radius; b.vx *= -1; }
        if (b.y - b.radius < 0) { b.y = b.radius; b.vy *= -1; }
        if (b.y + b.radius > window.innerHeight) { b.y = window.innerHeight - b.radius; b.vy *= -1; }
    }

    // Collision detection
    for (let i = 0; i < wishesArray.length; i++) {
        for (let j = i + 1; j < wishesArray.length; j++) {
            let b1 = wishesArray[i];
            let b2 = wishesArray[j];
            
            let dx = b2.x - b1.x;
            let dy = b2.y - b1.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            // Multiply by 0.75 because the visual heart shape is smaller than the bounding circle
            // and has cutouts at the corners. This lets them collate closer.
            let minDistance = (b1.radius + b2.radius) * 0.75;

            if (distance < minDistance && distance > 0) {
                // Resolve overlap
                let overlap = minDistance - distance;
                let nx = dx / distance;
                let ny = dy / distance;
                
                b1.x -= nx * overlap * 0.5;
                b1.y -= ny * overlap * 0.5;
                b2.x += nx * overlap * 0.5;
                b2.y += ny * overlap * 0.5;

                // Bounce velocities softly
                let kx = (b1.vx - b2.vx);
                let ky = (b1.vy - b2.vy);
                let p = 2.0 * (nx * kx + ny * ky) / 2;
                // Add a small restitution coefficient
                b1.vx = b1.vx - p * nx * 0.8;
                b1.vy = b1.vy - p * ny * 0.8;
                b2.vx = b2.vx + p * nx * 0.8;
                b2.vy = b2.vy + p * ny * 0.8;
            }
        }
    }

    // Render positioning
    for (let i = 0; i < wishesArray.length; i++) {
        let b = wishesArray[i];
        if (b.isDecorative && b.rot !== undefined) {
            b.rot += b.rotSpeed;
            b.el.style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px) rotate(${b.rot}deg)`;
        } else {
            b.el.style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px)`;
        }
    }

    requestAnimationFrame(updatePhysics);
}

// Initialize persistent floating logo
function initLogo() {
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.classList.add('wish-bubble', 'logo-bubble');
    
    const img = document.createElement('img');
    img.src = '/logo.png'; 
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'contain';
    img.style.zIndex = '10';
    img.style.pointerEvents = 'none'; // so you can't accidentally click it out of frustration
    
    // Fallback if logo.png doesn't exist yet
    img.onerror = () => {
        bubbleWrapper.innerHTML = `
            <div style="background: rgba(255,255,255,0.9); border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #ff9a9e; font-size: 14px; text-align: center; padding: 10px;">
                Your Logo<br/>(logo.png)
            </div>`;
    };
    
    bubbleWrapper.appendChild(img);
    container.appendChild(bubbleWrapper);

    // Size of the logo
    let viewportScale = window.innerWidth < 600 ? 0.75 : 1;
    let targetR = 70 * viewportScale; 

    // Random initial placement
    const x = targetR + Math.random() * (window.innerWidth - targetR * 2);
    const y = targetR + Math.random() * (window.innerHeight - targetR * 2);
    
    const vx = (Math.random() - 0.5) * 2;
    const vy = (Math.random() - 0.5) * 2;

    wishesArray.push({
        id: 'persistent_logo',
        el: bubbleWrapper,
        x, y, vx, vy,
        radius: targetR,
        targetRadius: targetR,
        isLogo: true
    });
}

const glassIconSvgs = [
    // Star
    `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
    // Paper Plane
    `<line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>`,
    // Footprints
    `<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>`,
    // Mustache
    `<path d="M2 14c2.5-3 6-3 8-1 1.5 1.5 2.5 1.5 4 0 2-2 5.5-2 8 1-2 5-6 5-8 3-1.5-1-2.5-1-4 0-2 2-6 2-8-3z"/>`,
    // Tools
    `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`,
    // Watch
    `<circle cx="12" cy="12" r="7"/><polyline points="12 9 12 12 13.5 13.5"/><path d="M16.51 17.35l-.35 3.83a2 2 0 0 1-2 1.82H9.83a2 2 0 0 1-2-1.82l-.35-3.83m.01-10.7l.35-3.83A2 2 0 0 1 9.83 1h4.35a2 2 0 0 1 2 1.82l.35 3.83"/>`,
    // Crown
    `<polygon points="2 20 22 20 19 6 15 11 12 4 9 11 5 6 2 20"/>`,
    // Compass
    `<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>`
];

// Spawns permanent, decorative glassmorphism icons
function spawnDecorativeIcons(count) {
    for (let i = 0; i < count; i++) {
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.classList.add('glass-icon');
        
        const randomSvgContent = glassIconSvgs[Math.floor(Math.random() * glassIconSvgs.length)];
        bubbleWrapper.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${randomSvgContent}</svg>`;
        
        container.appendChild(bubbleWrapper);
        
        let targetR = 20 + Math.random() * 15; // Size between 20 and 35
        const x = targetR + Math.random() * (window.innerWidth - targetR * 2);
        const y = targetR + Math.random() * (window.innerHeight - targetR * 2);
        const vx = (Math.random() - 0.5) * 1.5; 
        const vy = (Math.random() - 0.5) * 1.5;
        
        bubbleWrapper.style.width = `${targetR * 2}px`;
        bubbleWrapper.style.height = `${targetR * 2}px`;
        
        wishesArray.push({
            id: 'decorative_' + i,
            el: bubbleWrapper,
            x, y, vx, vy,
            radius: targetR,
            targetRadius: targetR,
            isDecorative: true,
            rot: Math.random() * 360,
            rotSpeed: (Math.random() - 0.5) * 1.5
        });
    }
}

// Start visualizations
requestAnimationFrame(updatePhysics);
