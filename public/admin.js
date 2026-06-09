const socket = io();

const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginBtn = document.getElementById('login-btn');
const passwordInput = document.getElementById('admin-password');
const errorMsg = document.getElementById('login-error');
const wishesGrid = document.getElementById('wishes-grid');
const logoutBtn = document.getElementById('logout-btn');

const tabPending = document.getElementById('tab-pending');
const tabApproved = document.getElementById('tab-approved');

let pendingWishes = [];
let approvedWishes = [];
let currentTab = 'pending';

loginBtn.addEventListener('click', () => {
    const pwd = passwordInput.value;
    socket.emit('admin_login', pwd, (response) => {
        if (response.success) {
            loginContainer.style.display = 'none';
            dashboardContainer.style.display = 'block';
            pendingWishes = response.pendingWishes;
            approvedWishes = response.approvedWishes;
            renderGrid();
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

tabPending.addEventListener('click', () => {
    currentTab = 'pending';
    tabPending.classList.add('active');
    tabApproved.classList.remove('active');
    renderGrid();
});

tabApproved.addEventListener('click', () => {
    currentTab = 'approved';
    tabApproved.classList.add('active');
    tabPending.classList.remove('active');
    renderGrid();
});

socket.on('admin_new_wish', (wish) => {
    pendingWishes.push(wish);
    if (currentTab === 'pending' && dashboardContainer.style.display === 'block') {
        appendWishCard(wish);
    }
});

socket.on('admin_wish_approved', (wishId) => {
    const wishIndex = pendingWishes.findIndex(w => w.id === wishId);
    if (wishIndex !== -1) {
        const wish = pendingWishes.splice(wishIndex, 1)[0];
        wish.approved = true;
        approvedWishes.push(wish);
    }
    if (currentTab === 'pending') {
        removeWishCard(wishId);
    } else if (currentTab === 'approved' && dashboardContainer.style.display === 'block') {
        renderGrid();
    }
});

socket.on('admin_wish_rejected', (wishId) => {
    pendingWishes = pendingWishes.filter(w => w.id !== wishId);
    approvedWishes = approvedWishes.filter(w => w.id !== wishId);
    removeWishCard(wishId);
});

function renderGrid() {
    wishesGrid.innerHTML = '';
    const list = currentTab === 'pending' ? pendingWishes : approvedWishes;
    list.forEach(appendWishCard);
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
    
    html += `<div class="card-actions">`;
    if (currentTab === 'pending') {
        html += `<button class="approve-btn" onclick="approveWish('${wish.id}')">Approve</button>`;
    }
    html += `<button class="reject-btn" onclick="rejectWish('${wish.id}')">Delete</button>
        </div>`;
    
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
