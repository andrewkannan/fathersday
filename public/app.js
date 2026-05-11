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
        document.querySelector('.center-content').style.display = 'none';
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
    
    // Always persist the logo and decorative hearts whenever we refresh the screen from database state
    initLogo();
    spawnDecorativeHearts(12); // Spawn 12 background mini-hearts
    
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
            b.textSpan.style.fontSize = `${b.radius * 0.2}px`;
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
        b.el.style.transform = `translate(${b.x - b.radius}px, ${b.y - b.radius}px)`;
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

// Spawns permanent, small decorative stars
function spawnDecorativeHearts(count) {
    for (let i = 0; i < count; i++) {
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.classList.add('star');
        
        container.appendChild(bubbleWrapper);
        
        let targetR = 2 + Math.random() * 3; // Small size
        const x = targetR + Math.random() * (window.innerWidth - targetR * 2);
        const y = targetR + Math.random() * (window.innerHeight - targetR * 2);
        const vx = (Math.random() - 0.5) * 1; // Slower movement
        const vy = (Math.random() - 0.5) * 1;
        
        bubbleWrapper.style.width = `${targetR * 2}px`;
        bubbleWrapper.style.height = `${targetR * 2}px`;
        bubbleWrapper.style.background = '#c0c0c0'; // Silver color
        bubbleWrapper.style.opacity = 0.5 + Math.random() * 0.5;
        
        wishesArray.push({
            id: 'decorative_' + i,
            el: bubbleWrapper,
            x, y, vx, vy,
            radius: targetR,
            targetRadius: targetR,
            isDecorative: true
        });
    }
}

// Start visualizations
requestAnimationFrame(updatePhysics);
