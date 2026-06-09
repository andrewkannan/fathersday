const socket = io();

const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('admin-password');
const errorMsg = document.getElementById('login-error');
const wishesGrid = document.getElementById('wishes-grid');
const logoutBtn = document.getElementById('logout-btn');

loginBtn.addEventListener('click', () => {
    const pwd = passwordInput.value;
    socket.emit('admin_login', pwd, (response) => {
        if (response.success) {
            loginContainer.style.display = 'none';
            dashboardContainer.style.display = 'block';
            renderWishes(response.wishes);
        } else {
            errorMsg.style.display = 'block';
        }
    });
});

passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

logoutBtn.addEventListener('click', () => {
    window.location.reload();
});

socket.on('admin_new_wish', (wish) => {
    // Only add if we are logged in and looking at dashboard
    if (dashboardContainer.style.display === 'block') {
        const existing = document.getElementById(`wish-${wish.id}`);
        if (!existing) {
            appendWishCard(wish);
        }
    }
});

socket.on('admin_wish_approved', (wishId) => {
    removeWishCard(wishId);
});

socket.on('admin_wish_rejected', (wishId) => {
    removeWishCard(wishId);
});

function renderWishes(wishes) {
    wishesGrid.innerHTML = '';
    wishes.forEach(appendWishCard);
}

function appendWishCard(wish) {
    const card = document.createElement('div');
    card.className = 'wish-card';
    card.id = `wish-${wish.id}`;
    
    let html = '';
    if (wish.image) {
        html += `<img src="${wish.image}" alt="Attached photo" />`;
    }
    html += `<div class="wish-text">${wish.text}</div>`;
    
    html += `
        <div class="card-actions">
            <button class="approve-btn" onclick="approveWish('${wish.id}')">Approve</button>
            <button class="reject-btn" onclick="rejectWish('${wish.id}')">Reject</button>
        </div>
    `;
    
    card.innerHTML = html;
    wishesGrid.appendChild(card);
}

function removeWishCard(wishId) {
    const card = document.getElementById(`wish-${wishId}`);
    if (card) {
        card.remove();
    }
}

window.approveWish = function(wishId) {
    socket.emit('admin_approve_wish', wishId);
};

window.rejectWish = function(wishId) {
    if(confirm('Are you sure you want to permanently delete this wish?')) {
        socket.emit('admin_reject_wish', wishId);
    }
};
